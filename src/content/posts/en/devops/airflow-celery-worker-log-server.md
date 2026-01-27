---
title: Airflow Celery Worker Log Server Configuration
description: >-
  When using CeleryExecutor with workers on separate machines, the webserver
  needs
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - devops
  - airflow
  - celery
  - logging
category: devops
draft: false
lang: en
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/logging-tasks.html
    title: Airflow Task Logging Documentation
    type: official
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/executor/celery.html
    title: Airflow Celery Executor
    type: official
---

## The Problem

Error in Airflow UI when viewing task logs:

```text
Invalid URL 'http://:8793/log/dag_id=my_dag/...' No host supplied
```

The empty host (`:8793` instead of `worker-hostname:8793`) means the worker isn't
reporting its hostname to the Celery result backend.

## Root Cause

Three settings control worker log serving:

| Setting | Purpose | Default |
| ------- | ------- | ------- |
| `hostname` | Container hostname | Auto-detected |
| `WORKER_LOG_SERVER_PORT` | Port for log server | `8793` |
| `WORKER_LOG_SERVER_HOST` | Hostname workers advertise | **None** (auto-detect) |

When `WORKER_LOG_SERVER_HOST` is not set, Airflow tries to auto-detect the
hostname. Inside Docker containers, this often fails or returns an unusable value.

## Solution

Explicitly set all three in `docker-compose.yml`:

```yaml
services:
  worker:
    hostname: airflow-worker-1  # Container hostname
    environment:
      AIRFLOW__LOGGING__WORKER_LOG_SERVER_PORT: '8793'
      AIRFLOW__LOGGING__WORKER_LOG_SERVER_HOST: 'airflow-worker-1'  # Must match hostname
```

On the master side, add `extra_hosts` so the webserver can resolve the worker hostname:

```yaml
services:
  webserver:
    extra_hosts:
      - "airflow-worker-1:10.10.5.10"  # Worker's private IP
  scheduler:
    extra_hosts:
      - "airflow-worker-1:10.10.5.10"
```

## Key Points

- `WORKER_LOG_SERVER_HOST` must match the `hostname` setting
- Master's `extra_hosts` must map hostname to worker's actual IP
- Port 8793 must be open between master and worker (security group)
- Worker IP changes require updating master's `extra_hosts`

## Verification

After configuration, log URLs should show:

```text
http://airflow-worker-1:8793/log/dag_id=my_dag/...
```

Instead of:

```text
http://:8793/log/dag_id=my_dag/...
```
