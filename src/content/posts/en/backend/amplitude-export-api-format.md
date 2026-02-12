---
title: Amplitude Export API Response Format
description: >-
  The Amplitude Export API returns data in a **nested compression format** that
  is
date: 2026-01-27T00:00:00.000Z
updated: 2026-02-06T00:00:00.000Z
tags:
  - backend
  - amplitude
  - api
  - data-format
category: backend
draft: false
lang: en
references:
  - url: "https://www.docs.developers.amplitude.com/analytics/apis/export-api/"
    title: Amplitude Export API Documentation
    type: official
---

I called `gzip.decompress()` on an Amplitude export file and got a cryptic
error. The file was named `*.json.gz`, so naturally I assumed it was gzipped
JSON. It was not. Thirty minutes of debugging later, I hex-dumped the first
bytes and found `PK` -- the magic bytes for a ZIP file, not GZIP.

The Amplitude Export API returns files with a `.json.gz` extension that are
not gzip files. They are ZIP archives containing a gzip file inside. This
double-layer nesting is not obvious from the documentation, and the misleading
file extension sends you down the wrong debugging path.

## The Misleading Extension

Files are named `*.json.gz` but the actual structure is nested:

```text
{PROJECT_ID}_{DATE}_{HOUR}#0.json.gz
└── Actually a ZIP file (magic: PK / 0x504B)
    └── Contains: {PROJECT_ID}/{PROJECT_ID}_{DATE}_{HOUR}#0.json.gz
        └── This inner file IS gzip (magic: 0x1F8B)
            └── Contains: Newline-delimited JSON events
```

The outer layer is a ZIP archive. Inside that ZIP is a gzip-compressed file.
Inside that gzip file is newline-delimited JSON. Three layers of wrapping,
and the file extension only describes the middle one.

## How to Identify the Format

The reliable way to distinguish ZIP from GZIP is by inspecting the magic
bytes at the start of the file:

| Format | Magic Bytes | Hex      |
| ------ | ----------- | -------- |
| ZIP    | `PK`        | `0x504B` |
| GZIP   | `\x1f\x8b`  | `0x1F8B` |

Standard gzip tools and Python's `gzip.decompress()` will reject a ZIP file
with unhelpful error messages. The Amplitude Export API docs mention "gzipped
JSON" without specifying the outer ZIP wrapper, which is why this is easy to
miss.

## Reading Amplitude Export Files

Here is the correct approach -- unzip the outer layer, decompress the inner
gzip, then parse the newline-delimited JSON:

```python
import zipfile
import gzip
import json
import io

def read_amplitude_export(raw_data: bytes) -> list[dict]:
    # Outer layer: ZIP
    with zipfile.ZipFile(io.BytesIO(raw_data)) as zf:
        inner_file = zf.namelist()[0]

        # Inner layer: GZIP
        with zf.open(inner_file) as f:
            json_data = gzip.decompress(f.read()).decode()

    # Content: Newline-delimited JSON
    events = [json.loads(line) for line in json_data.strip().split('\n')]
    return events
```

Note the validation consideration: some hourly exports return empty ZIP files
or files with empty namelists. In production code, check `zf.namelist()`
before indexing, and wrap the extraction in a `try/except` for
`BadZipFile` errors.

## Event Structure

Each line in the decompressed output is a JSON object representing one event:

```json
{
  "event_type": "session_end",
  "event_time": "2026-01-26 04:23:35.379000",
  "user_id": "user@example.com",
  "device_id": "6fd6899d-2b08-40e3-b723-e4ca1f848a43",
  "platform": "Web",
  "country": "South Korea",
  "city": "Suwon",
  "event_properties": {},
  "user_properties": {
    "utm_source": "longblack"
  }
}
```

The `event_time` field is the timestamp when the event occurred on the user's
device -- this is what you should use for partitioning, not the date in the
filename (which represents when Amplitude exported the file).

## API Endpoint

```bash
# Export API URL
https://amplitude.com/api/2/export?start={YYYYMMDD}T{HH}&end={YYYYMMDD}T{HH}

# Example: Get hour 10 of 2026-01-26
curl -u "API_KEY:SECRET_KEY" \
  "https://amplitude.com/api/2/export?start=20260126T10&end=20260126T11"
```

The API returns one ZIP file per request. Each request covers a time range
specified in hours. The response is the nested ZIP > GZIP > NDJSON format
described above.

## Error Codes

| Code | Meaning        | Action                         |
| ---- | -------------- | ------------------------------ |
| 200  | Success        | Process data                   |
| 400  | Data > 4GB     | Skip (use smaller time range)  |
| 404  | No data        | Normal for quiet hours         |
| 429  | Rate limited   | Retry with exponential backoff |
| 504  | Server timeout | Log and skip                   |

A 404 is not an error -- it means no events were recorded during that hour.
A 400 means the response would exceed 4GB; narrow the time range and retry.

## When to Use This Knowledge

This format applies when building any ETL or data pipeline that consumes
Amplitude Export API responses. It is also relevant when debugging why
`gzip.decompress()` fails on Amplitude export files, or when writing
validation logic for raw Amplitude data before storage (empty ZIP handling,
`BadZipFile` guards).

## When This Does NOT Apply

- **Amplitude Batch Event Upload API** -- The upload API accepts plain JSON.
  This nested format only applies to the Export API response.
- **Amplitude SDKs or integrations** -- If using Segment, mParticle, or
  Amplitude's own warehouse sync, the data arrives in the integration's
  format, not this ZIP+GZIP nesting.
- **Other analytics platforms** -- Mixpanel, Heap, PostHog, etc. have their
  own export formats. Do not assume they share Amplitude's nesting.

## Key Takeaway

The `.json.gz` extension is a lie. Amplitude export files are ZIP archives
containing gzip files containing newline-delimited JSON. Always inspect magic
bytes (`PK` = ZIP, `\x1f\x8b` = GZIP) rather than trusting the file
extension. Build your extraction pipeline with both layers and add validation
for empty or corrupt exports.
