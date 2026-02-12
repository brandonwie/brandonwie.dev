---
title: DAG Deployment Strategies
description: "Different approaches to deploying Airflow DAGs, with trade-offs analysis."
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

I spent half a day reading blog posts, Helm chart defaults, and GitHub issues
trying to answer one question: how do my DAG files get from Git onto the
running Airflow containers? The Airflow docs describe multiple approaches
without recommending one, and picking the wrong strategy early means a painful
migration later.

## Why This Matters

DAG deployment is a decision you make once and live with for months. It
touches iteration speed (how fast can I test a DAG change?), operational
safety (does deploying a DAG restart my scheduler?), and security (what gets
exposed on the EC2 instance?). Most guides bundle DAG deployment with
application deployment -- building new Docker images whenever a DAG file
changes. Those are independent concerns, and conflating them leads to
unnecessary downtime.

---

## The Difficulties I Ran Into

- **No single recommended approach** -- Airflow docs describe several
  strategies but never say "use this one for EC2." I had to piece together
  trade-offs from blog posts, GitHub issues, and Helm chart defaults.
- **Conflating DAG deployment with code deployment** -- Early research mixed
  up deploying DAG Python files with deploying the Airflow application itself
  (Docker image). Most guides bundle them, but they are separate concerns.
- **Git-sync sidecar docs assume Kubernetes** -- The most-documented approach
  (git-sync sidecar) is Kubernetes-native. Translating it to Docker Compose
  on EC2 felt like forcing a pattern that did not fit.
- **Security implications of full repo on EC2** -- Cloning the full repository
  onto the EC2 instance exposes non-DAG files (credentials, CI configs). I
  had to assess whether `.gitignore` and deploy keys were sufficient.

---

## Options Explored

| Option                      | Pros                                                             | Cons                                                         |
| --------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| Full Git Repo on EC2        | Simple setup, fast deploys, zero downtime, familiar Git workflow | Full repo exposed on EC2, requires Git auth, not auto-synced |
| Bake DAGs into Docker Image | Immutable, versioned, no Git on EC2                              | Slow (rebuild + restart), no hot-reload of DAGs              |
| Git-Sync Sidecar            | Auto-syncs, standard for K8s, no restart needed                  | Requires sidecar container, designed for Kubernetes          |
| S3/EFS Sync                 | AWS-native, works multi-region                                   | Extra infra (S3 bucket or EFS), sync lag                     |

Each approach targets a different infrastructure shape. The right choice
depends on team size, platform (EC2 vs Kubernetes), and how often DAGs change.

---

## The Decision: Full Git Repo on EC2

I chose the Git repo approach because my situation had clear constraints:

- Small team (2 people) on EC2-based infrastructure, not Kubernetes
- DAG changes are frequent and need fast iteration (seconds, not minutes)
- Zero downtime is critical -- no container restarts for DAG-only changes
- Git provides built-in version control and instant rollback
- The downsides (repo exposure, auth) are easily mitigated with deploy keys
  and `.gitignore`

---

## The Four Main Approaches

### 1. Full Git Repo on EC2

```text
EC2 /opt/airflow/          <- Full Git repository
├── dags/                  <- DAG files
├── master/
│   └── docker-compose.yml
├── worker/
└── .git/
```

The EC2 instance holds the full repository via `git clone`. Changes sync via
`git pull`. Containers volume-mount the `dags/` folder, so Airflow picks up
changes without a restart.

This works best for small teams (2-10 people) running EC2-based
infrastructure with frequent DAG changes.

### 2. Docker Image with DAGs (Bake into Image)

```dockerfile
# Dockerfile
COPY dags/ /opt/airflow/dags/
```

DAG files are included at Docker image build time. Any DAG change requires an
image rebuild and container restart. This is the right choice when you need
immutable infrastructure with strict versioning -- every deployment is an
auditable image tag.

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

A separate git-sync container periodically pulls from the repository into a
shared volume. The Airflow containers read from that volume. This is the
standard pattern for Kubernetes environments and scales well for large teams.

### 4. S3/EFS Sync

```text
S3 bucket                    EC2
s3://airflow-dags/   --->  /opt/airflow/dags/
```

DAG files are uploaded to S3, and the EC2 instance syncs via `aws s3 sync`.
Alternatively, EFS can be mounted directly. This fits AWS-native workflows,
especially multi-region deployments where S3 replication handles distribution.

---

## Comparison Matrix

