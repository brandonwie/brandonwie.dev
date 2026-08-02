---
title: Airflow DAG-Level Callbacks
description: Airflow 2.x silently ignores `on_success_callback` at the DAG level. Only
  task-level success callbacks fired for me, so the success alert has to hang off the
  last task in the pipeline.
date: 2026-01-23T00:00:00.000Z
updated: '2026-08-02'
tags:
  - devops
  - airflow
  - callbacks
category: devops
draft: false
lang: en
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/callbacks.html
    title: Callbacks — Airflow Documentation
    type: official
source_content_hash: f0bb7669a11d37bd2e35f2e4df8a8cb84f7d9a53a5367c5bbf6fd6c1b12d8fa2
expanded: true
---

I wired up Slack notifications for an Airflow DAG — failure alerts worked fine, but the success alert never fired. The DAG ran, all tasks succeeded, but no notification. I checked the Slack webhook, verified the callback function, and reviewed task logs. Everything looked correct. The problem turned out to be the DAG-level `on_success_callback` itself — on Airflow 2.11.0 it was silently ignored.

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

- `on_failure_callback` at DAG level **worked** (for task failures)
- `on_success_callback` at DAG level **did not** (silently ignored)
- For success alerts, attach the callback to the final task in the DAG
- This behavior exists in Airflow 2.11.0 (and likely other 2.x versions)

## Real-World Pattern

Here's the pattern I settled on for an analytics ETL DAG. Failure handling goes in `default_args` (so every task gets it), and the success callback goes on the last task:

```python
# default_args handles failures for all tasks
default_args = {
    'on_failure_callback': send_failure_alert,
}

with DAG('analytics_etl', default_args=default_args):
    validate = PythonOperator(task_id='validate', ...)

    etl = DockerOperator(
        task_id='run-etl',
        on_success_callback=send_success_alert,  # Success callback here
    )

    _ = validate >> etl
```

The `default_args` approach means every task gets the failure callback without repeating it. The success callback only needs to be on `etl` (the last task) — if `validate` fails, the pipeline stops before reaching `etl`, so the success callback won't fire.

## What I Verified, and What I Didn't

I want to be careful here, because I never found an explanation and I did not isolate the cause.

The official callbacks page documents `on_success_callback` as a DAG-level callback — "Invoked when the Dag succeeds" — so on paper it is supported, and a reader who follows my reference link will read the opposite of what I hit. What I observed on Airflow 2.11.0 was that the DAG-level failure callback fired, the DAG-level success callback never did, and moving the success callback onto the last task made it fire on every run.

The one documented caveat I did find (in the current stable docs, which now track Airflow 3.x) is unrelated to my case but worth knowing: callbacks only run when the DAG or task state changes because a worker executed something, so marking a run successful from the UI or the CLI will not trigger them.

So take all of this as an observation pinned to one version, not a claim about Airflow internals. If DAG-level success callbacks fire in your version, use them — the last-task pattern is what I fell back on when they didn't.

## Takeaway

If your Airflow success alerts aren't firing, check whether they're set at the DAG level. Moving `on_success_callback` to the last task in the pipeline is a one-line change, and it worked around the silence I ran into on 2.11.0. The rule I use now: failure callbacks at the DAG level (via `default_args`), success callbacks at the task level (on the final task).

## References

- [Airflow Callbacks Documentation](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/callbacks.html)
