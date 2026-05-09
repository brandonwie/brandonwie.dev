---
title: 조기 종료 시 Backfill 통계 매니페스트
description: >-
  조기 종료 경로가 있는 작업에서는 항상 stats/status 매니페스트를 저장해서 다운스트림 콜백이 유의미한 정보를 표시할 수 있게 해야
  해요.
date: 2026-01-27T00:00:00.000Z
updated: '2026-03-22'
tags:
  - backend
  - etl
  - slack
category: backend
draft: false
lang: ko
source_lang: en
source_slug: backfill-stats-manifest-early-exit
source_updated: '2026-03-22'
translation_date: '2026-05-10'
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/backfill.html
    title: Backfill — Airflow Documentation
    type: official
---

매주 도는 backfill 작업의 Slack 알림이 빈 `0` 값을 뱉는 이유를 찾고 있었어요.
작업 자체는 멀쩡히 success로 끝났고 로그에도 "No missing hours found"가 찍혀
있었는데, Slack 콜백이 존재하지도 않는 stats 매니페스트를 읽으려고 한 거예요.
조기 종료 경로가 어떤 상태 정보도 저장하지 않고 그냥 return으로 빠져버려서,
다운스트림 알림에 보여줄 게 아무것도 없는 상태였죠.

## 문제

backfill 작업에는 "할 일 없음"인 경우를 위한 조기 종료 경로가 있었어요. 문제는
stats 매니페스트가 happy path에서만 저장된다는 거였어요. 처리할 데이터가 있을
때만 매니페스트가 쓰이고, 일찍 빠져나가면 아무것도 안 남았거든요.

```python
def execute(self):
    missing_data = read_missing_manifests(start_date, end_date)

    if not missing_data:
        self.logger.info("No missing hours found")
        return JobResult(status="success", total_records=0)  # ← 조기 종료

    # ... 데이터 처리 ...

    self._save_backfill_stats_manifest(stats)  # ← 조기 종료 시 도달하지 않음
```

Slack 콜백은 작업이 끝난 뒤에 매니페스트를 읽고 의미 있는 알림을 만들어요.
"1월 20-26일치 누락분 3시간 복구" 같은 메시지요. 매니페스트가 없으면 콜백은
폴백으로 빈 `0`을 던져버려요. 맥락 없는 숫자만 남는 거예요.

## 수정

모든 종료 경로에서 매니페스트를 저장하면 돼요. 조기 종료에도요.

```python
def execute(self):
    missing_data = read_missing_manifests(start_date, end_date)

    if not missing_data:
        self.logger.info("No missing hours found")

        # Slack 콜백이 표시할 데이터를 위해 통계 저장
        stats = {
            "start_date": start_date,
            "end_date": end_date,
            "dates_processed": 0,
            "hours_recovered": 0,
            "still_missing": {},
            "message": "No missing hours found in date range",
        }
        self._save_backfill_stats_manifest(stats)

        return JobResult(status="success", total_records=0)
```

이제 Slack 알림이 빈 값 대신 "1월 20-26일 범위에 누락된 시간 없음"을 보여줘요.
S3에 작은 JSON 파일 하나 쓰는 비용은 관측성을 얻는 가치에 비하면 거의 0이에요.

## 원칙: 최적화보다 관측성

이 패턴은 ETL을 넘어서도 통해요. 어떤 작업이든 조기 종료 경로가 있으면, 그
출력의 다운스트림 소비자(콜백, 대시보드, 모니터링)는 무슨 일이 있었는지 알아야
해요. "할 일 없음"도 의미 있는 정보예요. 시스템이 확인했고 모든 게 정상이라고
확정해준 거니까요.

이런 케이스에 적용해요.

- 성공 콜백이 붙은 모든 작업(Slack, 이메일, PagerDuty)
- "할 일 없음"으로 일찍 끝날 수 있는 모든 작업
- validation이나 skip 로직이 있는 ETL 작업
- 타이머로 도는데 매번 일이 있는 건 아닌 스케줄링 작업

## 정리

종료 경로가 여러 개인 작업에서는 모든 경로마다 상태 정보를 저장하세요. "할 일
없음" 경로도 포함이에요. 작은 status 매니페스트 쓰는 비용은 거의 무시할 만하고,
모니터링과 사람의 리뷰를 위해 항상 의미 있는 데이터가 남아 있다는 이점은 커요.
관측성을 happy path에만 붙이는 사후 단계가 아니라, first-class 요구사항으로
다뤄야 해요.

## References

- [Backfill — Airflow Documentation](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/backfill.html)
