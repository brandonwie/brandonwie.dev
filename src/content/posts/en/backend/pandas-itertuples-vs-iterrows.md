---
title: pandas itertuples() vs iterrows()
description: "`iterrows()` is the most common way to iterate over DataFrame rows, but it"
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
---

Our hourly ETL aggregation was taking 2 seconds to process 10,000 rows.
The bottleneck was `iterrows()`. Switching to `itertuples()` dropped it to
20 milliseconds -- a 100x improvement for a one-line change in the loop
signature.

The frustrating part: `iterrows()` is what every tutorial teaches. Stack
Overflow answers default to it. Even some pandas documentation uses it as the
go-to iteration pattern. Finding out that a dramatically faster alternative
exists took deliberate digging.

## Why iterrows() Is Slow

`iterrows()` creates a `pd.Series` object for every single row. Series
construction involves type inference, index creation, and memory allocation.
All of that work is wasted when you only need to read values.

On top of that, `iterrows()` does not preserve dtypes. It casts each row to a
common type, which means your integers might become floats and your timestamps
might become objects. This is not a minor annoyance -- it can cause subtle bugs
in downstream logic.

## The Solution

Use `itertuples(index=False)` instead. It returns lightweight namedtuples with
near-zero overhead per row.

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

## Options Explored

I looked at four approaches:

| Option             | Pros                                        | Cons                                           |
| ------------------ | ------------------------------------------- | ---------------------------------------------- |
| **itertuples()**   | ~100x faster, low memory, preserves types   | Attribute-only access, immutable rows          |
| **iterrows()**     | Dict-style access, mutable Series, familiar | ~100x slower, high memory, loses types         |
| **apply()**        | Vectorized-ish, flexible                    | ~10x slower than itertuples, unclear semantics |
| **Vectorized ops** | Fastest by far, idiomatic pandas            | Not always possible for complex row logic      |

Vectorized operations are the ideal, but the aggregation logic involved
conditional branching that could not be expressed as column-wise operations.
Row-by-row iteration was unavoidable, which made the choice between
`iterrows()` and `itertuples()` the deciding factor.

`apply()` sits in the middle. It is faster than `iterrows()` but still around
10x slower than `itertuples()`, and its semantics can be confusing -- it
sometimes operates row-wise, sometimes column-wise, depending on the `axis`
parameter.

## Key Differences

| Aspect            | `iterrows()`              | `itertuples()`                 |
| ----------------- | ------------------------- | ------------------------------ |
| Returns           | `(index, Series)`         | namedtuple                     |
| Speed             | Slow (~1x)                | Fast (~100x)                   |
| Memory            | High (Series per row)     | Low (namedtuple)               |
| Access            | `row["col"]` or `row.col` | `row.col` only                 |
| Default with      | `row.get("col", default)` | `getattr(row, "col", default)` |
| Type preservation | No (casts to common type) | Yes                            |

## Migration Gotchas

The switch is not entirely drop-in. Three things tripped me up:

**Access pattern changes.** `row["col"]` does not work with namedtuples. Every
access must change to `row.col` or `getattr(row, "col")`. In a large function
with dozens of field accesses, this is tedious but mechanical.

**No `.get()` equivalent.** `row.get("col", default)` on a Series becomes
`getattr(row, "col", default)` on a namedtuple. It works the same way, but
reads differently and is less discoverable.

**Column names with special characters break.** If a DataFrame has columns like
`"event properties"` (with spaces), namedtuple attribute access fails. You need
to rename columns first or fall back to `iterrows()` for those specific cases.

## Why This Works

The performance gap comes down to object creation cost. A `pd.Series` is a
heavyweight object with an index, dtype inference, and memory allocation.
A namedtuple is a thin C-level struct. When you iterate 10,000 rows, creating
10,000 Series objects versus 10,000 namedtuples is the difference between 2
seconds and 20 milliseconds.

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

The performance hierarchy for reference:

```text
vectorized ops  >>  itertuples()  >>  apply()  >>  iterrows()
   (fastest)          (~100x)         (~10x)        (1x baseline)
```

## Practical Takeaway

**Use `itertuples()` when:**

- Row-by-row iteration is unavoidable (complex logic that cannot be vectorized)
- Read-only access to row values is sufficient
- Column names are valid Python identifiers (no spaces or special characters)
- Performance matters (1,000+ rows where `iterrows()` becomes noticeably slow)

**Keep `iterrows()` when:**

- **Column names have spaces or special characters**: Namedtuple attribute
  access requires valid Python identifiers. Rename columns first or fall back
  to `iterrows()`.
- **You need to modify row values**: Namedtuples are immutable. If you need
  in-place mutation, use `iterrows()` or vectorized assignment.
- **Vectorized operations are possible**: If the logic can be expressed as
  column-wise operations (`.apply()`, boolean indexing, `.str` accessor), skip
  iteration entirely -- it will be orders of magnitude faster than either
  method.

Before reaching for any iteration method, ask whether the logic can be
vectorized. If it can, skip the loop. If it cannot, use `itertuples()`.
