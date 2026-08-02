---
title: Airflow Task Dependency Syntax
description: The `>>` operator in Airflow sets task dependencies and returns the downstream
date: 2026-01-23T00:00:00.000Z
updated: '2026-03-22'
tags:
  - devops
  - airflow
  - python
category: devops
draft: false
lang: en
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html
    title: Tasks — Airflow Documentation
    type: official
source_content_hash: b980f6a2675538615f06337634a31f725f943bac0a2c52b97543d1f7fca6d4b5
expanded: true
---

I wrote `task1 >> task2 >> task3` in an Airflow DAG and my linter flagged it: "Statement seems to have no effect." The code worked fine — dependencies were set correctly — but the linter was technically right. The `>>` operator returns a value that I was ignoring. Understanding how this operator actually works explains both the linter warning and the idiomatic fix.

## How `>>` Works

Airflow overloads Python's right-shift operator (`>>`) on BaseOperator. It calls `set_downstream()` as a side effect and returns the downstream task:

```python
# >> calls set_downstream() and returns the downstream task
result = task1 >> task2  # result is task2

# The dependency is set as a side effect
# The return value is often unused
```

The dependency between `task1` and `task2` is established immediately as a side effect. The return value (the downstream task) enables chaining: `task1 >> task2 >> task3` works because `task1 >> task2` returns `task2`, and then `task2 >> task3` sets the second dependency.

## The Linter Warning

When you write dependencies as a standalone expression, linters see an unused return value:

```python
# Linter warning: "Statement seems to have no effect"
task1 >> task2 >> task3
```

The statement does have an effect (setting dependencies), but the linter doesn't know about Airflow's operator overloading. It sees a bitshift expression whose result is discarded.

## The `_ =` Pattern

The idiomatic fix is to assign to `_`, which signals "I want the side effect, not the return value":

```python
# Suppresses linter warning
# Shows intent: we want the side effect, not the return value
_ = task1 >> task2 >> task3
```

This is a common Python convention. The underscore variable means "intentionally discarded." It satisfies the linter and communicates your intent to other developers.

## Alternative: The `chain()` Function

Airflow provides a `chain()` function that's more explicit about setting dependencies:

```python
from airflow.models.baseoperator import chain

# More explicit, no return value
chain(task1, task2, task3)
```

`chain()` doesn't return a value, so there's no linter warning. It's also more readable for complex dependency graphs. For simple linear chains, `_ = task1 >> task2` is more concise.

## Real-World Example

```python
validate = PythonOperator(task_id='validate', ...)
extract = DockerOperator(task_id='extract', ...)
load = PythonOperator(task_id='load', ...)

# Clear intent: setting dependencies, discarding return
_ = validate >> extract >> load
```

## Key Points

- `>>` is syntactic sugar for `set_downstream()`
- The dependency is set immediately (side effect)
- The return value is the rightmost task in the chain
- `_ =` communicates "intentionally discarding the return value"
- Both `_ =` and `chain()` are valid; `_ =` is more concise, `chain()` is more explicit

## Takeaway

When Airflow's `>>` operator triggers a linter warning, use `_ = task1 >> task2 >> task3` to suppress it. The underscore assignment signals that you're using `>>` for its side effect (setting dependencies), not its return value. For complex dependency graphs, consider `chain()` from `airflow.models.baseoperator` as a more explicit alternative.

## References

- [Airflow Tasks Documentation](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html)
