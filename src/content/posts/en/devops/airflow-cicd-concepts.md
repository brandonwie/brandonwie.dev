---
title: Airflow CI/CD Concepts
description: Understanding Airflow deployment and CI/CD concepts through a kitchen analogy.
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - devops
  - airflow
  - cicd
  - docker
  - work
category: devops
draft: false
lang: en
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/production-deployment.html
    title: Production Deployment — Airflow Documentation
    type: official
---

## DAG vs ETL

### DAG = Recipe Card

A DAG (Directed Acyclic Graph) is like a recipe card. It tells:

- **WHAT** to cook (which tasks to run)
- **WHEN** to cook (schedule: daily, hourly, etc.)
- **IN WHAT ORDER** (task A before task B)

```python
# This is a DAG - it's just instructions, not the actual work
with DAG('amplitude_pipeline', schedule='@daily'):
    task1 = "Fetch data from Amplitude"      # Step 1
    task2 = "Transform the data"              # Step 2
    task3 = "Save to database"                # Step 3
    task1 >> task2 >> task3   # Do in this order
```

### ETL = The Actual Cooking

ETL (Extract, Transform, Load) is the actual code that does the work:

- **E = Extract**: Get data (connect to API, download events)
- **T = Transform**: Process data (clean, calculate, join)
- **L = Load**: Save results (to S3, database)

**Key insight:** The DAG doesn't process data. It just says "run this container now."

## Hot-Reload vs Restart

### NO RESTART Needed (90% of cases)

| Change                        | What happens                           |
| ----------------------------- | -------------------------------------- |
| `dags/my_dag.py` (new/modify) | Scheduler auto-detects in ~30 sec      |
| ETL code (arch-etl)           | Next DAG run uses new container        |

### RESTART Required (10% of cases)

| Change            | Why restart                                  |
| ----------------- | -------------------------------------------- |
| Airflow version   | New image = need to restart                  |
| requirements.txt  | New Python packages need to be in image      |
| Dockerfile        | Image changed = rebuild + restart            |
| .env file         | Environment variables loaded at container start |

## Deployment Scenarios

| Scenario            | Action                   | Restart? | Downtime    |
| ------------------- | ------------------------ | -------- | ----------- |
| DAG changes         | git pull on EC2          | No       | None (~30s) |
| ETL code changes    | ECR push                 | No       | None        |
| Airflow upgrade     | Image rebuild + restart  | Yes      | ~1-2 min    |

## The Three Repos Pattern

| Repo             | Contains        | Deploy How                   | Restart?           |
| ---------------- | --------------- | ---------------------------- | ------------------ |
| `arch-airflow`   | DAG files       | git pull to EFS              | No                 |
| `arch-airflow`   | Airflow images  | ECR + docker restart         | Yes (rare)         |
| `arch-etl`       | ETL job code    | ECR push                     | No (auto-pulls latest) |
| `backend-infra`  | Infrastructure  | Terraform (one-time)         | N/A                |

## Key Takeaways

1. **DAG = Recipe** (what/when/order), **ETL = Cooking** (actual work)
2. **DAG doesn't touch data** - it just tells the worker "run this container now"
3. **Most deployments don't need restart** - DAGs and ETL are hot-reloaded
4. **Only restart for Airflow image changes** (version upgrade, new packages)
5. **arch-etl containers are ephemeral** - they run, do work, exit, get deleted
