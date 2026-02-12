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

I clicked "View Log" in the Airflow UI and got a blank error page instead of
task output. The URL showed `http://:8793/log/...` with an empty host. I spent
an hour checking security groups and network routes before realizing the problem
was in Airflow's hostname configuration, not the network layer.

## Why This Matters

When running Airflow with CeleryExecutor across separate EC2 instances, the
webserver fetches task logs from workers via HTTP on port 8793. Each worker runs
a small log server that exposes its task log files. The webserver constructs a
URL using the hostname the worker advertises to the Celery result backend. If
that hostname is empty or wrong, the webserver has no idea where to fetch logs
from.

This is a common scenario in production Airflow deployments where the scheduler
and webserver live on one machine (or set of containers) and workers live on
separate EC2 instances to handle compute-heavy tasks.

## The Error

The Airflow UI shows this when the hostname is misconfigured:

```text
Invalid URL 'http://:8793/log/dag_id=my_dag/...' No host supplied
```

That empty host (`:8793` instead of `worker-hostname:8793`) is the telltale
sign. The worker is not reporting its hostname to the Celery result backend.

## What Made This Hard to Debug

The error message is misleading. "No host supplied" reads like a URL parsing
issue, so my first instinct was to check network connectivity, DNS resolution,
and security groups. None of that was the problem.

Inside Docker containers, Airflow tries to auto-detect the hostname. It fails
silently, returning an empty string instead of raising an error. There is no
warning in the logs that detection failed. You just get a broken URL at log
fetch time.

The real challenge is that three settings must align: the container `hostname`,
the `WORKER_LOG_SERVER_HOST` environment variable, and the master's
`extra_hosts` mapping. Missing any one of them produces the same opaque error.
Most documentation focuses on the worker side, so the `extra_hosts` mapping on
the webserver/scheduler is easy to overlook.

## Root Cause

Three settings control worker log serving:

| Setting                  | Purpose                    | Default                |
| ------------------------ | -------------------------- | ---------------------- |
| `hostname`               | Container hostname         | Auto-detected          |
| `WORKER_LOG_SERVER_PORT` | Port for log server        | `8793`                 |
| `WORKER_LOG_SERVER_HOST` | Hostname workers advertise | **None** (auto-detect) |

When `WORKER_LOG_SERVER_HOST` is not set, Airflow tries to auto-detect the
hostname. Inside Docker containers, this often fails or returns an unusable
value.

## The Fix

Explicitly set all three in `docker-compose.yml` on the worker side:

```yaml
services:
  worker:
    hostname: airflow-worker-1 # Container hostname
    environment:
      AIRFLOW__LOGGING__WORKER_LOG_SERVER_PORT: "8793"
      AIRFLOW__LOGGING__WORKER_LOG_SERVER_HOST: "airflow-worker-1" # Must match hostname
```

On the master side, add `extra_hosts` so the webserver and scheduler can resolve
the worker hostname to its actual IP:

```yaml
services:
  webserver:
    extra_hosts:
      - "airflow-worker-1:10.10.5.10" # Worker's private IP
  scheduler:
    extra_hosts:
      - "airflow-worker-1:10.10.5.10"
```

The `WORKER_LOG_SERVER_HOST` value must match the `hostname` setting exactly.
The master's `extra_hosts` must map that hostname to the worker's private IP.
And port 8793 must be open between master and worker in the security group.

## Why This Works

The worker advertises `airflow-worker-1` as its hostname to the Celery result
backend. When the webserver needs to fetch logs, it constructs the URL
`http://airflow-worker-1:8793/log/...`. The `extra_hosts` entry resolves
`airflow-worker-1` to `10.10.5.10`, so the HTTP request reaches the correct
machine.

Without explicit configuration, Docker returns an empty or internal-only
hostname that the webserver cannot resolve across the network.

## Verification

After applying the configuration, log URLs should show the proper hostname:

```text
http://airflow-worker-1:8793/log/dag_id=my_dag/...
```

Instead of the broken version:

```text
http://:8793/log/dag_id=my_dag/...
```

## Practical Takeaway

Use this configuration for any multi-node Airflow deployment with
CeleryExecutor, whether on separate EC2 instances or separate Docker hosts.

You do not need this if you are running single-node Airflow with
LocalExecutor, managed Airflow (MWAA, Cloud Composer), KubernetesExecutor
(which fetches logs via the Kubernetes API), or S3/GCS remote logging (where
the webserver reads from the cloud bucket directly).

One gotcha: if the worker IP changes (e.g., after instance replacement), you
must update the master's `extra_hosts` mapping. For dynamic environments,
consider using a service discovery mechanism or switching to remote log storage
instead.
