---
title: DAG Deployment Strategies
description: 'Different approaches to deploying Airflow DAGs, with trade-offs analysis.'
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - devops
  - airflow
  - deployment
  - gitops
  - work
category: devops
draft: false
lang: en
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/production-deployment.html
    title: Airflow Production Deployment
    type: official
---

## The Problem

When setting up Airflow on EC2 with Docker Compose, the first question was: how
do DAG files get from the Git repository onto the running containers? There is
no single "official" deployment method -- Airflow documentation describes
multiple approaches without recommending one. Picking the wrong strategy early
means painful migration later as the team or infrastructure grows.

---

## Difficulties Encountered

- **No single recommended approach** - Airflow docs describe several strategies
  but do not clearly recommend one for a given setup. Had to research blog
  posts, GitHub issues, and Helm chart defaults to piece together the
  trade-offs.
- **Conflating DAG deployment with code deployment** - Early research mixed up
  deploying DAG Python files with deploying the Airflow application itself
  (Docker image). These are independent concerns but most guides bundle them.
- **Git-sync sidecar docs assume Kubernetes** - The most-documented approach
  (git-sync sidecar) is Kubernetes-native. Translating it to Docker Compose on
  EC2 was not straightforward and felt like forcing a pattern.
- **Security implications of full repo on EC2** - Cloning the full repository
  onto the EC2 instance exposes non-DAG files (credentials, CI configs). Had to
  assess whether `.gitignore` and deploy keys were sufficient mitigations.

---

## Options Considered

| Option                      | Pros                                                             | Cons                                                         |
| --------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| Full Git Repo on EC2        | Simple setup, fast deploys, zero downtime, familiar Git workflow | Full repo exposed on EC2, requires Git auth, not auto-synced |
| Bake DAGs into Docker Image | Immutable, versioned, no Git on EC2                              | Slow (rebuild + restart), no hot-reload of DAGs              |
| Git-Sync Sidecar            | Auto-syncs, standard for K8s, no restart needed                  | Requires sidecar container, designed for Kubernetes          |
| S3/EFS Sync                 | AWS-native, works multi-region                                   | Extra infra (S3 bucket or EFS), sync lag                     |

---

## Why This Approach

Chose **Full Git Repo on EC2** because:

- Small team (2 people) with EC2-based infrastructure, not Kubernetes
- DAG changes are frequent and need fast iteration (seconds, not minutes)
- Zero downtime is critical -- no container restarts for DAG-only changes
- Git provides built-in version control and instant rollback
- The downsides (repo exposure, auth) are easily mitigated with deploy keys and
  `.gitignore`

---

## The Four Main Approaches

### 1. Full Git Repo on EC2

```text
EC2 /opt/airflow/          ← Full Git repository
├── dags/                  ← DAG files
├── master/
│   └── docker-compose.yml
├── worker/
└── .git/
```

**How it works:**

1. EC2 has full repository via `git clone`
2. Changes sync via `git pull`
3. Containers volume-mount the `dags/` folder

**Best for:** Small teams (2-10), EC2-based, frequent DAG changes

### 2. Docker Image with DAGs (Bake into Image)

```dockerfile
# Dockerfile
COPY dags/ /opt/airflow/dags/
```

**How it works:**

1. DAG files included at Docker image build time
2. DAG changes require image rebuild
3. Image swap requires container restart

**Best for:** Immutable infrastructure, strict versioning

### 3. Git-Sync Sidecar (Kubernetes Standard)

```yaml
# Kubernetes Pod
containers:
  - name: scheduler
    image: airflow
  - name: git-sync # Separate container
    image: git-sync
    args: ["--repo=https://github.com/...", "--branch=main"]
```

**How it works:**

1. Separate git-sync container periodically pulls
2. Shared volume provides DAGs to Airflow containers
3. Standard pattern for Kubernetes

**Best for:** Kubernetes environments, large teams

### 4. S3/EFS Sync

```text
S3 bucket                    EC2
s3://airflow-dags/   ───►  /opt/airflow/dags/
```

**How it works:**

1. DAG files uploaded to S3
2. EC2 syncs via `aws s3 sync`
3. Or EFS directly mounted

**Best for:** AWS-native workflows, multi-region

## Comparison Matrix

