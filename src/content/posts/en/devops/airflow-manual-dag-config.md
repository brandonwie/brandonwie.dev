---
title: Airflow Manual DAG Config Pattern
description: Pattern for allowing manual DAG triggers with custom parameters while keeping
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - devops
  - airflow
  - dag
  - testing
category: devops
draft: false
lang: en
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html
    title: Apache Airflow DAG Runs Documentation
    type: official
source_content_hash: a4736f4eea2c20413f3aa397416a6e98c18e474b088ea2d5227ca9161ce21d73
---

scheduled runs unchanged.

## The Problem

When testing or reprocessing data in production Airflow, there was no obvious
way to manually trigger a DAG with custom parameters (like a specific date)
without affecting future scheduled runs. Hardcoding values risked polluting the
schedule, and Airflow Variables felt like overkill for one-off overrides.

Specifically, the requirements were:

- Manually trigger with custom dates/parameters
- Keep scheduled runs using default values
- Prevent manual configs from persisting across runs

---

## Difficulties Encountered

- **Jinja vs Python confusion** - `dag_run.conf` only works inside Jinja
  templates (double-curly braces). Trying to access it as a plain Python dict at
  DAG parse time fails silently or returns `None`, with no clear error pointing
  to the template requirement.
- **Default value complexity** - Simple defaults like `yesterday_ds` are
  straightforward, but date-range defaults involving `macros.timedelta()` and
  `.strftime()` require careful Jinja syntax that is hard to debug when wrong.
- **Config does not validate input** - `dag_run.conf` accepts any JSON without
  schema validation. A typo in the key name (e.g., `exec_date` instead of
  `execution_date`) silently falls through to the default value, making it look
  like the override did not work.
- **UI trigger button is not obvious** - The "Trigger DAG w/ config" option is a
  secondary button (play icon with gear), not the primary trigger. Easy to miss
  if you have never used it before.

---

## Solution: `dag_run.conf` Pattern

Use Airflow's built-in `dag_run.conf` dictionary to accept manual parameters
with fallback to defaults.

## Implementation

### Basic Pattern

```python
with DAG(
    dag_id="my_dag",
    schedule_interval="0 16 * * *",  # Daily at 16:00 UTC
    ...
) as dag:
    # Manual config support with fallback to default
    EXECUTION_DATE = "{{ dag_run.conf.get('execution_date', yesterday_ds) }}"
```

### Real-World Example: ETL DAG

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

### Real-World Example: Date Range DAG

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

## Usage in Airflow UI

### Step 1: Navigate to DAG

1. Open Airflow UI
2. Click DAG name

### Step 2: Trigger with Config

1. Click **"Trigger DAG w/ config"** button (play icon with gear)
2. Enter JSON:

```json
{
  "execution_date": "2026-01-25"
}
```

1. Click **"Trigger"**

### Example Configs

**Single date:**

```json
{
  "execution_date": "2026-01-25"
}
```

**Date range:**

```json
{
  "start_date": "2026-01-19",
  "end_date": "2026-01-25"
}
```

## Key Behaviors

| Aspect             | Behavior                                       |
| ------------------ | ---------------------------------------------- |
| **Isolation**      | Each DAG run has independent `dag_run.conf`    |
| **Persistence**    | Config applies **only to that run**, not saved |
| **Scheduled runs** | Always use default values (conf is empty dict) |
| **Manual runs**    | Use provided config or fall back to default    |

## Example: Multiple Runs

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

## Common Pitfalls

### ❌ Don't: Use persistent variables

```python
# BAD - This persists across runs!
EXECUTION_DATE = "2026-01-25"  # Hardcoded
```

### ❌ Don't: Modify DAG schedule based on config

```python
# BAD - schedule_interval is defined at DAG level, can't be dynamic
schedule_interval="{{ dag_run.conf.get('schedule', '@daily') }}"
```

### ✅ Do: Use Jinja templating

```python
# GOOD - Evaluated per run
EXECUTION_DATE = "{{ dag_run.conf.get('execution_date', yesterday_ds) }}"
```

### ✅ Do: Provide sensible defaults

```python
# GOOD - Scheduled runs work without config
START_DATE = '{{ dag_run.conf.get("start_date", (execution_date - macros.timedelta(days=10)).strftime("%Y-%m-%d")) }}'
```

## When to Use This Pattern

| Use Case                     | Appropriate?                      |
| ---------------------------- | --------------------------------- |
| Testing with specific dates  | ✅ Yes                            |
| Reprocessing historical data | ✅ Yes                            |
| Debugging production issues  | ✅ Yes                            |
| Changing DAG schedule        | ❌ No - use DAG definition        |
| Permanent config changes     | ❌ No - use environment variables |

---

## When NOT to Use

- **Permanent configuration changes** - If you need a value to persist across
  all runs, use environment variables or Airflow Variables instead of
  `dag_run.conf`.
- **Changing DAG scheduling** - `schedule_interval` is defined at DAG parse time
  and cannot be overridden via `dag_run.conf`.
- **Cross-DAG parameter sharing** - `dag_run.conf` is scoped to a single DAG
  run. Use Airflow Variables or XCom for sharing state across DAGs or tasks.
- **Automated reprocessing pipelines** - If backfills are routine and
  predictable, use `airflow dags backfill` CLI or a dedicated backfill DAG
  instead of manually triggering with config each time.

---

## References

- Airflow Documentation:
  [DAG Run Configuration](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html)
- Implementation: `arch-airflow/dags/amplitude_etl_dag.py`
- Implementation: `arch-airflow/dags/amplitude_weekly_backfill_dag.py`
