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
  - url: 'https://www.docs.developers.amplitude.com/analytics/apis/export-api/'
    title: Amplitude Export API Documentation
    type: official
source_content_hash: bdfb0c62385dd76fd10cc36c74803a568d87b1f0051cf0b8bfa279cdc98bc74b
---

easy to misunderstand.

---

## The Problem

The Amplitude Export API returns files named `*.json.gz`, which strongly implies
they are simple gzip-compressed JSON. But they are actually ZIP archives
containing a gzip file inside. Treating them as plain gzip (e.g.,
`gzip.decompress()`) fails silently or throws a cryptic error, and the
double-layer nesting is not obvious from the documentation.

## Difficulties Encountered

- **File extension is a lie** — `.json.gz` implies gzip, but the outer layer is
  a ZIP file (`PK` magic bytes). Standard gzip tools and libraries reject it
  with unhelpful error messages.
- **Documentation does not clarify the nesting** — The Amplitude Export API docs
  mention "gzipped JSON" without specifying the outer ZIP wrapper, leading to
  wasted debugging time.
- **Magic byte inspection required** — The only reliable way to discover the
  true format was to hex-dump the first bytes of the response and check for `PK`
  (ZIP) vs `\x1f\x8b` (GZIP).
- **Empty/corrupt exports** — Some hourly exports return empty ZIP files or
  files with empty namelists, requiring validation before attempting extraction
  (BadZipFile errors).

---

## The Misleading Extension

Files are named `*.json.gz` but they're NOT simple gzip files:

```text
{PROJECT_ID}_{DATE}_{HOUR}#0.json.gz
└── Actually a ZIP file (magic: PK / 0x504B)
    └── Contains: {PROJECT_ID}/{PROJECT_ID}_{DATE}_{HOUR}#0.json.gz
        └── This inner file IS gzip (magic: 0x1F8B)
            └── Contains: Newline-delimited JSON events
```

## File Magic Bytes

| Format | Magic Bytes | Hex      |
| ------ | ----------- | -------- |
| ZIP    | `PK`        | `0x504B` |
| GZIP   | `\x1f\x8b`  | `0x1F8B` |

## How to Read

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

## Event Structure

Each line is a JSON object with these key fields:

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

## API Endpoint

```bash
# Export API URL
https://amplitude.com/api/2/export?start={YYYYMMDD}T{HH}&end={YYYYMMDD}T{HH}

# Example: Get hour 10 of 2026-01-26
curl -u "API_KEY:SECRET_KEY" \
  "https://amplitude.com/api/2/export?start=20260126T10&end=20260126T11"
```

## Error Codes

| Code | Meaning        | Action                         |
| ---- | -------------- | ------------------------------ |
| 200  | Success        | Process data                   |
| 400  | Data > 4GB     | Skip (use smaller time range)  |
| 404  | No data        | Normal for quiet hours         |
| 429  | Rate limited   | Retry with exponential backoff |
| 504  | Server timeout | Log and skip                   |

---

## When to Use

- Building any ETL or data pipeline that consumes Amplitude Export API responses
- Debugging why `gzip.decompress()` fails on Amplitude export files
- Writing validation logic for raw Amplitude data before storage (empty ZIP
  handling, BadZipFile guards)

## When NOT to Use

- **Amplitude Batch Event Upload API** — The upload API accepts plain JSON; this
  nested format only applies to the Export API response
- **Amplitude SDKs or integrations** — If using Segment, mParticle, or
  Amplitude's own warehouse sync, the data arrives in the integration's format,
  not this ZIP+GZIP nesting
- **Other analytics platforms** — Mixpanel, Heap, PostHog, etc. have their own
  export formats; do not assume they share Amplitude's nesting

---

## Reference

- [Amplitude Export API Docs](https://www.docs.developers.amplitude.com/analytics/apis/export-api/)
