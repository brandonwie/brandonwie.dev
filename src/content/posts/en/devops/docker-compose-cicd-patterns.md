---
title: Docker Compose CI/CD Patterns
description: 'Patterns for using Docker Compose in CI/CD pipelines, particularly separating'
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - devops
  - docker
  - cicd
  - work
category: devops
draft: false
lang: en
references:
  - url: 'https://docs.docker.com/compose/how-tos/production/'
    title: Use Compose in production — Docker Docs
    type: official
source_content_hash: 19f34c82926f431710a23a36398203540637fc22bbe71103353aaa0df28b563b
---

dev and prod configurations.

## The Build vs Image Problem

### The Issue

When docker-compose.yml uses `build:` directive, `docker-compose pull` does
nothing:

```yaml
# docker-compose.yml
services:
  webserver:
    build: # ← "Build locally"
      context: ..
      dockerfile: master/Dockerfile
```

```bash
docker-compose pull  # ← Does nothing! No image to pull
docker-compose up -d # ← Builds locally instead
```

**Analogy:** Like telling someone "follow this recipe" (build) when you already
cooked the meal and put it in the fridge (ECR).

### The Solution: Separate Files

```text
project/
├── docker-compose.yml       # Local development (build:)
└── docker-compose.prod.yml  # Production (image:)
```

**Local Development:**

```yaml
# docker-compose.yml
services:
  webserver:
    build:
      context: ..
      dockerfile: master/Dockerfile
```

**Production:**

```yaml
# docker-compose.prod.yml
services:
  webserver:
    image: ${ECR_REGISTRY}/airflow-master:latest # ← Pull from ECR
```

## CI/CD Pipeline Flow

```text
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions (deploy.yml)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. detect-changes                                               │
│     └─ Detect if dags/ or master/, worker/ changed              │
│                                                                  │
│  2a. sync-dags (DAG only changes)                               │
│      └─ EC2: git pull                                           │
│      └─ No restart, ~30s reflection                             │
│                                                                  │
│  2b. build-images (image changes)                               │
│      └─ GitHub Actions: Docker build                            │
│      └─ Push to ECR (airflow-master:latest, airflow-worker:latest)│
│                                                                  │
│  3. deploy-ec2 (image changes)                                  │
│      ├─ Secrets Manager → .env file                             │
│      ├─ Add ECR_REGISTRY to .env                                │
│      ├─ docker-compose.prod.yml pull  ← KEY CHANGE              │
│      └─ docker-compose.prod.yml up -d                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## ECR_REGISTRY Environment Variable

CI/CD injects ECR registry URL into `.env`:

```bash
# In deploy.yml
echo "ECR_REGISTRY=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com" >> master/.env
```

Then docker-compose.prod.yml uses it:

```yaml
services:
  webserver:
    image: ${ECR_REGISTRY}/airflow-master:latest
```

## Trigger Strategy

### Before: Auto + Manual

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

### After: Manual Only (Recommended for Prod)

```yaml
on:
  workflow_dispatch:
    inputs:
      deploy_type:
        description: "Deploy type"
        required: true
        default: "all"
        type: choice
        options:
          - dags
          - images
          - all
```

**Why manual?**

- Production deployment should be intentional
- Prevent accidental deployments from main push
- Allow choosing deployment type (DAG only, images only, all)

## Secrets Manager Integration

CI/CD fetches environment variables from Secrets Manager:

```bash
# In deploy.yml
aws secretsmanager get-secret-value \
  --secret-id prod/airflow/master \
  --query SecretString --output text | \
  jq -r 'to_entries | map("\(.key)=\(.value)") | .[]' > master/.env
```

### Required Secrets

**Master:**

```text
prod/airflow/master:
├── POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB
├── POSTGRES_USER, POSTGRES_PASSWORD
├── REDIS_HOST, REDIS_PORT
├── AIRFLOW_ADMIN_USER, AIRFLOW_ADMIN_PASSWORD, AIRFLOW_ADMIN_EMAIL
├── AIRFLOW_SECRET_KEY
├── AWS_DEFAULT_REGION
├── AWS_ACCOUNT_ID          ← For DAG ECR image paths
└── GITHUB_PAT              ← For git pull
```

## Deployment Scenarios

### Scenario 1: DAG Only Changes

```bash
# 1. Push code
git add dags/my_dag.py
git commit -m "feat: add new DAG"
git push origin main

# 2. GitHub Actions (manual trigger)
# → deploy_type: dags

# 3. Result
# - EC2: git pull
# - No restart
# - ~30s reflection
```

### Scenario 2: Dockerfile/Requirements Changes

```bash
# 1. Push code
git add master/Dockerfile requirements.txt
git commit -m "feat: add new dependency"
git push origin main

# 2. GitHub Actions (manual trigger)
# → deploy_type: images

# 3. Result
# - GitHub Actions: build image
# - Push to ECR
# - EC2: docker-compose.prod.yml pull
# - Container restart (~1-2min downtime)
```

## Rollback Methods

### ECR Image Rollback

```bash
ssh airflow-master
cd /opt/airflow

# Edit docker-compose.prod.yml: :latest → :abc123 (specific commit SHA)
docker-compose -f master/docker-compose.prod.yml pull
docker-compose -f master/docker-compose.prod.yml up -d
```

### DAG Rollback

```bash
ssh airflow-master
cd /opt/airflow

# Rollback specific files
git checkout <commit-sha> -- dags/

# Or full rollback
git reset --hard <commit-sha>
```

## Summary

| File                      | Purpose               | Uses               |
| ------------------------- | --------------------- | ------------------ |
| `docker-compose.yml`      | Local development     | `build:` directive |
| `docker-compose.prod.yml` | Production deployment | `image:` directive |
