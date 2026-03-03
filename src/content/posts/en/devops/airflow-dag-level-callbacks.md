---
title: Airflow DAG-Level Callbacks
description: >-
  Airflow 2.x silently ignores `on_success_callback` at the DAG level. Only
  task-level callbacks work.
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
---

## The Problem

```python
# DAG-level on_success_callback is silently ignored in Airflow 2.11.0
with DAG(
    dag_id='my_dag',
    on_success_callback=send_alert  # This does NOTHING
) as dag:
    ...
```

No error is raised. The callback is simply not executed when all tasks succeed.

## The Solution

Move `on_success_callback` to the **last task** in the pipeline.

```python
# Use task-level callback on the LAST task
last_task = SomeOperator(
    task_id='final_task',
    on_success_callback=send_alert,  # This works
)
```

## Key Points

- `on_failure_callback` at DAG level DOES work (for task failures)
- `on_success_callback` at DAG level does NOT work (silently ignored)
- For success alerts, attach callback to the final task in the DAG
- This behavior exists in Airflow 2.11.0 (and likely other 2.x versions)

## Example: amplitude_etl_dag

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

## Why This Matters

Without this knowledge, you might spend time debugging why success alerts never fire, not realizing the DAG-level callback is silently ignored.
