---
title: Airflow Manual DAG Config 패턴
description: 수동 DAG 트리거 시 커스텀 파라미터를 전달하면서도 예약 실행은 그대로 유지하는 패턴이에요.
date: 2026-01-27T00:00:00.000Z
updated: '2026-03-22'
tags:
  - devops
  - airflow
  - dag
  - testing
category: devops
draft: false
lang: ko
source_lang: en
source_slug: airflow-manual-dag-config
source_updated: '2026-03-22'
translation_date: '2026-05-10'
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html
    title: Apache Airflow DAG Runs 공식 문서
    type: official
---

프로덕션 Amplitude ETL 파이프라인에서 특정 날짜를 재처리해야 했어요. 날짜를
하드코딩하면 이후 예약 실행을 오염시킬 위험이 있었어요. Airflow Variable은
일회성 오버라이드에 쓰기엔 과한 느낌이었어요. 단 한 번의 실행에만 적용되고 이후
사라지는 파라미터 전달 방법이 필요했어요.

## 이게 왜 중요한가요

프로덕션 Airflow에서는 특정 날짜의 데이터를 재처리하거나, 커스텀 입력으로
DAG를 테스트하거나, 실패한 실행을 디버깅하기 위해 재실행하는 일이 자주
있어요. 문제는 정상 스케줄에 영향을 주지 않고 이걸 해야 한다는 점이에요.
하드코딩된 날짜는 코드에 남아요. Airflow Variable은 정리하지 않으면 실행
간에 지속돼요. 원하는 건 단 하나의 DAG 실행 동안만 존재하는 파라미터예요.

Airflow의 `dag_run.conf`가 정확히 이 역할을 해줘요. 각 수동 트리거에 JSON
설정을 같이 전달할 수 있고, 해당 실행에만 적용된 후 사라져요. 예약 실행은
빈 config를 보고 기본값으로 폴백해요.

## 까다로웠던 부분

첫 번째 걸림돌은 Jinja와 Python의 차이예요. `dag_run.conf`는 Jinja 템플릿
(이중 중괄호 문법) 안에서만 동작해요. DAG 파싱 시점에 일반 Python dict로
접근하면 조용히 실패하거나 `None`을 반환해요. 템플릿을 써야 한다는 걸
알려주는 에러 메시지도 없어요.

날짜 범위 기본값은 복잡도를 더 키워요. `yesterday_ds` 같은 단순한 기본값은
괜찮지만, "10일 전 날짜를 YYYY-MM-DD 형식으로" 계산하려면
`macros.timedelta()`와 `.strftime()`을 Jinja 표현식 안에 중첩해야 해요.
문법이 틀리면 유용한 에러가 나오지 않아요.

config는 입력 검증도 하지 않아요. `dag_run.conf`는 아무 JSON이나 받아요.
키 이름을 오타내면(예: `execution_date` 대신 `exec_date`) 조용히 기본값으로
폴백돼요. 오버라이드가 안 된 것처럼 보이지만 사실 키가 매칭되지 않은
거예요.

마지막으로 UI 트리거 버튼이 눈에 잘 띄지 않아요. "Trigger DAG w/ config"
옵션은 기어가 달린 재생 아이콘으로, 기본 트리거 버튼이 아니에요. 처음 쓰는
분이라면 놓치기 쉬워요.

## 패턴

Jinja 템플릿 안에서 `dag_run.conf.get()`을 폴백 기본값과 함께 써요.

```python
with DAG(
    dag_id="my_dag",
    schedule_interval="0 16 * * *",  # Daily at 16:00 UTC
    ...
) as dag:
    # Manual config support with fallback to default
    EXECUTION_DATE = "{{ dag_run.conf.get('execution_date', yesterday_ds) }}"
```

스케줄에 의해 트리거되면 `dag_run.conf`는 빈 dict이라서 `.get()`이
`yesterday_ds`를 반환해요. 수동으로 config와 함께 트리거하면 제공된 값을
써요.

## 실제 사례

단일 날짜를 처리하는 ETL DAG예요.

```python
# amplitude_etl_dag.py
with DAG(
    dag_id="amplitude_etl_dag",
    schedule_interval="0 16 * * *",
    ...
) as dag:
    # Scheduled: uses yesterday_ds
    # Manual: uses provided execution_date
    EXECUTION_DATE = "{{ dag_run.conf.get('execution_date', yesterday_ds) }}"

    task = DockerOperator(
        task_id="amplitude-etl",
        environment={
            "EXECUTION_DATE": EXECUTION_DATE,
            ...
        },
        ...
    )
```

