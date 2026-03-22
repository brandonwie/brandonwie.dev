---
title: Airflow DAG start_date와 수동 트리거
description: 'DAG를 수동으로 트리거할 때, 트리거 날짜가 start_date보다 이전이면 Airflow가 task 실행을 건너뛸 수 있어요.'
date: 2026-01-27T00:00:00.000Z
updated: '2026-03-22'
tags:
  - devops
  - airflow
category: devops
draft: false
lang: ko
source_lang: en
source_slug: airflow-dag-start-date
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html
    title: Dag Runs — Airflow Documentation
    type: official
---

## 문제

미래 날짜로 `start_date`를 설정한 DAG가 있어요.

```python
with DAG(
    dag_id="my_dag",
    start_date=datetime(2026, 1, 29),  # 미래 날짜
    ...
) as dag:
```

2026-01-27에 수동으로 트리거하면:

- 트리거 날짜(2026-01-27)가 start_date(2026-01-29)보다 이전
- Airflow가 **task를 실행하지 않고** DAG run을 성공으로 표시
- DAG가 ~0.02초 만에 끝남(실제 작업 없음)

## 증상

- DAG run이 즉시 "success" 표시(1초 미만 소요)
- task 실행 로그 없음
- Docker 컨테이너 시작 안 됨(DockerOperator의 경우)
- 스케줄러 로그에 "tasks up for execution" 항목 없음
- callback이 실행되지 않음(Slack 알림 없음)

## 해결 방법

어떤 트리거 날짜보다도 항상 이전인 안전한 과거 날짜를 사용하면 돼요.

```python
with DAG(
    dag_id="my_dag",
    start_date=datetime(2024, 1, 1),  # 안전한 과거 날짜
    ...
) as dag:
```

## 베스트 프랙티스

| 접근법         | 장점                | 단점                       |
| -------------- | ------------------- | -------------------------- |
| `2024-01-01`   | 간단하고, 항상 동작 | 임의적으로 보임            |
| 실제 배포 날짜 | 의미론적으로 적절   | 수동 트리거가 깨질 수 있음 |
| 미래 날짜      | 예정된 실행 방지    | **수동 트리거가 깨짐**     |

모든 DAG에서 일관성과 안정성을 위해 `datetime(2024, 1, 1)`을 표준 규칙으로 사용하는 걸 추천해요.

## 예정된 실행에 대한 참고

`start_date`는 주로 **예정된** 실행 시작 시점을 제어해요. `catchup=False`인 DAG에서는 Airflow가 `start_date` 이전의 실행을 생성하지 않아요. 과거 날짜를 사용해도 원치 않는 예정 실행이 발생하지 않아요.
