---
title: boto3 S3 put_object() Body Parameter Encoding
description: An ETL pipeline that uploaded JSON manifest files to S3 was failing with a
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - devops
  - aws
  - s3
  - boto3
  - python
category: devops
draft: false
lang: en
references:
  - url: >-
      https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3/client/put_object.html
    title: boto3 S3 Client put_object() Documentation
    type: official
source_content_hash: 921453854cb04593c03757accb74c386eff31c0a3f7c0720e4912fa975ee3bfc
---

cryptic parameter validation error. The `json.dumps()` call returned a Python
string, but `boto3.client('s3').put_object()` expects the `Body` parameter to be
`bytes`, `bytearray`, or a file-like object. Passing a `str` directly causes a
runtime parameter validation error that does not mention encoding at all.

---

## Difficulties Encountered

- **Error message does not mention encoding** - The error says "Invalid type for
  parameter Body" and lists valid types (`bytes`, `bytearray`, file-like), but
  never suggests `.encode()`. If you do not already know that `json.dumps()`
  returns `str`, the connection is not obvious.
- **Works in Python 2 muscle memory** - In Python 2, `str` was bytes. Developers
  with Python 2 experience may not realize that Python 3 `str` is Unicode text,
  not bytes, leading to confusion about why a "string" is rejected.
- **Caught by Copilot, not tests** - This bug was found during a PR review by
  GitHub Copilot, not by unit tests. The `put_object` call was in a code path
  that only ran during actual S3 uploads, which local tests mocked away.
- **Easy to miss in copy-paste** - Many S3 upload examples online omit the
  `.encode("utf-8")` step, especially older ones. The bug gets silently
  introduced when copying example code.

---

## The Solution

Always encode JSON strings to bytes using `.encode("utf-8")` before uploading to
S3:

```python
import json
import boto3

s3_client = boto3.client('s3')

# BAD - will fail parameter validation
manifest = {"key": "value"}
s3_client.put_object(
    Bucket="my-bucket",
    Key="manifest.json",
    Body=json.dumps(manifest, indent=2),  # ❌ Returns str
    ContentType="application/json",
)

# GOOD - encodes to bytes
s3_client.put_object(
    Bucket="my-bucket",
    Key="manifest.json",
    Body=json.dumps(manifest, indent=2).encode("utf-8"),  # ✅ Returns bytes
    ContentType="application/json",
)
```

## Why UTF-8?

- **Standard**: UTF-8 is the default encoding for JSON (RFC 8259)
- **Compatibility**: AWS S3 expects UTF-8 for text content
- **Safety**: Handles all Unicode characters correctly

## Alternative: Use bytes directly

```python
# Write bytes directly without json.dumps()
import json

data_bytes = json.dumps(manifest, indent=2).encode("utf-8")
s3_client.put_object(
    Bucket="my-bucket",
    Key="manifest.json",
    Body=data_bytes,
    ContentType="application/json",
)
```

---

## When to Use

- Any time you call `s3.put_object()` with text content (JSON, CSV, plain text)
- When building ETL pipelines that write output files to S3
- When serializing Python objects to JSON for S3 storage
- Any boto3 API that accepts a `Body` parameter with text data

---

## When NOT to Use

- **Binary data** (images, PDFs, Parquet files) - these are already bytes; do
  not encode them
- **File-like objects** - if you open a file with `open(path, "rb")`, pass the
  file handle directly; no `.encode()` needed
- **`s3.upload_file()` or `s3.upload_fileobj()`** - these methods handle
  encoding internally and expect file paths or file objects, not byte strings
- **AWS SDK v2 / resource API** - `s3.Object().put()` behaves the same way, but
  `s3.upload_file()` abstracts this away entirely

---

## Common Mistake Locations

Check these locations in ETL pipelines:

1. Manifest file uploads
2. Metadata/stats file uploads
3. Configuration file uploads
4. Any JSON serialization before S3 upload
