---
title: Deduplicating Functions with Keyword-Only Parameters
description: >-
  Two modules contain near-identical functions with slight behavioral
  differences.
date: 2026-02-06T00:00:00.000Z
updated: '2026-03-22'
tags:
  - backend
  - python
  - refactoring
  - api-design
category: backend
draft: false
lang: en
references:
  - url: 'https://docs.python.org/3/tutorial/controlflow.html#keyword-only-arguments'
    title: Python Keyword-Only Arguments
    type: official
  - url: null
    title: Applied in moba-etl deduplication
    type: experience
source_content_hash: a1b542f23c6c6fbb135bce1464ed479275b073a31edadfdbfad3157f191264b0
expanded: true
---

I needed to fix a bug in our ETL pipeline's S3 upload function and realized the exact same bug existed in a second copy of the function in a different module. One was for regular automated exports (`amplitude_common`), the other for manual backfills (`amplitude_backfill`). They were 90% identical — the only differences were the S3 prefix and whether to extract data from a ZIP archive. Classic copy-paste duplication, and fixing the bug twice was the nudge I needed to merge them.

## The Problem

In ETL codebases, it's common to have a "regular" path and a "backfill" path that do the same thing with slightly different configuration. When these live in separate modules, the duplication is easy to miss — until both need the same fix and you realize you're maintaining two copies of the same logic:

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

The behavioral delta was exactly two things: the S3 prefix name and whether to extract from a ZIP before uploading. Everything else — the S3 client calls, error handling, completion marker logic — was identical.

## The Solution: Keyword-Only Parameters

Python's `*` separator lets you add parameters that callers must name explicitly. This is perfect for behavioral flags — it forces clear intent at the call site while keeping the function signature self-documenting:

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

## Why Keyword-Only (the `*` Separator)

The `*` separator is the key design choice. It forces callers to name the behavioral parameters explicitly:

```python
# Existing callers work unchanged (use defaults)
save_data(data, date, hour)

# New callers must be explicit about behavior
save_data(data, date, hour, prefix="backfill", extract_zip=False)
```

Without `*`, someone could accidentally pass positional arguments:

```python
save_data(data, date, hour, "backfill", False)  # Unclear intent
```

Reading that call, you'd have no idea what `"backfill"` and `False` control without checking the function signature. Keyword-only parameters make the intent visible at every call site.

## Choosing the Right Approach

The decision of whether to merge functions depends on how much they share:

| Condition                     | Action                                  |
| ----------------------------- | --------------------------------------- |
| Functions are >80% identical  | Merge with params                       |
| Behavioral diff is 1-3 flags  | Use keyword-only params                 |
| Behavioral diff is structural | Keep separate (different abstractions)  |
| Functions are in same module  | Probably already should be one function |
| Functions are cross-module    | Move to shared module, import from both |

## Options I Considered

| Option                    | Pros                                              | Cons                                                     |
| ------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| Keyword-only params (`*`) | Callers must name flags; defaults preserve compat | Signature grows with each flag                           |
| `mode: str` enum param    | Single param instead of multiple flags            | Stringly-typed; no autocomplete; invalid values possible |
| Config dict / dataclass   | Groups behavioral config together                 | Over-engineered for 1-3 flags; caller builds object      |
| Keep separate functions   | No refactoring needed; self-contained             | Bug fixes applied twice; implementations drift           |

I chose keyword-only parameters because the behavioral delta was exactly 2 flags, defaults preserve existing caller compatibility with zero changes, and the `*` separator makes it impossible to pass behavioral flags positionally by accident. The `mode: str` alternative was rejected because it would require internal dispatch logic and provides no type safety.

## When NOT to Merge

Merging isn't always the right call:

- **Structural behavioral differences** — if two functions share less than ~80% of their logic, merging creates a function full of conditional branches that's harder to read than two separate functions
- **More than 3 behavioral flags** — too many keyword-only params signal the functions are different abstractions; consider the Strategy pattern instead
- **Temporary/throwaway code** — if one path will be deleted soon (e.g., a one-time backfill), the refactoring effort is wasted

## Takeaway

When you find two near-identical functions with 1-3 behavioral differences, merge them using Python's `*` separator to add keyword-only parameters for the differences. Set defaults to match the original "primary" path so existing callers don't need any changes. The result: one source of truth for bug fixes, explicit intent at every call site, and no risk of the two implementations drifting apart.

## References

- [Python Keyword-Only Arguments](https://docs.python.org/3/tutorial/controlflow.html#keyword-only-arguments)