날짜 범위를 처리하는 주간 백필 DAG예요.

```python
# amplitude_weekly_backfill_dag.py
with DAG(
    dag_id="amplitude_weekly_backfill_dag",
    schedule_interval="0 0 * * 3",  # Wednesday 00:00 UTC
    ...
) as dag:
    # Scheduled: calculates 10-4 days ago
    # Manual: uses provided start_date/end_date
    START_DATE = '{{ dag_run.conf.get("start_date", (execution_date - macros.timedelta(days=10)).strftime("%Y-%m-%d")) }}'
    END_DATE = '{{ dag_run.conf.get("end_date", (execution_date - macros.timedelta(days=4)).strftime("%Y-%m-%d")) }}'

    task = DockerOperator(
        task_id="amplitude-backfill",
        environment={
            "START_DATE": START_DATE,
            "END_DATE": END_DATE,
            ...
        },
        ...
    )
```

## Airflow UI에서 트리거하기

Airflow UI를 열고 DAG로 이동한 후 "Trigger DAG w/ config" 버튼(기어가 달린
재생 아이콘)을 클릭해요. JSON config를 입력해요.

단일 날짜의 경우.

```json
{
  "execution_date": "2026-01-25"
}
```

날짜 범위의 경우.

```json
{
  "start_date": "2026-01-19",
  "end_date": "2026-01-25"
}
```

"Trigger"를 클릭하면 해당 파라미터로 DAG가 실행돼요.

## 격리 동작 방식

각 DAG 실행은 독립적인 `dag_run.conf`를 가져요.

| 측면          | 동작                                        |
| ------------- | ------------------------------------------- |
| **격리**      | 각 DAG 실행은 독립적인 `dag_run.conf` 보유  |
| **지속성**    | config는 **해당 실행에만** 적용, 저장 안 됨 |
| **예약 실행** | 항상 기본값 사용 (conf는 빈 dict)           |
| **수동 실행** | 제공된 config 사용 또는 기본값으로 폴백     |

연속 세 번의 실행 예시예요.

```text
Run 1 (Scheduled):
  dag_run.conf = {}
  EXECUTION_DATE = yesterday_ds  ✓ default

Run 2 (Manual with config):
  dag_run.conf = {"execution_date": "2026-01-25"}
  EXECUTION_DATE = "2026-01-25"  ✓ override

Run 3 (Scheduled):
  dag_run.conf = {}
  EXECUTION_DATE = yesterday_ds  ✓ default again (no persistence)
```

Run 2의 수동 config는 Run 3에 전혀 영향을 주지 않아요. 각 실행은
독립적이에요.

## 흔한 실수

동적이어야 할 값을 하드코딩하면 안 돼요.

```python
# BAD - This persists across runs!
EXECUTION_DATE = "2026-01-25"  # Hardcoded
```

`schedule_interval`을 config로 동적으로 만들려 하면 안 돼요.

```python
# BAD - schedule_interval is defined at DAG level, can't be dynamic
schedule_interval="{{ dag_run.conf.get('schedule', '@daily') }}"
```

실행별 값에는 Jinja 템플릿을 쓰세요.

```python
# GOOD - Evaluated per run
EXECUTION_DATE = "{{ dag_run.conf.get('execution_date', yesterday_ds) }}"
```

config 없이도 예약 실행이 동작하도록 합리적인 기본값을 제공하세요.

```python
# GOOD - Scheduled runs work without config
START_DATE = '{{ dag_run.conf.get("start_date", (execution_date - macros.timedelta(days=10)).strftime("%Y-%m-%d")) }}'
```

## 실전 팁

`dag_run.conf`는 특정 날짜 테스트, 과거 데이터 재처리, 프로덕션 이슈
디버깅에 잘 맞아요. 지속되면 안 되는 일회성 파라미터 오버라이드에 맞는
도구예요.

영구적인 설정 변경(환경 변수나 Airflow Variable 사용), DAG 스케줄
변경(파싱 시점에 정의됨), DAG 간 파라미터 공유(Airflow Variable이나 XCom
사용), 자동화된 재처리 파이프라인(`airflow dags backfill` CLI 사용)에는
맞지 않아요.

핵심 인사이트는 `dag_run.conf`가 단일 실행에 스코핑된다는 점이에요. 그 스코핑
자체가 핵심이에요. 스케줄을 오염시킬 위험 없이 수동 오버라이드를 가능하게
해줘요.
