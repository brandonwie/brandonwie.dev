---
title: Airflow Task 의존성 구문
description: Airflow의 >> 연산자는 task 의존성을 설정하고 downstream task를 반환해요.
date: 2026-01-23T00:00:00.000Z
updated: '2026-03-22'
tags:
  - devops
  - airflow
  - python
  - work
category: devops
draft: false
lang: ko
source_lang: en
source_slug: airflow-task-dependency-syntax
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html
    title: Tasks — Airflow Documentation
    type: official
---

## `>>`의 동작 방식

```python
# >>는 set_downstream()을 호출하고 downstream task를 반환
result = task1 >> task2  # result는 task2

# 의존성은 부수 효과(side effect)로 설정돼요
# 반환값은 보통 사용하지 않아요
```

## 린터 경고

Python 린터가 사용되지 않는 표현식에 대해 경고할 수 있어요.

```python
# 린터 경고: "Statement seems to have no effect"
task1 >> task2 >> task3
```

## `_ =` 패턴

`_ =`를 사용해서 반환값을 명시적으로 버리면 돼요.

```python
# 린터 경고 억제
# 의도를 표현: 부수 효과만 원하고, 반환값은 필요 없다
_ = task1 >> task2 >> task3
```

## 대안: chain 함수

```python
from airflow.models.baseoperator import chain

# 더 명시적이고, 반환값 없음
chain(task1, task2, task3)
```

## 핵심 포인트

- `>>`는 `set_downstream()`의 문법적 설탕이에요
- 의존성은 즉시 설정돼요(부수 효과)
- 반환값은 가장 오른쪽 task에요
- `_ =`는 "의도적으로 반환값을 버린다"는 의미를 전달해요
- 두 패턴 모두 유효해요. `_ =`가 린터에는 더 명확해요

## 예시

```python
validate = PythonOperator(task_id='validate', ...)
extract = DockerOperator(task_id='extract', ...)
load = PythonOperator(task_id='load', ...)

# 의도를 명확히: 의존성을 설정하고, 반환값은 버림
_ = validate >> extract >> load
```
