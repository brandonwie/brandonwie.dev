---
title: Airflow Task Dependency Syntax
description: The `>>` operator in Airflow sets task dependencies and returns the downstream
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - devops
  - airflow
  - python
  - work
category: devops
draft: false
lang: en
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html
    title: Tasks — Airflow Documentation
    type: official
---

task.

## How `>>` Works

```python
# >> calls set_downstream() and returns the downstream task
result = task1 >> task2  # result is task2

# The dependency is set as a side effect
# The return value is often unused
```

## Linter Warning

Python linters may warn about unused expressions:

```python
# Linter warning: "Statement seems to have no effect"
task1 >> task2 >> task3
```

## The `_ =` Pattern

Use `_ =` to explicitly discard the return value:

```python
# Suppresses linter warning
# Shows intent: we want the side effect, not the return value
_ = task1 >> task2 >> task3
```

## Alternative: Chain Function

```python
from airflow.models.baseoperator import chain

# More explicit, no return value
chain(task1, task2, task3)
```

## Key Points

- `>>` is syntactic sugar for `set_downstream()`
- The dependency is set immediately (side effect)
- Return value is the rightmost task
- `_ =` communicates "intentionally discarding return value"
- Both patterns are valid; `_ =` is more explicit for linters

## Example

```python
validate = PythonOperator(task_id='validate', ...)
extract = DockerOperator(task_id='extract', ...)
load = PythonOperator(task_id='load', ...)

# Clear intent: setting dependencies, discarding return
_ = validate >> extract >> load
```
