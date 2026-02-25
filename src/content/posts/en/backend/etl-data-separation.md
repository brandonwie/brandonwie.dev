---
title: ETL Data Separation Strategy
description: Mixing regular ETL data with manually recovered backfill data in the same S3
date: 2026-01-27T00:00:00.000Z
updated: 2026-02-06T00:00:00.000Z
tags:
  - backend
  - etl
  - data-engineering
  - s3
  - architecture
category: backend
draft: false
lang: en
references:
  - url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-folders.html'
    title: using folders.html
    type: official
---

path makes it hard to:

1. **Track data sources** - Can't distinguish automated vs manual data
2. **Control processing** - Daily ETL may accidentally process backfilled data
3. **Debug issues** - Hard to trace which data came from where
4. **Manage lifecycle** - Can't apply different retention policies

---

## Difficulties Encountered

- **Backfill looked identical to regular data**: The backfilled files had the
  same naming convention and format as automated exports, so there was no way to
  distinguish them after the fact without checking timestamps or logs.
- **Daily ETL silently reprocessed backfill**: Because both data sources lived
  in the same prefix, the daily job picked up backfilled files and processed
  them again, causing duplicate records in the refined layer.
- **Temptation to "just tag" instead of separate**: S3 object tags seemed
  simpler at first, but tags are not visible in `ListObjects` responses and
  require a separate `GetObjectTagging` call per object, making filtering
  expensive.
- **Naming convention coordination**: The backfill prefix had to be chosen
  carefully to avoid colliding with existing automated prefixes and to remain
  compatible with downstream ETL readers.

---

## The Solution: Separate Storage Paths

Use distinct S3 prefixes for different data sources:

```text
s3://bucket/
├── raw-data/              # Regular automated ETL
│   └── data_2026-01-27.json
└── raw-data-backfill/     # Manual backfill recovery
    └── data_2026-01-20.json
```

## Amplitude ETL Example

### Before Separation

```text
s3://amplitude-raw-bucket/
└── {PROJECT_ID}/
    ├── {PROJECT_ID}_2026-01-27_10#0.json.gz  # Automated
    ├── {PROJECT_ID}_2026-01-27_10_complete
    ├── {PROJECT_ID}_2026-01-20_19#0.json.gz  # Backfilled - mixed!
    └── {PROJECT_ID}_2026-01-20_19_complete
```

**Problems:**

- Can't tell which files were backfilled
- Daily ETL reads both, may double-process
- No clear separation of concerns

### After Separation

```text
s3://amplitude-raw-bucket/
├── {PROJECT_ID}/                              # Automated only
│   ├── {PROJECT_ID}_2026-01-27_10#0.json.gz
│   └── {PROJECT_ID}_2026-01-27_10_complete
└── {PROJECT_ID}-backfill/                     # Manual backfill only
    ├── {PROJECT_ID}-backfill_2026-01-20_19#0.json.gz
    └── {PROJECT_ID}-backfill_2026-01-20_19_complete
```

**Benefits:**

- Clear data lineage tracking
- Separate ETL runs for each path
- Easy to apply different retention policies
- Backfill data doesn't interfere with daily automation

## Implementation Pattern

### Configuration

```python
# Regular ETL reads from automated path
SOURCE_PATH_REGULAR = "s3://amplitude-raw-bucket/{PROJECT_ID}/"

# Backfill writes to separate path
SOURCE_PATH_BACKFILL = "s3://amplitude-raw-bucket/{PROJECT_ID}-backfill/"

# Both write to same refined path after processing
TARGET_PATH = "s3://amplitude-refined-bucket/event/"
```

### Backfill Job

```python
# jobs/amplitude/amplitude_backfill.py
RAW_PREFIX = "{PROJECT_ID}-backfill"  # Separate prefix for backfill

def save_to_raw_bucket(data: bytes, date: str, hour: int):
    """Save backfill data to separate S3 path."""
    base_key = f"{RAW_PREFIX}/{RAW_PREFIX}_{date}_{hour}"
    data_key = f"{base_key}#0.json.gz"
    # Saves to: s3://bucket/{PROJECT_ID}-backfill/{PROJECT_ID}-backfill_{date}_{hour}#0.json.gz
```

### Processing Backfill Data

To process backfilled data, run ETL with backfill path:

```bash
# Regular daily ETL (automated)
python cli.py amplitude-etl \
  --execution-date 2026-01-27 \
  --source-path s3://amplitude-raw-bucket/{PROJECT_ID}/

# Process backfill data (manual)
python cli.py amplitude-etl \
  --execution-date 2026-01-20 \
  --source-path s3://amplitude-raw-bucket/{PROJECT_ID}-backfill/
```

## Data Flow Diagram

```mermaid
flowchart LR
    A[Amplitude Export] -->|Auto Save| B[s3://.../{PROJECT_ID}/]
    B -->|Daily ETL| C[s3://.../event/]

    D[Backfill API] -->|Manual Save| E[s3://.../{PROJECT_ID}-backfill/]
    E -->|Manual ETL| C

    C --> F[Analytics/BI Tools]
```

## Benefits

| Aspect           | Benefit                                                               |
| ---------------- | --------------------------------------------------------------------- |
| **Traceability** | Know exactly which data was backfilled                                |
| **Control**      | Process backfill data on-demand, not automatically                    |
| **Debugging**    | Isolate issues to specific data source                                |
| **Lifecycle**    | Different retention policies (e.g., delete backfill after processing) |
| **Auditing**     | Track backfill operations separately                                  |
| **Safety**       | Backfill can't accidentally corrupt daily pipeline                    |

---

## When to Use This Pattern

Use separate paths when:

- Data comes from different sources (automated vs manual)
- Processing logic may differ between sources
- Need clear data lineage tracking
- Want to prevent accidental reprocessing
- Need different retention/lifecycle policies

## When NOT to Use

- **Identical data sources**: If all data comes from the same automated pipeline
  with the same format, separation adds unnecessary prefix management overhead.
- **Identical processing logic**: If regular and backfill data go through the
  exact same ETL with no distinction needed, separate paths just mean two runs
  instead of one.
- **No lineage requirement**: If you never need to trace data origin (e.g.,
  throwaway analytics), the complexity is not justified.
- **High-frequency small backfills**: If backfills happen constantly and are
  tiny, the operational overhead of managing two paths exceeds the benefit.
  Consider metadata tagging instead.

---

## Options Considered

| Option                      | Pros                                                                | Cons                                                    |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| **Separate S3 prefixes**    | Clear in `ListObjects`, no extra API calls, works with existing ETL | Two prefixes to manage, naming coordination             |
| **S3 object tags**          | Data in one location, simpler prefix structure                      | Not visible in `ListObjects`, extra API call per object |
| **Database metadata table** | Rich queryable metadata, flexible schema                            | Requires DB, extra write per upload, can drift from S3  |

## Why This Approach

Chose separate S3 prefixes because the primary need was preventing the daily ETL
from accidentally processing backfill data. Prefix-based separation achieves
this with zero code changes to the ETL reader — just point it at a different
prefix. S3 tags would have required modifying the ETL to filter by tag on every
run, adding latency and API cost.

---

## Alternative: Metadata Tagging

If separation isn't needed but tracking is, use S3 object tags:

```python
s3_client.put_object(
    Bucket=bucket,
    Key=key,
    Body=data,
    Tagging="source=backfill&manual=true"  # Tag instead of separate path
)
```

**Trade-off:** Tags require additional API calls to read, but keep data in one
location.
