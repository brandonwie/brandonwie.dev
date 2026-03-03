---
title: "조기 종료 시 Backfill 통계 매니페스트"
description: "조기 종료 경로가 있는 작업에서는 항상 stats/status 매니페스트를 저장해서 다운스트림 콜백이 유의미한 정보를 표시할 수 있게 해야 해요."
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - backend
  - etl
  - slack
category: backend
draft: false
lang: ko
source_lang: en
source_slug: backfill-stats-manifest-early-exit
source_updated: "2026-01-27"
translation_date: "2026-03-04"
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/backfill.html
    title: Backfill — Airflow Documentation
    type: official
---

## 문제

```python
def execute(self):
    missing_data = read_missing_manifests(start_date, end_date)

    if not missing_data:
        self.logger.info("No missing hours found")
        return JobResult(status="success", total_records=0)  # ← 조기 종료

    # ... 데이터 처리 ...

    self._save_backfill_stats_manifest(stats)  # ← 조기 종료 시 도달하지 않음
```

**결과:** Slack 콜백이 존재하지 않는 매니페스트를 읽으려고 해요. 비어있거나 혼란스러운 `0` 값이 표시돼요.

## 해결 방법

조기 종료 시에도 항상 매니페스트를 저장하세요:

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

## 핵심 원칙

**최적화보다 관측 가능성.** 작은 JSON 매니페스트를 S3에 쓰는 비용은 무시할 수 있어요. 모니터링/알림을 위해 항상 상태 정보가 있는 것의 이점은 크죠.

## 적용 대상

- 성공 콜백이 있는 모든 작업(Slack, 이메일 등)
- "할 일이 없어서" 조기 종료할 수 있는 모든 작업
- 유효성 검사/스킵 로직이 있는 ETL 작업
