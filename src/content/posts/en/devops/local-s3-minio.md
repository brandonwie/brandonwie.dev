---
title: Local S3 with MinIO
description: MinIO is an S3-compatible object storage that runs locally via Docker.
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - devops
  - docker
  - s3
  - minio
  - local-dev
category: devops
draft: false
lang: en
references:
  - url: 'https://min.io/docs/minio/linux/index.html'
    title: MinIO Documentation
    type: official
---

## The Problem

Running ETL jobs against real AWS S3 during development is expensive, slow, and
risky. Every test run incurs API costs, requires internet access, and risks
accidentally reading or writing production data. There was no safe, offline way
to iterate on S3-dependent code.

---

## Difficulties Encountered

- **boto3 virtual-hosted style** — boto3 defaults to virtual-hosted style URLs
  (`bucket.s3.amazonaws.com`), which MinIO does not support. Figuring out that
  `addressing_style: "path"` was needed took trial and error with cryptic
  connection-refused errors.
- **PySpark S3A vs S3** — Spark uses the `s3a://` protocol (Hadoop connector),
  not `s3://`, and requires its own separate configuration keys
  (`spark.hadoop.fs.s3a.*`). The boto3 config does not carry over.
- **MinIO startup race condition** — The `minio-init` container that creates
  buckets would fail if MinIO had not fully started. Required adding
  `condition: service_healthy` in Docker Compose.
- **SSL mismatch** — MinIO runs on plain HTTP locally, but S3A defaults to SSL.
  Forgetting `connection.ssl.enabled=false` produces TLS handshake errors that
  look like network problems.

---

## Options Considered

| Option          | Pros                                                                   | Cons                                                              |
| --------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **MinIO**       | 100% S3 API compatible, lightweight Docker image, web console included | Path-style only, no other AWS service emulation                   |
| **LocalStack**  | Emulates many AWS services (S3, SQS, Lambda, etc.)                     | Heavier resource usage, free tier has limitations, slower startup |
| **Real AWS S3** | No emulation gaps, production-identical                                | Costs money, requires internet, risk of touching prod data        |

## Why This Approach

Chose MinIO because the project only needs S3 (not SQS, Lambda, etc.). MinIO is
lighter, starts faster, and has perfect S3 API compatibility. If other AWS
services were needed, LocalStack would be the better choice.

---

## Why Use MinIO

| Benefit            | Description                   |
| ------------------ | ----------------------------- |
| No AWS costs       | Free local development        |
| Works offline      | No network dependency         |
| Safe sandbox       | Won't touch production data   |
| 100% S3 compatible | Same API, drop-in replacement |

## Docker Compose Setup

```yaml
services:
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000" # S3 API
      - "9001:9001" # Web console
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio-data:/data

  # Auto-create buckets on startup
  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c " mc alias set local http://minio:9000 minioadmin minioadmin;
      mc mb local/my-bucket --ignore-existing; "

volumes:
  minio-data:
```

## Code Configuration

### boto3 Factory Function

```python
import os
import boto3
from botocore.config import Config as BotoConfig

def get_s3_client(region_name: str | None = None):
    endpoint_url = os.getenv("AWS_ENDPOINT_URL")
    use_path_style = os.getenv("AWS_S3_USE_PATH_STYLE", "false").lower() == "true"
    region = region_name or os.getenv("AWS_REGION", "ap-northeast-2")

    client_kwargs = {"region_name": region}

    if endpoint_url:
        client_kwargs["endpoint_url"] = endpoint_url
        if use_path_style:
            client_kwargs["config"] = BotoConfig(s3={"addressing_style": "path"})

    return boto3.client("s3", **client_kwargs)
```

### PySpark S3A Configuration

```python
endpoint_url = os.getenv("AWS_ENDPOINT_URL")

if endpoint_url:
    builder = (
        builder
        .config("spark.hadoop.fs.s3a.endpoint", endpoint_url)
        .config("spark.hadoop.fs.s3a.path.style.access", "true")
    )
    if endpoint_url.startswith("http://"):
        builder = builder.config("spark.hadoop.fs.s3a.connection.ssl.enabled", "false")
```

## Environment Variables

```bash
# Local (MinIO)
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_ENDPOINT_URL=http://localhost:9000
AWS_S3_USE_PATH_STYLE=true

# Production (real AWS)
# Just don't set AWS_ENDPOINT_URL - uses real S3 by default
```

## Path Style vs Virtual Hosted

| Style          | URL Format                                   | Used By          |
| -------------- | -------------------------------------------- | ---------------- |
| Virtual-hosted | `https://bucket.s3.region.amazonaws.com/key` | AWS (default)    |
| Path           | `http://host:port/bucket/key`                | MinIO (required) |

MinIO doesn't support virtual-hosted style, so `path.style.access=true` is
required.

## Access Methods

| Method      | URL                                              |
| ----------- | ------------------------------------------------ |
| Web Console | `http://localhost:9001`                          |
| S3 API      | `http://localhost:9000`                          |
| AWS CLI     | `aws s3 ls --endpoint-url http://localhost:9000` |

---

## When to Use

- Local development of any S3-dependent code (ETL, file uploads, backups)
- CI/CD pipelines that need S3 for integration tests without AWS credentials
- Offline development where internet access is unreliable or unavailable
- Rapid iteration where real S3 latency would slow the feedback loop

---

## When NOT to Use

- **Multi-service AWS emulation** — If you need SQS, Lambda, DynamoDB, etc.
  alongside S3, use LocalStack instead; MinIO only emulates S3
- **S3 Select or Glacier** — MinIO does not support all S3 features; advanced
  features like S3 Select, Glacier tiers, or S3 Object Lock may behave
  differently or be absent
- **Performance benchmarking** — Local MinIO on Docker has different latency and
  throughput characteristics than real S3; do not use it for performance testing
- **Virtual-hosted style URLs** — If your code relies on virtual-hosted bucket
  URLs and cannot be configured for path-style, MinIO will not work without code
  changes
