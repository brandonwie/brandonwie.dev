---
title: Amplitude ETL Partitioning
description: >-
  How Amplitude event data is partitioned when moving from raw to refined
  storage.
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - backend
  - etl
  - amplitude
  - spark
  - partitioning
category: backend
draft: false
lang: en
references:
  - url: 'https://amplitude.com/docs/analytics/apis/export-api'
    title: export api
    type: verified
  - url: 'https://spark.apache.org/docs/latest/sql-data-sources-parquet.html'
    title: Apache Spark Parquet Data Source
    type: official
source_content_hash: d6051c1d7d661d7654825e4061d6189443673c85e42fa80cd23b4d72e18dfde4
expanded: true
---

I was reviewing our Amplitude ETL pipeline's output and noticed that 5-10% of events were landing on the wrong date in the refined data layer. A session that happened on January 20th was showing up in the January 25th partition. The raw export files were organized by arrival time — the hour the Amplitude Export API returned them — but mobile SDK events regularly arrive late due to offline users and batched uploads. We were partitioning by the wrong timestamp.

## The Problem

When ingesting Amplitude event data into a data lake, raw files are organized by arrival time (when the export API returned them). But events inside those files can belong to earlier dates — late-arriving data from mobile devices that were offline, or batched uploads that got delayed. If the ETL partitions refined data by arrival time instead of event time, analytics queries produce incorrect results. Events appear on the wrong date, and any daily metrics derived from those partitions are inaccurate.

The raw file naming makes this worse. Files are named `{PROJECT_ID}_2026-01-25_18#0.json.gz`, where `2026-01-25_18` is the export hour. It looks like a date partition, but it's the arrival time, not the event time. Anyone reading the S3 structure for the first time would naturally assume the date in the filename is when the events occurred.

## The Key Insight: Partition by Event Time

The ETL must use `event_time` (when the event occurred in the user's app) for partitioning, not arrival time (when the file was exported). This ensures late-arriving data lands in the correct date partition:

```python
# Extracts date from event_time, NOT from filename
to_date(col("event_time")).alias("dt"),
```

The write step uses append mode with Hive-style partitioning:

```python
def write_to_s3(df, output_path, partition_cols=["dt"]):
    df.write.mode("append").partitionBy(*partition_cols).parquet(output_path)
```

`mode("append")` is important here — it allows late-arriving data to be added to existing partitions. Spark creates `part-*.parquet` files within each `dt=YYYY-MM-DD/` directory. The trade-off is that rerunning the ETL creates duplicate files in a partition. You need downstream deduplication to handle this, or use an overwrite strategy with careful partition management.

## Options I Considered

| Option                                    | Pros                                      | Cons                                                               |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| Partition by arrival time (filename date) | Simple, no parsing needed                 | Late-arriving events land on wrong date; analytics are inaccurate  |
| Partition by event_time (chosen)          | Correct date placement; late data handled | Requires parsing event payload; append mode needs dedup downstream |
| Partition by both (dual write)            | Supports both access patterns             | Double storage cost; complexity maintaining two partition schemes  |

Partitioning by `event_time` was the clear winner because analytical queries almost always filter by "when the event happened," not "when we received the file." The 5-10% misplacement rate from arrival-time partitioning was unacceptable for daily business metrics.

## The Backfill Gap

One issue I discovered during this analysis: the weekly backfill job fetches missing raw files from the Amplitude Export API but does not run the ETL transformation. The daily ETL only processes `yesterday_ds` (yesterday's date). Backfilled data for older dates sits in the raw bucket with no path to the refined layer.

Potential fixes:
1. Have the backfill job also run the ETL transformation
2. Have the backfill trigger a re-processing DAG for affected dates
3. Create a separate "catchup ETL" DAG that processes raw files missing from refined

## DAG-Job Variable Mismatch

Another operational issue: the Airflow DAG passes `SOURCE_PATH`, `TARGET_PATH`, and `MANIFEST_PATH` as environment variables, but the Spark job ignores them and uses hardcoded constants:

| Variable        | Passed by DAG | Used by Job  |
| --------------- | ------------- | ------------ |
| `SOURCE_PATH`   | Yes           | No (hardcoded) |
| `TARGET_PATH`   | Yes           | No (hardcoded) |
| `MANIFEST_PATH` | Yes           | No (hardcoded) |

This makes testing and debugging unreliable — you think you're pointing the job at a test path, but it's actually reading from and writing to the hardcoded production paths. The fix is to update the job to read from `os.getenv()` instead of constants.

## Testing

```bash
# Test ETL for specific date
python cli.py amplitude-etl \
  --execution-date 2026-01-26 \
  --source-path "s3://amplitude-raw-bucket/{PROJECT_ID}/" \
  --target-path "s3://amplitude-refined-bucket/event/"

# Test backfill for date range
python cli.py amplitude-backfill \
  --start-date 2026-01-20 \
  --end-date 2026-01-26
```

## Takeaway

When building an ETL pipeline for event data from Amplitude (or any analytics platform with mobile SDK data), always partition by `event_time`, not arrival time. Late-arriving data is common with mobile SDKs — offline users, batched uploads, and network delays consistently push 5-10% of events to later export files. Arrival-time partitioning silently misplaces these events, making daily analytics inaccurate.

## References

- [Amplitude Export API](https://amplitude.com/docs/analytics/apis/export-api)
- [Apache Spark Parquet Data Source](https://spark.apache.org/docs/latest/sql-data-sources-parquet.html)
