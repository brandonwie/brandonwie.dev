---
title: Airflow DAG start_date and Manual Triggers
description: 'When manually triggering a DAG, Airflow may skip task execution if the trigger'
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - devops
  - airflow
category: devops
draft: false
lang: en
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html
    title: Dag Runs — Airflow Documentation
    type: official
source_content_hash: 31adea7da495696d95d82333fde5b238ab94aca1ca1841a8530a19f7e2b2a03d
---

date falls before the DAG's `start_date`.

## The Problem

DAG configured with future `start_date`:

```python
with DAG(
    dag_id="my_dag",
    start_date=datetime(2026, 1, 29),  # Future date
    ...
) as dag:
```

When manually triggered on 2026-01-27:

- Trigger date (2026-01-27) is before start_date (2026-01-29)
- Airflow marks DAG run as success **without executing tasks**
- DAG finishes in ~0.02 seconds (no actual work done)

## Symptoms

- DAG run shows "success" immediately (under 1 second duration)
- No task execution logs
- No Docker containers started (for DockerOperator)
- Scheduler logs show no "tasks up for execution" entries
- Callbacks don't fire (no Slack notifications)

## Solution

Use a safe past date that will always be before any trigger date:

```python
with DAG(
    dag_id="my_dag",
    start_date=datetime(2024, 1, 1),  # Safe past date
    ...
) as dag:
```

## Best Practice

| Approach               | Pros                               | Cons                       |
| ---------------------- | ---------------------------------- | -------------------------- |
| `2024-01-01`           | Simple, always works               | Looks arbitrary            |
| Actual deployment date | Semantically meaningful            | May break manual triggers  |
| Future date            | Prevents accidental scheduled runs | **Breaks manual triggers** |

Recommendation: Use `datetime(2024, 1, 1)` as a standard convention across all
DAGs for consistency and reliability.

## Note on Scheduled Runs

The `start_date` primarily controls when **scheduled** runs begin. For
`catchup=False` DAGs, Airflow won't create runs before `start_date` anyway.
Using a past date doesn't cause unwanted scheduled runs.
