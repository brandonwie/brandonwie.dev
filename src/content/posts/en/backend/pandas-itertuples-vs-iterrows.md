---
title: pandas itertuples() vs iterrows()
description: '`iterrows()` is the most common way to iterate over DataFrame rows, but it'
date: 2026-02-06T00:00:00.000Z
updated: 2026-02-06T00:00:00.000Z
tags:
  - backend
  - python
  - pandas
  - performance
category: backend
draft: false
lang: en
references:
  - url: >-
      https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.itertuples.html
    title: pandas.DataFrame.itertuples
    type: official
  - url: >-
      https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.iterrows.html
    title: pandas.DataFrame.iterrows
    type: official
source_content_hash: 5eef4d4388b121d0f74db581300d1d1facfe9e2b62705e597f983d2638d22809
---

creates a `pd.Series` object for every single row. Series construction involves
type inference, index creation, and memory allocation — all wasted when you just
need to read values.

---

## Difficulties Encountered

- **`iterrows()` is everywhere in examples**: Stack Overflow answers, tutorials,
  and even some pandas docs use `iterrows()` as the default iteration pattern.
  It takes deliberate effort to discover `itertuples()` exists.
- **Access pattern change is not drop-in**: `row["col"]` (dict-style) does not
  work with namedtuples. Every access must change to `row.col` or
  `getattr(row, "col")`, making migration tedious in large functions.
- **`.get()` has no direct equivalent**: `row.get("col", default)` on a Series
  becomes `getattr(row, "col", default)` on a namedtuple, which is less
  discoverable and reads differently.
- **Column names with special characters break**: If a DataFrame has columns
  like `"event properties"` (with spaces), namedtuple attribute access fails
  silently or raises `AttributeError`, requiring column renaming first.

---

## The Solution

Use `itertuples(index=False)` instead. It returns lightweight namedtuples, which
are ~100x faster than iterrows().

---

## Key Differences

| Aspect            | `iterrows()`              | `itertuples()`                 |
| ----------------- | ------------------------- | ------------------------------ |
| Returns           | `(index, Series)`         | namedtuple                     |
| Speed             | Slow (~1x)                | Fast (~100x)                   |
| Memory            | High (Series per row)     | Low (namedtuple)               |
| Access            | `row["col"]` or `row.col` | `row.col` only                 |
| Default with      | `row.get("col", default)` | `getattr(row, "col", default)` |
| Type preservation | No (casts to common type) | Yes                            |

---

## Access Pattern Migration

```python
# BEFORE (iterrows)
for _, row in df.iterrows():
    val = row["column_name"]
    safe = row.get("column_name", default)

# AFTER (itertuples)
for row in df.itertuples(index=False):
    val = row.column_name
    safe = getattr(row, "column_name", default)
```

---

## When to Use

- Row-by-row iteration is unavoidable (complex logic that cannot be vectorized)
- Read-only access to row values is sufficient
- Column names are valid Python identifiers (no spaces or special characters)
- Performance matters (1K+ rows where `iterrows()` becomes noticeably slow)

## When NOT to Use

- **Column names with spaces or special characters**: Namedtuple attribute
  access requires valid Python identifiers. Rename columns first or fall back to
  `iterrows()`.
- **Need to modify row values**: Namedtuples are immutable. If you need in-place
  mutation, use `iterrows()` or vectorized assignment.
- **Vectorized operations are possible**: If the logic can be expressed as
  column-wise operations (`.apply()`, boolean indexing, `.str` accessor), skip
  iteration entirely — it will be orders of magnitude faster than either method.

---

## Options Considered

| Option             | Pros                                        | Cons                                           |
| ------------------ | ------------------------------------------- | ---------------------------------------------- |
| **itertuples()**   | ~100x faster, low memory, preserves types   | Attribute-only access, immutable rows          |
| **iterrows()**     | Dict-style access, mutable Series, familiar | ~100x slower, high memory, loses types         |
| **apply()**        | Vectorized-ish, flexible                    | ~10x slower than itertuples, unclear semantics |
| **Vectorized ops** | Fastest by far, idiomatic pandas            | Not always possible for complex row logic      |

## Why This Approach

Chose `itertuples()` because the ETL aggregation required row-by-row iteration
with conditional logic that could not be easily vectorized, and the ~2s runtime
for 10K rows with `iterrows()` was unacceptable in a pipeline running hourly.
The migration from `row["col"]` to `getattr(row, "col")` was mechanical and
completed in one pass.

---

## Performance Hierarchy

```text
vectorized ops  >>  itertuples()  >>  apply()  >>  iterrows()
   (fastest)          (~100x)         (~10x)        (1x baseline)
```

---

## Real Example

```python
# schedule_changes_aggregation.py
# Processing ~10K daily events

# BEFORE: ~2s for 10K rows
for _, row in filtered.iterrows():
    event_props = row.get("event_properties", {})
    platform = row.get("platform")

# AFTER: ~20ms for 10K rows
for row in filtered.itertuples(index=False):
    event_props = getattr(row, "event_properties", {})
    platform = getattr(row, "platform", None)
```
