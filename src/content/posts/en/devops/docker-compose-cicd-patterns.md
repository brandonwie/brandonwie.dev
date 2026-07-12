---
title: Docker Compose CI/CD Patterns
description: >-
  Patterns for using Docker Compose in CI/CD pipelines: separating dev and prod
  configurations, ECR integration, and deployment strategies.
date: 2026-01-23T00:00:00.000Z
updated: '2026-07-13'
expanded: true
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
source_content_hash: 76ec9fec63e38d6be42a31406b9e136f0ee6272bb3aa9fa2262c716fe6256be7
---

Our CI/CD pipeline ran `docker-compose pull` and then `docker-compose up -d` on the production server. The logs showed success, but the container was running an old image built locally, not the fresh one we'd just pushed to ECR. The culprit was our `docker-compose.yml`: it used `build:` instead of `image:`, so `pull` silently did nothing.

This is one of those mistakes that wastes hours because everything _looks_ correct. This post covers the pattern that prevents it: separating your Docker Compose files into development (`build:`) and production (`image:`) configurations, along with CI/CD pipeline strategies for Airflow deployments on EC2.

---

## The build vs image problem

### The issue

The root cause is a difference in what `build:` and `image:` mean to Docker Compose. When a service uses `build:`, Compose ignores `pull` entirely. There's nothing to pull, because the configuration says "build this locally." When a service uses `image:`, Compose knows to fetch the specified image from a registry.

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

### The solution: separate files

The fix is to maintain two separate Compose files. One for local development that builds from source, one for production that pulls pre-built images from ECR.

```text
project/
├── docker-compose.yml       # Local development (build:)
└── docker-compose.prod.yml  # Production (image:)
```

**Local Development** uses `build:` so you can iterate on Dockerfile changes without pushing to a registry:

```yaml
# docker-compose.yml
services:
  webserver:
    build:
      context: ..
      dockerfile: master/Dockerfile
```

**Production** uses `image:` with an ECR registry URL. The `${ECR_REGISTRY}` variable is injected by CI/CD at deploy time:

```yaml
# docker-compose.prod.yml
services:
  webserver:
    image: ${ECR_REGISTRY}/airflow-master:latest # ← Pull from ECR
```

With the Compose files separated, the CI/CD pipeline can use the right file for each environment. The full flow for an Airflow deployment supports both DAG-only changes (fast, no restart) and image changes (full rebuild and deploy).

## CI/CD pipeline flow

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

## ECR_REGISTRY environment variable

The `${ECR_REGISTRY}` variable in the production Compose file needs to resolve to the actual ECR URL. CI/CD handles this by appending the registry URL to the `.env` file on the target server:

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

## Trigger strategy

One decision for production deployments is whether they should run automatically on every push or require manual approval. We started with automatic triggers and learned the hard way why manual is safer.

### Before: auto + manual

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

### After: manual only (recommended for prod)

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

## Secrets Manager integration

The production server needs environment variables (database credentials, API keys, etc.) that should never live in the repository. The CI/CD pipeline fetches them from AWS Secrets Manager and writes them to `.env` on the target server at deploy time:

```bash
# In deploy.yml
aws secretsmanager get-secret-value \
  --secret-id prod/airflow/master \
  --query SecretString --output text | \
  jq -r 'to_entries | map("\(.key)=\(.value)") | .[]' > master/.env
```

### Required secrets

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

## Deployment scenarios

The two most common deployment scenarios differ in speed and impact.

### Scenario 1: DAG-only changes

DAG-only changes are the fastest deployment path: a `git pull` on the EC2 instance, and Airflow picks up the changes within ~30 seconds. No container restart needed.

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

### Scenario 2: Dockerfile/requirements changes

Image changes require the full pipeline: build a new Docker image, push it to ECR, pull it on the server, and restart containers. This takes 1-2 minutes with a brief downtime window.

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

## Rollback methods

When a deployment goes wrong, you need to get back to a known-good state fast. The rollback approach depends on what changed.

### ECR image rollback

For image-related issues, pin the Compose file to a specific image tag (git SHA) instead of `:latest`:

```bash
ssh airflow-master
cd /opt/airflow

# Edit docker-compose.prod.yml: :latest → :abc123 (specific commit SHA)
docker-compose -f master/docker-compose.prod.yml pull
docker-compose -f master/docker-compose.prod.yml up -d
```

### DAG rollback

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

## CI/CD gotchas

One lesson learned the hard way: floating action tags break builds silently. We used `cloudflare/wrangler-action@v3` in a GitHub Actions workflow, and one day builds started failing with "bun not found." The action had changed its default `packageManager` from npm to bun, and since `ubuntu-latest` doesn't ship with bun, the action failed immediately.

The fix was to pin `packageManager: npm` explicitly. The broader rule: always pin action versions or explicitly set all configurable defaults. A `@v3` tag can shift under your feet without a single line of your code changing.

A second gotcha costs far more than a failed build: it threatens data. A Docker Compose project name stays stable only within one Compose major version. Compose v1 derives the project name from the current working directory's basename; v2 derives it from the compose file's directory. Swap the Compose binary from v1 to v2 on the host (an innocent-looking upgrade) and the project name flips underneath you. Three things break, in ascending order of pain. `docker-compose down` finds nothing under the new name, so the old stack keeps running. `docker-compose up -d` collides on any explicit `container_name`. And the worst case: a named volume rebinds to a brand-new empty `<newproject>_<volume>` instead of the live one, handing your database a fresh empty disk.

Treat this as a hard go/no-go before any deploy that re-runs Compose. Capture the live project label and the current volumes first:

```bash
docker inspect <ctr> --format '{{index .Config.Labels "com.docker.compose.project"}}'
docker volume ls
```

If a deploy has already flipped the name, force the historical one to reconnect the live volume:

```bash
docker-compose -p <live-project> up -d
```

The third gotcha follows directly from the second: never run `down -v` or `docker volume prune` during an incident. After a project-name flip, the orphaned old volume is often the only remaining copy of your stateful data. `down` without `-v` never deletes volumes, so it stays safe, but `-v` and `volume prune` will wipe the one disk you need to recover.

---

## Practical takeaways

The `build:` vs `image:` distinction is the thing to get right first in Docker Compose CI/CD. Everything else follows from this separation:

1. Always use separate Compose files for dev and prod. `docker-compose.yml` with `build:` for local development, `docker-compose.prod.yml` with `image:` for production. Mixing them leads to the silent failure where `pull` does nothing because the file says "build locally."

2. Inject the ECR registry URL via environment variable. The `ECR_REGISTRY` pattern keeps your Compose file portable, so the same file works for any AWS account or region. CI/CD writes it to `.env`, and Docker Compose interpolates it automatically.

3. Use manual triggers for production deployments. `workflow_dispatch` with deployment type selection (`dags`, `images`, `all`) prevents accidental deployments from pushes to main. For a system like Airflow, this also lets you deploy DAG changes without rebuilding containers, a 30-second operation instead of a 2-minute one.

4. Store secrets in AWS Secrets Manager, not in the repository. The CI/CD pipeline fetches secrets at deploy time and writes them to `.env` on the target server. This keeps credentials out of git history and makes rotation straightforward.

The pattern in this post scales from a single EC2 instance to multi-node deployments. The rule stays the same: development builds locally, production pulls pre-built images.
