---
title: Airflow DAG 수준 callback
description: Airflow 2.x는 DAG 수준의 on_success_callback을 조용히 무시해요. 성공 알림은 마지막 task에 붙여야 동작해요.
date: 2026-01-23T00:00:00.000Z
updated: '2026-03-22'
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
source_updated: '2026-03-22'
translation_date: '2026-05-10'
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/callbacks.html
    title: Callbacks — Airflow Documentation
    type: official
---

Airflow DAG에 Slack 알림을 붙였어요. 실패 알림은 잘 왔는데 성공 알림은 한 번도
안 왔어요. DAG는 멀쩡히 돌고 모든 task가 success로 끝나는데, 알림만 안 오는
거예요. Slack webhook도 확인하고, callback 함수도 검증하고, task 로그도 다
훑어봤어요. 다 정상이었어요. 문제는 따로 있었어요. Airflow 2.x에서는 DAG 수준의
`on_success_callback`이 조용히 무시돼요.

에러도 없고 경고도 없어요. callback 파라미터는 군말 없이 받아주고, 모든 task가
성공하면 그냥 완전히 무시돼요.

## 조용한 실패

겉으로는 멀쩡해 보이지만 동작하지 않는 코드예요.

```python
# DAG 수준의 on_success_callback은 Airflow 2.11.0에서 무시돼요
with DAG(
    dag_id='my_dag',
    on_success_callback=send_alert  # 아무 일도 안 해요
) as dag:
    ...
```

함정인 이유는 DAG 수준 `on_failure_callback`은 **동작한다**는 거예요. 두
callback을 같이 DAG 수준에 걸어두면, 실패 알림은 정상으로 오고 성공 알림만
조용히 사라져요. 이 비대칭이 진단을 어렵게 만들어요. 둘 다 같은 방식으로 도는
줄 알고 있고, 실패 callback이 잘 도는 걸로 메커니즘 자체는 동작한다는 게
증명돼버리니까, DAG 수준 성공 callback의 동작 자체를 의심하지 않게 돼요.

## 수정

`on_success_callback`을 파이프라인의 **마지막 task**로 옮겨요.

```python
# 마지막 task에 task 수준 callback 사용
last_task = SomeOperator(
    task_id='final_task',
    on_success_callback=send_alert,  # 동작해요
)
```

task 수준 callback은 성공/실패 둘 다 안정적으로 동작해요. 성공 callback을
마지막 task에 붙여두면 전체 파이프라인이 성공 종료될 때 알림을 받을 수 있어요.
마지막 task는 모든 upstream task가 성공해야만 성공할 수 있으니까요.

## 핵심 규칙

- DAG 수준 `on_failure_callback`은 **동작해요**(task 실패 시).
- DAG 수준 `on_success_callback`은 **동작하지 않아요**(조용히 무시됨).
- 성공 알림은 DAG의 마지막 task에 callback으로 붙이세요.
- Airflow 2.11.0에서 확인된 동작이고, 다른 2.x 버전에서도 같을 가능성이 높아요.

## 실제 패턴

Amplitude ETL DAG에 정착시킨 패턴이에요. 실패 처리는 `default_args`에 넣어서
모든 task가 받게 하고, 성공 callback은 마지막 task에만 붙여요.

```python
# default_args로 모든 task의 실패를 처리
default_args = {
    'on_failure_callback': send_failure_alert,
}

with DAG('amplitude_etl', default_args=default_args):
    validate = PythonOperator(task_id='validate', ...)

    etl = DockerOperator(
        task_id='amplitude-etl',
        on_success_callback=send_success_alert,  # 성공 callback은 여기
    )

    _ = validate >> etl
```

`default_args` 방식이면 모든 task가 실패 callback을 자동으로 가져가요. 반복해서
달 필요가 없어요. 성공 callback은 `etl`(마지막 task)에만 있으면 돼요. `validate`가
실패하면 파이프라인이 `etl`에 도달하기 전에 멈추니까, 성공 callback이 잘못
울릴 일도 없어요.

## 왜 이렇게 동작하는지

차이는 Airflow가 각 레벨에서 callback을 평가하는 방식에서 와요. DAG 수준
callback은 DagRun의 state 변화로 트리거되는데, 성공 state 전환은 Airflow 2.x에서
callback dispatch가 완전히 구현되지 않은 알려진 빈틈을 갖고 있어요. 반면 task
수준 callback은 TaskInstance의 state machine으로 트리거돼요. 이쪽은 성공/실패
전환 둘 다 제대로 처리해요.

## 정리

Airflow 성공 알림이 안 온다면, 우선 DAG 수준에 걸려 있는지 확인하세요.
`on_success_callback`을 파이프라인 마지막 task로 옮기면 끝이에요. Airflow 2.x의
조용하고 문서화도 안 된 빈틈을 한 줄 변경으로 메우는 거예요. 일반 규칙은 이래요.
실패 callback은 DAG 수준(`default_args` 경유)에, 성공 callback은 task 수준(마지막
task)에 두세요.

## References

- [Airflow Callbacks Documentation](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/callbacks.html)
