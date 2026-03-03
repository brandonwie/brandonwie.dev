---
title: ETL Schedule Timing
description: How to choose the correct ETL schedule based on data arrival patterns.
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - devops
  - airflow
  - etl
  - scheduling
category: devops
draft: false
lang: en
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html
    title: Dag Runs — Airflow Documentation
    type: official
---

## Problem Context

**Scenario:** ETL job reporting "missing hours" but data actually exists in S3.

**Root Cause:** ETL schedule was set incorrectly - running before the last hour of data had arrived.

## Key Principle

**ETL schedule must account for:**

1. **Data arrival time** - When does the source system finish writing all data?
2. **Buffer time** - Add safety margin for network/processing delays
3. **Timezone consistency** - Ensure source, ETL, and schedule all use same timezone

## Amplitude ETL Example

### Data Arrival Pattern

Amplitude S3 Export writes hourly data files with ~1h 48min delay:

| Hour Range | Data Arrives | Delay |
| ---------- | ------------ | ----- |
| 00:00-00:59 | ~01:48 | ~1h 48min after hour ends |
| 01:00-01:59 | ~02:48 | ~1h 48min after hour ends |
| ... | ... | ... |
| **23:00-23:59** | **~01:48 next day** | ~1h 48min after hour ends |

**Key observation:** Last hour (23h) of day D arrives at **~01:48 UTC on day D+1**.

### Schedule Calculation

```text
Last data arrives:  ~01:48 UTC
Buffer needed:      ~1h 15min (safety margin)
Optimal schedule:   03:00 UTC
```

**Why this works:**

- Hour 23 data arrives: **01:48 UTC**
- ETL runs: **03:00 UTC**
- Buffer: **~1h 12min** (sufficient for network delays)

### Wrong Schedule Example

**Old schedule: 16:00 UTC**

```text
Hour 23 arrives:   01:48 UTC (day D+1)
ETL runs:          16:00 UTC (day D+1)
Problem:           ✅ Data exists, but... why so late?
                   14 hours after data arrival = inefficient
```

Even worse - if schedule was **01:00 UTC**:

```text
Hour 23 arrives:   01:48 UTC
ETL runs:          01:00 UTC (48min BEFORE arrival)
Result:            ❌ False "missing hours" detection
```

## General Formula

```python
ETL_schedule = last_hour_arrival + buffer_time

where:
  last_hour_arrival = observed time when final data file appears
  buffer_time = safety margin (typically 15min - 2h)
```

## Timezone Considerations

**CRITICAL:** All times must be in the same timezone.

### Example: KST Confusion

User initially thought: "We're in Korea, shouldn't we use KST for scheduling?"

**Wrong approach:**

```text
Last hour arrives: 10:48 KST (user observed in logs)
Schedule at:       12:00 KST (03:00 UTC)  ✓ Correct timing
But:               Amplitude project uses UTC
                   Airflow stores times in UTC
                   → Must think in UTC, not KST
```

**Correct approach:**

```text
Last hour arrives: 01:48 UTC (10:48 KST)
Schedule at:       03:00 UTC (12:00 KST)
All times in UTC:  ✓ No timezone conversion needed
```

### Validation Checklist

Before setting ETL schedule:

- [ ] Check source system's timezone setting
- [ ] Observe actual data arrival times (in UTC)
- [ ] Confirm Airflow DAG execution timezone (usually UTC)
- [ ] Calculate buffer in same timezone as observations
- [ ] Test schedule with manual trigger before production

## Implementation (Airflow)

```python
# amplitude_etl_dag.py
with DAG(
    dag_id="amplitude_etl_dag",
    schedule_interval="0 3 * * *",  # 03:00 UTC = 12:00 KST
    start_date=datetime(2026, 1, 20),
    catchup=False,
) as dag:
    # Processes yesterday_ds (day D) at 03:00 UTC on day D+1
    EXECUTION_DATE = "{{ dag_run.conf.get('execution_date', yesterday_ds) }}"
```

**Why `yesterday_ds`?**

- ETL runs at 03:00 UTC on day D+1
- Processes data from day D (yesterday)
- All 24 hours of day D are complete by 03:00 UTC on D+1

## Monitoring

Add checks to verify schedule is correct:

```python
# In Slack notification
if missing_hours:
    logger.warning(
        "Missing hours detected - check if schedule needs adjustment",
        date=execution_date,
        missing=missing_hours,
    )
```

**Expected behavior after fix:**

- **Normal operation:** 24/24 hours complete ✅
- **Amplitude outage:** Missing hours detected → backfill triggers ⚠️

## References

- Amplitude project 714756 timezone: UTC (confirmed 2026-01-27)
- S3 object timestamps: Observed in AWS Console
- Implementation: `arch-airflow/dags/amplitude_etl_dag.py`