| Criterion             | Git Repo on EC2 | Bake into Image | Git-Sync   | S3/EFS       |
| --------------------- | --------------- | --------------- | ---------- | ------------ |
| **Setup complexity**  | Low             | Low             | Medium     | Medium       |
| **DAG change speed**  | Fast (git pull) | Slow (rebuild)  | Fast       | Fast         |
| **Container restart** | No              | Yes             | No         | No           |
| **Extra infra**       | None            | None            | Sidecar    | S3/EFS       |
| **Best environment**  | EC2 small team  | Immutable infra | Kubernetes | AWS native   |
| **Team size**         | 2-10            | Any             | Large      | Medium-Large |

---

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

---

## Full Git Repo: The Detailed Workflow

### Directory Structure

```text
EC2 /opt/airflow/
├── .git/
├── dags/
│   ├── __init__.py
│   └── my_pipeline.py    # <- Changes here sync automatically
├── master/
│   ├── docker-compose.yml
│   └── docker-compose.prod.yml
└── worker/
    └── docker-compose.yml
```

### Deployment Flow

```text
1. Developer edits DAG
   └── git push origin main

2. GitHub Actions triggers
   └── dags/ change detected

3. SSM command to EC2
   └── cd /opt/airflow && git pull

4. Scheduler detects (~30 seconds)
   └── New DAG parsed and ready

Container restart: NOT NEEDED
Downtime: NONE
Reflection time: ~30 seconds
```

The key insight is that Airflow's scheduler polls the `dags/` directory on a
configurable interval (default ~30 seconds). A simple `git pull` is all it
takes to deploy a DAG change. No image builds, no container restarts, no
downtime.

### Pros

| Advantage             | Description                                  |
| --------------------- | -------------------------------------------- |
| **Simple**            | No extra infra (S3, EFS, git-sync container) |
| **Fast deploy**       | Single `git pull` syncs DAGs                 |
| **Familiar workflow** | Standard Git-based deployment                |
| **Zero downtime**     | No container restart for DAG changes         |
| **Version control**   | Git history for DAG changes                  |
| **Easy rollback**     | `git checkout <commit>` for instant rollback |

### Cons

| Disadvantage      | Description                    | Mitigation                       |
| ----------------- | ------------------------------ | -------------------------------- |
| Git dependency    | EC2 needs Git                  | Amazon Linux has Git built-in    |
| Full repo exposed | Unnecessary files on EC2       | `.gitignore` for sensitive files |
| Auth required     | Private repo needs credentials | Deploy Key or HTTPS + PAT        |
| Manual sync       | Not auto-synced                | CI/CD automation (SSM)           |

---

## Why This Works

The core insight is separation of concerns. DAG files are code that changes
frequently, but the Airflow application (Docker image) changes rarely. By
volume-mounting a Git-managed `dags/` directory, DAG changes flow through Git
while the application stays stable. No rebuilds, no restarts, no downtime.

The `/opt/airflow` convention comes from Linux standards -- `/opt` is the
standard directory for third-party software. Apache Airflow's official
documentation uses `AIRFLOW_HOME=/opt/airflow` as the default.

```text
/opt        <- Third-party apps (Airflow, Jenkins, etc.)
/usr        <- System-installed software
/home       <- User home directories
```

---

## Practical Takeaway

Use this decision framework:

- **Deploying Airflow on EC2 or Docker Compose** -- Start with the full Git
  repo approach. It is the simplest path that supports fast iteration.
- **Setting up a new cluster** -- Evaluate trade-offs between iteration speed,
  security, and team size using the comparison matrix above.
- **Outgrowing your current approach** -- Use the migration table below as a
  guide for when to switch strategies.

### When to Migrate

| Situation               | Recommended Change |
| ----------------------- | ------------------ |
| Kubernetes adoption     | Git-Sync Sidecar   |
| Security hardening      | Bake into Image    |
| Multi-Region deployment | S3 + CloudFront    |
| DAG 10+, team 5+        | Git-Sync or S3     |

### When NOT to Use Each Strategy

- **Full Git Repo on EC2** -- Do not use if the repository contains secrets
  that cannot be excluded via `.gitignore`, or if compliance requires
  immutable deployments with auditable image tags.
- **Bake into Image** -- Do not use if DAG iteration speed matters.
  Rebuilding and restarting containers for every DAG change creates
  unacceptable feedback loops during development.
- **Git-Sync Sidecar** -- Do not use on plain EC2 or Docker Compose setups.
  The sidecar pattern adds unnecessary complexity outside of Kubernetes.
- **S3/EFS Sync** -- Do not use if you need strict version control of DAG
  deployments. S3 sync does not provide atomic updates or rollback guarantees
  the way Git does.
