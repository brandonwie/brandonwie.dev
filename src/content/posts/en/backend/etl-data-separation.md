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
  - url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-folders.html"
    title: using folders.html
    type: official
---

<script>
import Mermaid from '$lib/components/Mermaid.svelte';
</script>

Our Amplitude ETL pipeline had a gap. Several hours of event data were missing
from S3, so I ran a manual backfill using the Export API. The recovered files
landed in the same S3 prefix as the automated exports. Within a day, the daily
ETL job silently reprocessed the backfilled data, creating duplicate records in
the refined layer.

The root cause was not the backfill itself. It was that there was no way to
tell backfilled files apart from automated ones once they shared a prefix.

## Why This Matters

Mixing regular ETL data with manually recovered backfill data in the same S3
path creates four problems:

1. **No source tracking** -- You cannot distinguish automated vs manual data
2. **Uncontrolled processing** -- Daily ETL may accidentally process
   backfilled data
3. **Difficult debugging** -- Hard to trace which data came from where
4. **No lifecycle control** -- Cannot apply different retention policies

These problems compound over time. One accidental reprocessing might not
break anything visible. But when downstream dashboards show inflated numbers
and no one can pinpoint which data was counted twice, the debugging cost
grows fast.

## Options Explored

I considered three approaches:

| Option                      | Pros                                                                | Cons                                                    |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| **Separate S3 prefixes**    | Clear in `ListObjects`, no extra API calls, works with existing ETL | Two prefixes to manage, naming coordination             |
| **S3 object tags**          | Data in one location, simpler prefix structure                      | Not visible in `ListObjects`, extra API call per object |
| **Database metadata table** | Rich queryable metadata, flexible schema                            | Requires DB, extra write per upload, can drift from S3  |

S3 object tags seemed appealing at first -- keep everything in one prefix and
tag backfilled files. But tags are not visible in `ListObjects` responses.
Filtering by tag requires a separate `GetObjectTagging` call per object, which
adds latency and API cost proportional to the number of objects.

A database metadata table would provide the richest querying capability, but it
introduces a second source of truth that can drift from S3 reality. Every
upload needs an extra write, and the table needs its own maintenance.

## The Solution: Separate Storage Paths

Separate S3 prefixes won because the primary need was preventing the daily ETL
from accidentally processing backfill data. Prefix-based separation achieves
this with zero code changes to the ETL reader -- point it at a different prefix
and it works.

```text
s3://bucket/
├── raw-data/              # Regular automated ETL
│   └── data_2026-01-27.json
└── raw-data-backfill/     # Manual backfill recovery
    └── data_2026-01-20.json
```

### Amplitude ETL: Before and After

**Before separation** -- backfilled files mixed in with automated exports:

```text
s3://amplitude-raw-bucket/
└── {PROJECT_ID}/
    ├── {PROJECT_ID}_2026-01-27_10#0.json.gz  # Automated
    ├── {PROJECT_ID}_2026-01-27_10_complete
    ├── {PROJECT_ID}_2026-01-20_19#0.json.gz  # Backfilled - mixed!
    └── {PROJECT_ID}_2026-01-20_19_complete
```

**After separation** -- each source gets its own prefix:

```text
s3://amplitude-raw-bucket/
├── {PROJECT_ID}/                              # Automated only
│   ├── {PROJECT_ID}_2026-01-27_10#0.json.gz
│   └── {PROJECT_ID}_2026-01-27_10_complete
└── {PROJECT_ID}-backfill/                     # Manual backfill only
    ├── {PROJECT_ID}-backfill_2026-01-20_19#0.json.gz
    └── {PROJECT_ID}-backfill_2026-01-20_19_complete
```

## Implementation

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

To process backfilled data, run ETL with the backfill path:

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

### Data Flow

<Mermaid code={`flowchart LR
    A[Amplitude Export] -->|Auto Save| B[s3://.../{PROJECT_ID}/]
    B -->|Daily ETL| C[s3://.../event/]
    D[Backfill API] -->|Manual Save| E[s3://.../{PROJECT_ID}-backfill/]
    E -->|Manual ETL| C
    C --> F[Analytics/BI Tools]`} />

## Why This Works

The daily ETL never sees backfilled files because they live in a different
prefix. No filtering logic needed. No tags to check. No metadata table to
query. The ETL code does not change at all -- the separation happens at the
storage layer.

Both paths write to the same refined bucket after processing, so downstream
consumers get a unified view without needing to know about the separation.

| Aspect           | Benefit                                                               |
| ---------------- | --------------------------------------------------------------------- |
| **Traceability** | Know exactly which data was backfilled                                |
| **Control**      | Process backfill data on-demand, not automatically                    |
| **Debugging**    | Isolate issues to specific data source                                |
| **Lifecycle**    | Different retention policies (e.g., delete backfill after processing) |
| **Auditing**     | Track backfill operations separately                                  |
| **Safety**       | Backfill cannot accidentally corrupt daily pipeline                   |

## Practical Takeaway

**Use separate paths when:**

- Data comes from different sources (automated vs manual)
- Processing logic may differ between sources
- You need clear data lineage tracking
- You want to prevent accidental reprocessing
- You need different retention/lifecycle policies

**Keep a single path when:**

- All data comes from the same automated pipeline with the same format --
  separation adds unnecessary prefix management overhead.
- Regular and backfill data go through the exact same ETL with no distinction
  needed -- separate paths mean two runs instead of one.
- You never need to trace data origin (e.g., throwaway analytics) -- the
  complexity is not justified.
- Backfills happen constantly and are tiny -- consider metadata tagging
  instead.

If you do not need path separation but still want tracking, S3 object tags are
a lighter alternative:

```python
s3_client.put_object(
    Bucket=bucket,
    Key=key,
    Body=data,
    Tagging="source=backfill&manual=true"  # Tag instead of separate path
)
```

The trade-off: tags require additional API calls to read, but keep data in one
location.
