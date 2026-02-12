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
---

Our ETL pipeline was uploading JSON manifest files to S3 after each run.
It worked in development (where we mocked S3) and failed in production with a
cryptic parameter validation error. The fix was a single `.encode("utf-8")`
call, but finding it took longer than it should have.

## Why This Matters

`json.dumps()` returns a Python `str` (Unicode text in Python 3).
`boto3.client('s3').put_object()` expects the `Body` parameter to be `bytes`,
`bytearray`, or a file-like object. Passing a `str` directly causes a runtime
parameter validation error. This is one of those bugs that slips through local
testing because S3 calls are typically mocked, and it only surfaces in
production or integration tests.

## The Error

Here is what boto3 throws:

```text
Parameter validation failed:
Invalid type for parameter Body, value: <str>, type: <class 'str'>,
valid types: <class 'bytes'>, <class 'bytearray'>, file-like object
```

The error lists valid types but never suggests `.encode()`. If you do not
already know that `json.dumps()` returns `str` (not `bytes`), the connection is
not obvious.

## What Made This Hard to Catch

The error message does not mention encoding at all. It says "Invalid type for
parameter Body" and lists valid types. You have to connect the dots yourself:
`json.dumps()` returns `str`, `str` is not `bytes`, therefore you need
`.encode()`.

If you have Python 2 muscle memory, this is especially confusing. In Python 2,
`str` was bytes. In Python 3, `str` is Unicode text. A "string" getting rejected
by an API that accepts "strings" (in the bytes sense) is a classic Python 2
to 3 trip-up.

This particular bug was caught by GitHub Copilot during a PR review, not by unit
tests. The `put_object` call was in a code path that only ran during actual S3
uploads, which local tests mocked away. Many S3 upload examples online omit the
`.encode("utf-8")` step, especially older ones, so the bug gets silently
introduced when copying example code.

## The Fix

Always encode JSON strings to bytes before uploading to S3:

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

You can also assign to a variable first for clarity:

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

## Why UTF-8

UTF-8 is the default encoding for JSON per RFC 8259. AWS S3 expects UTF-8 for
text content. It handles all Unicode characters correctly. There is no reason to
use any other encoding for JSON data going to S3.

## Practical Takeaway

Add `.encode("utf-8")` any time you call `s3.put_object()` with text content:
JSON, CSV, plain text, or any serialized string data. This applies to ETL
pipelines writing output files, manifest uploads, metadata files, and
configuration files.

You do not need `.encode()` for binary data (images, PDFs, Parquet files) since
those are already bytes. You also do not need it when passing file-like objects
opened with `open(path, "rb")`, or when using `s3.upload_file()` /
`s3.upload_fileobj()` which handle encoding internally.

Check these locations in your ETL pipelines if you hit this error:

1. Manifest file uploads
2. Metadata/stats file uploads
3. Configuration file uploads
4. Any JSON serialization before S3 upload

The rule is simple: if you call `json.dumps()` and pass the result to
`put_object()`, add `.encode("utf-8")` between them.
