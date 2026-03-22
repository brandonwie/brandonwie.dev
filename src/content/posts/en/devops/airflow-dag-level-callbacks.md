---
title: Airflow DAG-Level Callbacks
description: Airflow 2.x silently ignores `on_success_callback` at the DAG level. Only
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - devops
  - airflow
  - callbacks
  - work
category: devops
draft: false
lang: en
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/callbacks.html
    title: Callbacks — Airflow Documentation
    type: official
source_content_hash: 443bf4ed1625c867bfaef42b18ecd29008b2b99709e5ea5817d13720fa3ef464
expanded: true
---

I wired up Slack notifications for an Airflow DAG — failure alerts worked fine, but the success alert never fired. The DAG ran, all tasks succeeded, but no notification. I checked the Slack webhook, verified the callback function, and reviewed task logs. Everything looked correct. The problem? `on_success_callback` at the DAG level is silently ignored in Airflow 2.x.

No error. No warning. The callback parameter is accepted without complaint and then completely ignored when all tasks succeed.

## The Silent Failure

Here's the code that looks correct but doesn't work:

```python
# DAG-level on_success_callback is silently ignored in Airflow 2.11.0
with DAG(
    dag_id='my_dag',
    on_success_callback=send_alert  # This does NOTHING
) as dag:
    ...
```

This is a trap because `on_failure_callback` at the DAG level **does** work. If you set up both callbacks at the DAG level, failure alerts fire correctly while success alerts silently disappear. The asymmetry makes it especially hard to diagnose — you assume both work the same way, and since failure callbacks prove the mechanism works, you look everywhere except the DAG-level success callback behavior.

## The Fix

Move `on_success_callback` to the **last task** in the pipeline:

```python
# Use task-level callback on the LAST task
last_task = SomeOperator(
    task_id='final_task',
    on_success_callback=send_alert,  # This works
)
```

Task-level callbacks work reliably for both success and failure. By placing the success callback on the final task, you get a notification when the entire pipeline completes successfully — the last task can only succeed if all upstream tasks succeeded first.

## The Key Rules

- `on_failure_callback` at DAG level **works** (for task failures)
- `on_success_callback` at DAG level **does not work** (silently ignored)
- For success alerts, attach the callback to the final task in the DAG
- This behavior exists in Airflow 2.11.0 (and likely other 2.x versions)

## Real-World Pattern

Here's the pattern I settled on for the Amplitude ETL DAG. Failure handling goes in `default_args` (so every task gets it), and the success callback goes on the last task:

```python
# default_args handles failures for all tasks
default_args = {
    'on_failure_callback': send_failure_alert,
}

with DAG('amplitude_etl', default_args=default_args):
    validate = PythonOperator(task_id='validate', ...)

    etl = DockerOperator(
        task_id='amplitude-etl',
        on_success_callback=send_success_alert,  # Success callback here
    )

    _ = validate >> etl
```

The `default_args` approach means every task gets the failure callback without repeating it. The success callback only needs to be on `etl` (the last task) — if `validate` fails, the pipeline stops before reaching `etl`, so the success callback won't fire.

## Why This Works

The difference comes down to how Airflow evaluates callbacks at each level. DAG-level callbacks are triggered by the DagRun state change, but the success state transition has a known gap in Airflow 2.x where the callback dispatch is not fully implemented. Task-level callbacks, on the other hand, are triggered by the TaskInstance state machine, which handles both success and failure transitions correctly.

## Takeaway

If your Airflow success alerts aren't firing, check whether they're set at the DAG level. Move `on_success_callback` to the last task in your pipeline. It's a one-line change that fixes a silent, undocumented behavior gap in Airflow 2.x. The general rule: use DAG-level for failure callbacks (via `default_args`) and task-level for success callbacks (on the final task).

## References

- [Airflow Callbacks Documentation](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/callbacks.html)
