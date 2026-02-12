---
title: Deduplicating Functions with Keyword-Only Parameters
description: >-
  Two modules contain near-identical functions with slight behavioral
  differences.
date: 2026-02-06T00:00:00.000Z
updated: 2026-02-06T00:00:00.000Z
tags:
  - backend
  - python
  - refactoring
  - api-design
category: backend
draft: false
lang: en
references:
  - url: "https://docs.python.org/3/tutorial/controlflow.html#keyword-only-arguments"
    title: Python Keyword-Only Arguments
    type: official
  - url: null
    title: Applied in moba-etl deduplication
    type: experience
---

I had two functions doing the same thing in two different files, and I did not
realize it until a bug fix applied to one but not the other. That is the classic
copy-paste trap: duplication hides in separate modules where no one thinks to
look.

In ETL codebases, this happens all the time. You have a "regular" pipeline path
and a "backfill" path. Both do the same core work with slightly different
configuration. Over time the implementations drift, bugs get fixed in one place
but not the other, and eventually something breaks in production.

## Why This Happens

The two functions lived in separate modules (`amplitude_common` and
`amplitude_backfill`), so the near-identical logic was not obvious. It took
needing the same bug fix in both places to realize the duplication existed.

Diffing the two functions line-by-line revealed the only differences were the S3
prefix and whether to extract from a zip archive. No hidden conditional logic,
no structural differences. Just two flags.

## Options Explored

I considered four approaches before settling on one.

| Option                    | Pros                                              | Cons                                                     |
| ------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| Keyword-only params (`*`) | Callers must name flags; defaults preserve compat | Signature grows with each flag                           |
| `mode: str` enum param    | Single param instead of multiple flags            | Stringly-typed; no autocomplete; invalid values possible |
| Config dict / dataclass   | Groups behavioral config together                 | Over-engineered for 1-3 flags; caller builds object      |
| Keep separate functions   | No refactoring needed; self-contained             | Bug fixes applied twice; implementations drift           |

A `mode: str` parameter was tempting because it keeps the signature small. But
it creates a stringly-typed API with no autocomplete and no compile-time safety.
You end up writing internal dispatch logic (`if mode == "backfill"`) that is
just as messy. A config dataclass groups things nicely but is overkill when the
behavioral delta is exactly two flags.

## The Solution

Unify into one function using Python's `*` separator to add keyword-only
parameters for the behavioral differences.

Here is what the code looked like before:

```python
# BEFORE: Two separate functions in two files

# module_a.py
def save_data(data, date, hour):
    # extracts from zip, saves to prefix "regular"
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        gzip_data = zf.read(zf.namelist()[0])
    key = f"regular/regular_{date}_{hour}"
    s3.put_object(Body=gzip_data, Key=key)

# module_b.py
def save_data(data, date, hour):
    # saves raw bytes to prefix "backfill"
    key = f"backfill/backfill_{date}_{hour}"
    s3.put_object(Body=data, Key=key)
```

And here is the unified version:

```python
# AFTER: Single function with keyword-only params

# common.py
DEFAULT_PREFIX = "regular"

def save_data(
    data: bytes,
    date: str,
    hour: int,
    *,                          # Everything after * is keyword-only
    prefix: str = DEFAULT_PREFIX,
    extract_zip: bool = True,
) -> str | None:
    if extract_zip:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            upload_data = zf.read(zf.namelist()[0])
    else:
        upload_data = data

    key = f"{prefix}/{prefix}_{date}_{hour}"
    s3.put_object(Body=upload_data, Key=key)
```

The `*` separator is the key piece. Everything after it must be passed by name.

## Why This Works

The `*` forces callers to name these parameters explicitly:

```python
# Existing callers work unchanged (use defaults)
save_data(data, date, hour)

# New callers must be explicit about behavior
save_data(data, date, hour, prefix="backfill", extract_zip=False)
```

Without `*`, someone could accidentally pass positional args:

```python
save_data(data, date, hour, "backfill", False)  # Unclear intent
```

That call compiles fine, but reading it six months later, nobody knows what
`"backfill"` and `False` mean without checking the function signature. Keyword
arguments make the intent self-documenting.

The defaults preserve existing behavior. Every current caller of the "regular"
path continues working with zero changes. Only the backfill callers need to pass
the two new keyword arguments.

## Practical Takeaway

Use this pattern when functions are more than 80% identical and the behavioral
delta is 1-3 flags. Beyond that, you are forcing different abstractions into one
function.

| Condition                     | Action                                  |
| ----------------------------- | --------------------------------------- |
| Functions are >80% identical  | Merge with params                       |
| Behavioral diff is 1-3 flags  | Use keyword-only params                 |
| Behavioral diff is structural | Keep separate (different abstractions)  |
| Functions are in same module  | Probably already should be one function |
| Functions are cross-module    | Move to shared module, import from both |

Do not use this when the two functions share less than 80% of their logic.
Merging creates a function full of conditional branches that is harder to read
than two separate functions. Also avoid it when you have more than 3 behavioral
flags -- too many keyword-only params signal different abstractions. Consider the
Strategy pattern or separate classes instead.

One more thing: if one of the paths is temporary (a backfill that runs once and
gets deleted), the effort to unify is wasted. Keep it simple and delete the code
when the job is done.
