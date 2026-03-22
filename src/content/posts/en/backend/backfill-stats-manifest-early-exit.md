---
title: Backfill Stats Manifest on Early Exit
description: 'When a job has an early exit path (e.g., "no work to do"), always save a'
date: 2026-01-27T00:00:00.000Z
updated: '2026-03-22'
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
source_content_hash: 6bdbe2cda15a40c9327deccc2af45394c3d7e3ec966ec3e8e147d1645d584718
expanded: true
---

I was debugging why our Slack notifications for the weekly backfill job were showing empty `0` values. The job had run successfully — "No missing hours found" in the logs — but the Slack callback was trying to read a stats manifest that didn't exist. The job's early exit path returned before saving any status information, leaving the downstream notification with nothing to display.

## The Problem

The backfill job had a clean early-exit path for when there was no work to do. The problem was that the stats manifest was only saved on the happy path — after actual processing. When the job exited early, no manifest was written:

```python
def execute(self):
    missing_data = read_missing_manifests(start_date, end_date)

    if not missing_data:
        self.logger.info("No missing hours found")
        return JobResult(status="success", total_records=0)  # ← Early exit

    # ... process data ...

    self._save_backfill_stats_manifest(stats)  # ← Never reached on early exit
```

The Slack callback runs after the job completes. It reads the manifest to build a meaningful notification: "Recovered 3 hours of data for Jan 20-26" or "No missing hours in date range." Without the manifest, it falls back to showing confusing `0` values with no context.

## The Fix

Save the manifest on every exit path, including early exits:

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

Now the Slack notification can display "No missing hours found in date range (Jan 20 - Jan 26)" instead of empty values. The cost of writing a small JSON file to S3 is negligible compared to the observability benefit.

## The Principle: Observability Over Optimization

This is a pattern that applies beyond ETL jobs. Any time a job or task has an early exit path, downstream consumers of that job's output (callbacks, dashboards, monitoring) need to know what happened. "Nothing to do" is meaningful information — it confirms the system checked and found everything in order.

The principle applies to:
- Any job with success callbacks (Slack, email, PagerDuty)
- Any job that might exit early without "doing work"
- ETL jobs with validation or skip logic
- Scheduled tasks that run on a timer but may not always have work

## Takeaway

When a job has multiple exit paths, save status information on every path — including "no work to do." The cost of writing a small status manifest is negligible. The benefit of always having meaningful data for monitoring, alerting, and human review is significant. Treat observability as a first-class requirement, not an afterthought that only applies to the happy path.

## References

- [Backfill — Airflow Documentation](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/backfill.html)
