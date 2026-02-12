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
---

I needed to reprocess a specific date in our production Amplitude ETL pipeline.
Hardcoding the date would risk polluting future scheduled runs. Using Airflow
Variables felt like overkill for a one-off override. I wanted a way to trigger a
DAG with custom parameters that vanish after that single run.

## Why This Matters

In production Airflow, you frequently need to reprocess data for a specific
date, test a DAG with custom inputs, or debug an issue by replaying a failed
run. The challenge is doing this without leaving any trace that affects the
normal schedule. A hardcoded date stays in the code. An Airflow Variable
persists across runs unless you remember to clean it up. What you want is a
parameter that lives only for the duration of one DAG run.

Airflow's `dag_run.conf` does exactly this. Each manual trigger can carry a JSON
configuration that is scoped to that single run and disappears afterward.
Scheduled runs see an empty config and fall back to defaults.

## What Made This Tricky

The first stumbling block is Jinja vs. Python. `dag_run.conf` only works inside
Jinja templates (the double-curly-brace syntax). If you try to access it as a
plain Python dict at DAG parse time, it fails silently or returns `None`. There
is no error message pointing you toward the template requirement.

Date-range defaults add another layer of complexity. Simple defaults like
`yesterday_ds` are straightforward, but calculating "10 days ago formatted as
YYYY-MM-DD" requires `macros.timedelta()` and `.strftime()` nested inside a
Jinja expression. Getting the syntax wrong produces no useful error.

The config also does not validate input. `dag_run.conf` accepts any JSON. If you
typo a key name (e.g., `exec_date` instead of `execution_date`), it silently
falls through to the default value. It looks like the override did not work, but
really the key just did not match.

Finally, the UI trigger button is not obvious. The "Trigger DAG w/ config"
option is a secondary button (the play icon with a gear), not the primary
trigger. Easy to miss if you have never used it.

## The Pattern

Use `dag_run.conf.get()` inside a Jinja template with a fallback default:

```python
with DAG(
    dag_id="my_dag",
    schedule_interval="0 16 * * *",  # Daily at 16:00 UTC
    ...
) as dag:
    # Manual config support with fallback to default
    EXECUTION_DATE = "{{ dag_run.conf.get('execution_date', yesterday_ds) }}"
```

When triggered via schedule, `dag_run.conf` is an empty dict, so `.get()`
returns `yesterday_ds`. When triggered manually with a config, it uses the
provided value.

## Real-World Examples

Here is an ETL DAG that processes a single date:

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

And a weekly backfill DAG that processes a date range:

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

## Triggering from the Airflow UI

Open the Airflow UI, navigate to your DAG, and click the "Trigger DAG w/
config" button (the play icon with a gear). Enter your JSON config:

For a single date:

```json
{
  "execution_date": "2026-01-25"
}
```

For a date range:

```json
{
  "start_date": "2026-01-19",
  "end_date": "2026-01-25"
}
```

Click "Trigger" and the DAG runs with your parameters.

## How Isolation Works

Each DAG run gets its own independent `dag_run.conf`:

| Aspect             | Behavior                                       |
| ------------------ | ---------------------------------------------- |
| **Isolation**      | Each DAG run has independent `dag_run.conf`    |
| **Persistence**    | Config applies **only to that run**, not saved |
| **Scheduled runs** | Always use default values (conf is empty dict) |
| **Manual runs**    | Use provided config or fall back to default    |

Here is what three consecutive runs look like:

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

The manual config from Run 2 has zero effect on Run 3. Each run is
self-contained.

## Common Pitfalls

Do not hardcode values that should be dynamic:

```python
# BAD - This persists across runs!
EXECUTION_DATE = "2026-01-25"  # Hardcoded
```

Do not try to make `schedule_interval` dynamic via config:

```python
# BAD - schedule_interval is defined at DAG level, can't be dynamic
schedule_interval="{{ dag_run.conf.get('schedule', '@daily') }}"
```

Use Jinja templating for per-run values:

```python
# GOOD - Evaluated per run
EXECUTION_DATE = "{{ dag_run.conf.get('execution_date', yesterday_ds) }}"
```

Always provide sensible defaults so scheduled runs work without config:

```python
# GOOD - Scheduled runs work without config
START_DATE = '{{ dag_run.conf.get("start_date", (execution_date - macros.timedelta(days=10)).strftime("%Y-%m-%d")) }}'
```

## Practical Takeaway

Use `dag_run.conf` for testing with specific dates, reprocessing historical
data, and debugging production issues. It is the right tool for one-off
parameter overrides that should not persist.

Do not use it for permanent configuration changes (use environment variables or
Airflow Variables), changing DAG scheduling (that is defined at parse time),
cross-DAG parameter sharing (use Airflow Variables or XCom), or automated
reprocessing pipelines (use `airflow dags backfill` CLI instead).

The key insight is that `dag_run.conf` is scoped to a single run. That scoping
is the entire point. It gives you manual override power without any risk of
polluting the schedule.