| Criterion             | Git Repo on EC2 | Bake into Image | Git-Sync   | S3/EFS       |
| --------------------- | --------------- | --------------- | ---------- | ------------ |
| **Setup complexity**  | Low             | Low             | Medium     | Medium       |
| **DAG change speed**  | Fast (git pull) | Slow (rebuild)  | Fast       | Fast         |
| **Container restart** | No              | Yes             | No         | No           |
| **Extra infra**       | None            | None            | Sidecar    | S3/EFS       |
| **Best environment**  | EC2 small team  | Immutable infra | Kubernetes | AWS native   |
| **Team size**         | 2-10            | Any             | Large      | Medium-Large |

## Decision Tree

```text
What's your infrastructure?
├─ Kubernetes
│   └─ Use Git-Sync Sidecar
│
├─ EC2 with small team (< 10)
│   └─ Use Full Git Repo on EC2
│
├─ Strict immutable requirements
│   └─ Use Bake into Image
│
└─ AWS-native, multi-region
    └─ Use S3/EFS Sync
```

## Full Git Repo: Detailed Workflow

### Directory Structure

```text
EC2 /opt/airflow/
├── .git/
├── dags/
│   ├── __init__.py
│   └── my_pipeline.py    # ← Changes here sync automatically
├── master/
│   ├── docker-compose.yml
│   └── docker-compose.prod.yml
└── worker/
    └── docker-compose.yml
```

### Deployment Flow

```text
1. Developer edits DAG
   └─► git push origin main

2. GitHub Actions triggers
   └─► dags/ change detected

3. SSM command to EC2
   └─► cd /opt/airflow && git pull

4. Scheduler detects (~30 seconds)
   └─► New DAG parsed and ready

Container restart: NOT NEEDED
Downtime: NONE
Reflection time: ~30 seconds
```

### Pros and Cons

**Pros:**

| Advantage             | Description                                  |
| --------------------- | -------------------------------------------- |
| **Simple**            | No extra infra (S3, EFS, git-sync container) |
| **Fast deploy**       | Single `git pull` syncs DAGs                 |
| **Familiar workflow** | Standard Git-based deployment                |
| **Zero downtime**     | No container restart for DAG changes         |
| **Version control**   | Git history for DAG changes                  |
| **Easy rollback**     | `git checkout <commit>` for instant rollback |

**Cons:**

| Disadvantage      | Description                    | Mitigation                       |
| ----------------- | ------------------------------ | -------------------------------- |
| Git dependency    | EC2 needs Git                  | Amazon Linux has Git built-in    |
| Full repo exposed | Unnecessary files on EC2       | `.gitignore` for sensitive files |
| Auth required     | Private repo needs credentials | Deploy Key or HTTPS + PAT        |
| Manual sync       | Not auto-synced                | CI/CD automation (SSM)           |

## `/opt/airflow` Convention

`/opt` is the Linux standard directory for third-party software.

```text
/opt        ← Third-party apps (Airflow, Jenkins, etc.)
/usr        ← System-installed software
/home       ← User home directories
```

Apache Airflow official documentation uses `AIRFLOW_HOME=/opt/airflow` as
default.

## When to Use

- Deploying Airflow on self-managed EC2 or Docker Compose and need to choose a
  DAG distribution method
- Setting up a new Airflow cluster and evaluating deployment trade-offs
  (iteration speed vs security vs team size)
- Outgrowing your current DAG deployment approach and need a migration path to a
  more scalable strategy

---

## When to Migrate to Different Strategy

| Situation               | Recommended Change |
| ----------------------- | ------------------ |
| Kubernetes adoption     | Git-Sync Sidecar   |
| Security hardening      | Bake into Image    |
| Multi-Region deployment | S3 + CloudFront    |
| DAG 10+, team 5+        | Git-Sync or S3     |

---

## When NOT to Use

These are anti-patterns for each strategy:

- **Full Git Repo on EC2** - Do not use if the repository contains secrets that
  cannot be excluded via `.gitignore`, or if compliance requires immutable
  deployments with auditable image tags.
- **Bake into Image** - Do not use if DAG iteration speed matters. Rebuilding
  and restarting containers for every DAG change creates unacceptable feedback
  loops during development.
- **Git-Sync Sidecar** - Do not use on plain EC2 or Docker Compose setups. The
  sidecar pattern adds unnecessary complexity outside of Kubernetes.
- **S3/EFS Sync** - Do not use if you need strict version control of DAG
  deployments. S3 sync does not provide atomic updates or rollback guarantees
  the way Git does.
