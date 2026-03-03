---
title: "Airflow DAG 수준 Callback"
description: "Airflow 2.x는 DAG 수준의 on_success_callback을 무시해요. task 수준 callback만 동작해요."
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - devops
  - airflow
  - callbacks
  - work
category: devops
draft: false
lang: ko
source_lang: en
source_slug: airflow-dag-level-callbacks
source_updated: "2026-01-23"
translation_date: "2026-03-04"
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/callbacks.html
    title: Callbacks — Airflow Documentation
    type: official
---

## 문제

```python
# DAG 수준의 on_success_callback은 Airflow 2.11.0에서 무시돼요
with DAG(
    dag_id='my_dag',
    on_success_callback=send_alert  # 아무 일도 안 함
) as dag:
    ...
```

에러도 발생하지 않아요. 모든 task가 성공해도 callback이 실행되지 않을 뿐이에요.

## 해결 방법

`on_success_callback`을 파이프라인의 **마지막 task**에 설정하면 돼요.

```python
# 마지막 task에 task 수준 callback 사용
last_task = SomeOperator(
    task_id='final_task',
    on_success_callback=send_alert,  # 이건 동작해요
)
```

## 핵심 포인트

- DAG 수준 `on_failure_callback`은 동작해요(task 실패 시)
- DAG 수준 `on_success_callback`은 동작하지 않아요(조용히 무시됨)
- 성공 알림을 보내려면 DAG의 마지막 task에 callback을 붙이면 돼요
- 이 동작은 Airflow 2.11.0에서 확인됐어요(다른 2.x 버전에서도 동일할 가능성 높음)

## 예시: amplitude_etl_dag

```python
# default_args로 모든 task의 실패를 처리
default_args = {
    'on_failure_callback': send_failure_alert,
}

with DAG('amplitude_etl', default_args=default_args):
    validate = PythonOperator(task_id='validate', ...)

    etl = DockerOperator(
        task_id='amplitude-etl',
        on_success_callback=send_success_alert,  # 성공 callback은 여기에
    )

    _ = validate >> etl
```

## 왜 중요한가

이걸 모르면 성공 알림이 왜 안 오는지 디버깅하느라 시간을 낭비할 수 있어요. DAG 수준 callback이 조용히 무시된다는 걸 모르는 채로요.
