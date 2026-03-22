---
title: Airflow Celery Worker 로그 서버 설정
description: >-
  CeleryExecutor를 사용할 때 워커가 별도 머신에 있으면 웹서버가 HTTP로 로그를 가져와야 합니다. hostname 설정이
  잘못되면 로그 URL에 호스트가 비어서 에러가 납니다.
date: 2026-01-27T00:00:00.000Z
updated: '2026-03-22'
tags:
  - devops
  - airflow
  - celery
  - logging
category: devops
draft: false
lang: ko
source_lang: en
source_slug: airflow-celery-worker-log-server
source_updated: '2026-03-22'
translation_date: '2026-02-12'
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/logging-tasks.html
    title: Airflow Task Logging 공식 문서
    type: official
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/executor/celery.html
    title: Airflow Celery Executor 공식 문서
    type: official
---

Airflow UI에서 "View Log"를 클릭했는데 task 로그 대신 빈 에러 페이지가
나왔습니다. URL을 보니 `http://:8793/log/...`로 호스트가 비어 있었어요. 보안
그룹이랑 네트워크 경로를 한 시간 동안 확인했는데, 알고 보니 문제는 네트워크가
아니라 Airflow의 hostname 설정이었습니다.

## 이게 왜 중요한가요

Airflow를 CeleryExecutor로 운영하면서 워커를 별도 EC2 인스턴스에 두면,
웹서버가 워커로부터 HTTP를 통해 8793 포트로 task 로그를 가져옵니다. 각 워커는
자체 로그 파일을 제공하는 작은 로그 서버를 실행해요. 웹서버는 워커가 Celery
result backend에 알린 hostname으로 URL을 구성합니다. 이 hostname이 비어있거나
잘못되면 웹서버는 로그를 어디서 가져와야 할지 알 수 없습니다.

프로덕션 Airflow에서 스케줄러와 웹서버가 한 머신에 있고 워커가 별도 EC2
인스턴스에서 연산 집약적 작업을 처리하는 구성은 흔한 시나리오입니다.

## 에러 내용

hostname이 잘못 설정되면 Airflow UI에서 이런 에러가 나옵니다:

```text
Invalid URL 'http://:8793/log/dag_id=my_dag/...' No host supplied
```

`worker-hostname:8793` 대신 `:8793`으로 호스트가 비어있다는 건, 워커가 Celery
result backend에 hostname을 제대로 알려주지 않고 있다는 뜻입니다.

## 디버깅이 어려웠던 이유

에러 메시지가 오해를 불러일으킵니다. "No host supplied"는 URL 파싱 문제처럼
읽히기 때문에 처음에는 네트워크 연결, DNS 해석, 보안 그룹을 확인했어요. 전부
문제가 아니었습니다.

Docker 컨테이너 안에서 Airflow는 hostname을 자동 감지하려고 시도합니다.
이게 조용히 실패해서 에러를 발생시키는 대신 빈 문자열을 반환해요. 로그에
감지 실패 경고도 없습니다. 로그를 가져오려는 시점에서야 깨진 URL을 보게
됩니다.

진짜 어려운 점은 세 가지 설정이 맞아야 한다는 것입니다. 컨테이너의
`hostname`, `WORKER_LOG_SERVER_HOST` 환경 변수, 마스터의 `extra_hosts` 매핑
중 하나라도 빠지면 같은 불투명한 에러가 발생합니다. 대부분의 문서가 워커 쪽
설정에 집중하기 때문에 웹서버/스케줄러 쪽의 `extra_hosts` 매핑은 놓치기
쉽습니다.

## 근본 원인

세 가지 설정이 워커 로그 서빙을 제어합니다:

| 설정                     | 용도                   | 기본값               |
| ------------------------ | ---------------------- | -------------------- |
| `hostname`               | 컨테이너 hostname      | 자동 감지            |
| `WORKER_LOG_SERVER_PORT` | 로그 서버 포트         | `8793`               |
| `WORKER_LOG_SERVER_HOST` | 워커가 알리는 hostname | **없음** (자동 감지) |

`WORKER_LOG_SERVER_HOST`가 설정되지 않으면 Airflow가 hostname을 자동 감지하려고
합니다. Docker 컨테이너 안에서는 이게 실패하거나 쓸 수 없는 값을 반환하는
경우가 많습니다.

## 해결 방법

워커 쪽 `docker-compose.yml`에서 세 가지를 모두 명시적으로 설정합니다:

```yaml
services:
  worker:
    hostname: airflow-worker-1 # 컨테이너 hostname
    environment:
      AIRFLOW__LOGGING__WORKER_LOG_SERVER_PORT: "8793"
      AIRFLOW__LOGGING__WORKER_LOG_SERVER_HOST: "airflow-worker-1" # hostname과 일치해야 함
```

마스터 쪽에서는 `extra_hosts`를 추가해서 웹서버와 스케줄러가 워커 hostname을
실제 IP로 resolve할 수 있게 합니다:

```yaml
services:
  webserver:
    extra_hosts:
      - "airflow-worker-1:10.10.5.10" # 워커의 private IP
  scheduler:
    extra_hosts:
      - "airflow-worker-1:10.10.5.10"
```

`WORKER_LOG_SERVER_HOST` 값은 `hostname` 설정과 정확히 일치해야 합니다.
마스터의 `extra_hosts`는 해당 hostname을 워커의 private IP로 매핑해야 합니다.
보안 그룹에서 마스터와 워커 사이에 8793 포트가 열려 있어야 합니다.

## 이렇게 동작하는 이유

워커가 `airflow-worker-1`을 hostname으로 Celery result backend에 알립니다.
웹서버가 로그를 가져올 때 `http://airflow-worker-1:8793/log/...` URL을
구성합니다. `extra_hosts` 항목이 `airflow-worker-1`을 `10.10.5.10`으로
resolve해서 HTTP 요청이 올바른 머신에 도달합니다.

명시적 설정 없이는 Docker가 빈 문자열이나 내부 전용 hostname을 반환하기
때문에 웹서버가 네트워크를 통해 resolve할 수 없습니다.

## 확인 방법

설정 적용 후 로그 URL에 올바른 hostname이 표시되어야 합니다:

```text
http://airflow-worker-1:8793/log/dag_id=my_dag/...
```

이렇게 나오면 안 됩니다:

```text
http://:8793/log/dag_id=my_dag/...
```

## 실전 팁

이 설정은 CeleryExecutor를 사용하는 모든 멀티 노드 Airflow 배포에 필요합니다.
별도 EC2 인스턴스든 별도 Docker 호스트든 마찬가지입니다.

단일 노드 Airflow(LocalExecutor), 관리형 Airflow(MWAA, Cloud Composer),
KubernetesExecutor(Kubernetes API로 로그를 가져옴), S3/GCS 원격 로그
저장소(웹서버가 클라우드 버킷에서 직접 읽음)를 사용하는 경우에는 이 설정이
필요 없습니다.

주의할 점이 하나 있어요. 워커 IP가 변경되면(인스턴스 교체 등) 마스터의
`extra_hosts` 매핑도 업데이트해야 합니다. 동적 환경에서는 서비스 디스커버리
메커니즘을 사용하거나 원격 로그 저장소로 전환하는 것을 고려해 보세요.
