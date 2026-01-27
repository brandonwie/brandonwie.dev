---
title: 'Airflow Celery Worker 로그 서버 설정'
description: >-
  CeleryExecutor를 사용할 때 워커가 별도 머신에 있으면 웹서버가 HTTP로 로그를 가져와야 합니다. hostname 설정이 잘못되면 로그 URL에 호스트가 비어서 에러가 납니다.
date: 2026-01-27T00:00:00.000Z
updated: '2026-01-28'
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
source_updated: 2026-01-27T00:00:00.000Z
translation_date: '2026-01-28'
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

## 문제 상황

Airflow UI에서 task 로그를 볼 때 이런 에러가 나옵니다:

```text
Invalid URL 'http://:8793/log/dag_id=my_dag/...' No host supplied
```

호스트가 비어있다는 건 (`worker-hostname:8793` 대신 `:8793`) 워커가 Celery result backend에 hostname을 제대로 알려주지 않고 있다는 뜻입니다.

## 원인

세 가지 설정이 워커 로그 서빙을 제어합니다:

| 설정 | 용도 | 기본값 |
| ---- | ---- | ------ |
| `hostname` | 컨테이너 hostname | 자동 감지 |
| `WORKER_LOG_SERVER_PORT` | 로그 서버 포트 | `8793` |
| `WORKER_LOG_SERVER_HOST` | 워커가 알리는 hostname | **없음** (자동 감지) |

`WORKER_LOG_SERVER_HOST`가 설정되지 않으면 Airflow가 hostname을 자동 감지하려고 합니다. Docker 컨테이너 안에서는 이게 실패하거나 쓸 수 없는 값을 반환하는 경우가 많습니다.

## 해결 방법

`docker-compose.yml`에서 세 가지를 모두 명시적으로 설정합니다:

```yaml
services:
  worker:
    hostname: airflow-worker-1  # 컨테이너 hostname
    environment:
      AIRFLOW__LOGGING__WORKER_LOG_SERVER_PORT: '8793'
      AIRFLOW__LOGGING__WORKER_LOG_SERVER_HOST: 'airflow-worker-1'  # hostname과 일치해야 함
```

마스터 쪽에서는 `extra_hosts`를 추가해서 웹서버가 워커 hostname을 resolve할 수 있게 합니다:

```yaml
services:
  webserver:
    extra_hosts:
      - "airflow-worker-1:10.10.5.10"  # 워커의 private IP
  scheduler:
    extra_hosts:
      - "airflow-worker-1:10.10.5.10"
```

## 핵심 포인트

- `WORKER_LOG_SERVER_HOST`는 `hostname` 설정과 일치해야 함
- 마스터의 `extra_hosts`가 hostname을 워커의 실제 IP로 매핑해야 함
- 마스터와 워커 사이에 8793 포트가 열려있어야 함 (security group)
- 워커 IP가 바뀌면 마스터의 `extra_hosts`도 업데이트해야 함

## 확인 방법

설정 후 로그 URL이 이렇게 보여야 합니다:

```text
http://airflow-worker-1:8793/log/dag_id=my_dag/...
```

이렇게 나오면 안 됩니다:

```text
http://:8793/log/dag_id=my_dag/...
```
