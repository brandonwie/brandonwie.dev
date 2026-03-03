---
title: Backfill Stats Manifest on Early Exit
description: >-
  When a job has an early exit path (e.g., "no work to do"), always save a
  stats/status manifest so downstream callbacks can display meaningful
  information.
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - backend
  - etl
  - slack
category: backend
draft: false
lang: en
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/backfill.html
    title: Backfill — Airflow Documentation
    type: official
---

## The Problem

```python
def execute(self):
    missing_data = read_missing_manifests(start_date, end_date)

    if not missing_data:
        self.logger.info("No missing hours found")
        return JobResult(status="success", total_records=0)  # ← Early exit

    # ... process data ...

    self._save_backfill_stats_manifest(stats)  # ← Never reached on early exit
```

**Result:** Slack callback tries to read manifest that doesn't exist → shows empty/confusing `0` values.

## The Fix

Always save the manifest, even on early exit:

```python
def execute(self):
    missing_data = read_missing_manifests(start_date, end_date)

    if not missing_data:
        self.logger.info("No missing hours found")

        # Save stats so Slack callback has data to display
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

## Key Principle

**Observability over optimization.** The cost of writing a small JSON manifest to S3 is negligible. The benefit of always having status information for monitoring/alerting is significant.

## Applies To

- Any job with success callbacks (Slack, email, etc.)
- Any job that might exit early without "doing work"
- ETL jobs with validation/skip logic
