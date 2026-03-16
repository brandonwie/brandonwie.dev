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
  - url: 'https://docs.python.org/3/tutorial/controlflow.html#keyword-only-arguments'
    title: Python Keyword-Only Arguments
    type: official
  - url: null
    title: Applied in etl-project deduplication
    type: experience
source_content_hash: c846fe4436ff26f9647aea9e72d23d9556824a76b96506a0c8e2460fc812655f
---

Copy-paste duplication means bugs get fixed in one but not the other, and the
implementations drift over time.

Common pattern in ETL codebases: a "regular" path and a "backfill" path that do
the same thing with different config.

---

## Difficulties Encountered

- **Spotting the duplication** — The two functions lived in separate modules
  (`amplitude_common` and `amplitude_backfill`) so the near-identical logic was
  not obvious until both needed the same bug fix
- **Identifying the behavioral delta** — Had to diff the two functions
  line-by-line to confirm the only differences were S3 prefix and zip
  extraction, not hidden conditional logic
- **Choosing the right parameterization** — Tempting to use a `mode: str` enum
  parameter, but that would create a stringly-typed API; keyword-only booleans
  and strings are more explicit
- **Preserving caller compatibility** — Existing callers must continue working
  without changes, which constrains default values to match the original
  "regular" path behavior

---

## The Solution

Unify into one function using Python's `*` separator to add keyword-only
parameters for the behavioral differences.

---

## Pattern

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

## Why Keyword-Only (the `*` separator)

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

---

## Key Points

1. **Defaults preserve existing behavior** - existing callers don't change
2. **Keyword-only prevents positional mistakes** - behavioral flags must be
   named
3. **One source of truth** - bug fixes apply to both paths
4. **Docstring documents both modes** - clear contract for callers

---

## When to Use

| Condition                     | Action                                  |
| ----------------------------- | --------------------------------------- |
| Functions are >80% identical  | Merge with params                       |
| Behavioral diff is 1-3 flags  | Use keyword-only params                 |
| Behavioral diff is structural | Keep separate (different abstractions)  |
| Functions are in same module  | Probably already should be one function |
| Functions are cross-module    | Move to shared module, import from both |

---

## When NOT to Use

- **Structural behavioral differences** — If the two functions share less than
  ~80% of their logic, merging creates a function full of conditional branches
  that is harder to read than two separate functions
- **More than 3 behavioral flags** — Too many keyword-only params signal the
  functions are different abstractions; consider the Strategy pattern or
  separate classes instead
- **Performance-critical hot paths** — The extra `if` checks per call are
  negligible in most code, but in tight loops processing millions of rows, two
  specialized functions may be warranted
- **Temporary/throwaway code** — If one path will be deleted soon (e.g.,
  backfill that runs once), the effort to unify is wasted

---

## Options Considered

| Option                    | Pros                                              | Cons                                                     |
| ------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| Keyword-only params (`*`) | Callers must name flags; defaults preserve compat | Signature grows with each flag                           |
| `mode: str` enum param    | Single param instead of multiple flags            | Stringly-typed; no autocomplete; invalid values possible |
| Config dict / dataclass   | Groups behavioral config together                 | Over-engineered for 1-3 flags; caller builds object      |
| Keep separate functions   | No refactoring needed; self-contained             | Bug fixes applied twice; implementations drift           |

## Why This Approach

Chose keyword-only parameters because the behavioral delta was exactly 2 flags
(prefix and zip extraction), defaults preserve existing caller compatibility
with zero changes, and the `*` separator makes it impossible to pass behavioral
flags positionally by accident. The stringly-typed `mode` alternative was
rejected because it would require internal dispatch logic and provides no type
safety.
