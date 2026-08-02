---
title: ETL 스케줄 타이밍
description: 데이터 도착 패턴에 맞는 ETL 스케줄을 설정하는 방법을 알아봐요.
date: 2026-01-27T00:00:00.000Z
updated: '2026-08-02'
tags:
  - devops
  - airflow
  - etl
  - scheduling
category: devops
draft: false
lang: ko
source_lang: en
source_slug: etl-schedule-timing
source_updated: '2026-08-02'
translation_date: '2026-03-04'
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html
    title: Dag Runs — Airflow Documentation
    type: official
---

## 문제 상황

**시나리오:** 제가 관리하던 ETL 작업이 "누락된 시간"을 보고하는데, 실제로 S3에 데이터는 존재해요.

**근본 원인:** 제가 설정한 ETL 스케줄이 잘못돼 있었어요. 마지막 시간대의 데이터가 도착하기 전에 실행되고 있었죠.

## 핵심 원칙

**ETL 스케줄에서 고려해야 할 것들:**

1. **데이터 도착 시간** - 소스 시스템이 모든 데이터를 언제 다 쓰는지
2. **버퍼 시간** - 네트워크/처리 지연에 대한 안전 마진 추가
3. **타임존 일관성** - 소스, ETL, 스케줄 모두 같은 타임존을 사용하는지 확인

## Amplitude ETL 예시

### 데이터 도착 패턴

Amplitude S3 Export는 약 1시간 48분의 지연으로 시간별 데이터 파일을 써요.

| 시간 범위       | 데이터 도착        | 지연                     |
| --------------- | ------------------ | ------------------------ |
| 00:00-00:59     | ~01:48             | 시간 종료 후 ~1시간 48분 |
| 01:00-01:59     | ~02:48             | 시간 종료 후 ~1시간 48분 |
| ...             | ...                | ...                      |
| **23:00-23:59** | **~다음 날 01:48** | 시간 종료 후 ~1시간 48분 |

**핵심 관찰:** D일의 마지막 시간(23시) 데이터는 **D+1일 ~01:48 UTC**에 도착해요.

### 스케줄 계산

```text
마지막 데이터 도착:  ~01:48 UTC
필요한 버퍼:        ~1시간 15분 (안전 마진)
최적 스케줄:        03:00 UTC
```

**이렇게 동작해요:**

- 23시 데이터 도착: **01:48 UTC**
- ETL 실행: **03:00 UTC**
- 버퍼: **~1시간 12분** (네트워크 지연에 충분)

### 잘못된 스케줄 예시

**이전 스케줄: 16:00 UTC**

```text
23시 데이터 도착:   01:48 UTC (D+1일)
ETL 실행:          16:00 UTC (D+1일)
문제:              ✅ 데이터는 있지만... 왜 이렇게 늦게?
                   데이터 도착 후 14시간 = 비효율적
```

더 심각한 경우 - 스케줄이 **01:00 UTC**였다면:

```text
23시 데이터 도착:   01:48 UTC
ETL 실행:          01:00 UTC (도착 48분 전에 실행)
결과:              ❌ 거짓 "누락된 시간" 감지
```

## 일반 공식

```python
ETL_schedule = last_hour_arrival + buffer_time

where:
  last_hour_arrival = 마지막 데이터 파일이 나타나는 관찰된 시간
  buffer_time = 안전 마진 (보통 15분 - 2시간)
```

## 타임존 고려사항

**중요:** 모든 시간은 같은 타임존이어야 해요.

### 예시: KST 혼동

처음에는 이렇게 생각했어요. "KST가 제 로컬 타임존이니까 KST로 스케줄링하면 되지 않을까?"

**잘못된 접근:**

```text
마지막 시간 도착: 10:48 KST (로그에서 관찰)
스케줄 설정:     12:00 KST (03:00 UTC)  ✓ 타이밍은 맞음
그런데:          Amplitude 프로젝트는 UTC 사용
                 Airflow는 UTC로 시간 저장
                 → KST가 아니라 UTC로 생각해야 해요
```

**올바른 접근:**

```text
마지막 시간 도착: 01:48 UTC (10:48 KST)
스케줄 설정:     03:00 UTC (12:00 KST)
모든 시간을 UTC로: ✓ 타임존 변환 필요 없음
```

### 검증 체크리스트

ETL 스케줄 설정 전:

- [ ] 소스 시스템의 타임존 설정 확인
- [ ] 실제 데이터 도착 시간 관찰 (UTC 기준)
- [ ] Airflow DAG 실행 타임존 확인 (보통 UTC)
- [ ] 관찰과 같은 타임존으로 버퍼 계산
- [ ] 프로덕션 적용 전 수동 트리거로 스케줄 테스트

## 구현 (Airflow)

```python
# amplitude_etl_dag.py
with DAG(
    dag_id="amplitude_etl_dag",
    schedule_interval="0 3 * * *",  # 03:00 UTC = 12:00 KST
    start_date=datetime(2026, 1, 20),
    catchup=False,
) as dag:
    # D+1일 03:00 UTC에 전날(D일) yesterday_ds를 처리
    EXECUTION_DATE = "{{ dag_run.conf.get('execution_date', yesterday_ds) }}"
```

**왜 `yesterday_ds`를 쓸까?**

- ETL은 D+1일 03:00 UTC에 실행돼요
- D일(어제)의 데이터를 처리해요
- D일의 24시간 전체가 D+1일 03:00 UTC까지 완료돼요

## 모니터링

스케줄이 올바른지 검증하는 체크를 추가하세요:

```python
# Slack 알림에서
if missing_hours:
    logger.warning(
        "Missing hours detected - check if schedule needs adjustment",
        date=execution_date,
        missing=missing_hours,
    )
```

**수정 후 예상 동작:**

- **정상 운영:** 24/24 시간 완료 ✅
- **Amplitude 장애:** 누락 시간 감지 → backfill 트리거 ⚠️

## 참고

- [Airflow DAG Runs 문서](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html)
- 소스 프로젝트 타임존은 UTC로 설정돼 있었고, S3 객체 타임스탬프는 AWS
  Console에서 직접 확인했어요 (2026-01-27 기준).
