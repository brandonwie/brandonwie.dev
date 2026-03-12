---
title: 'EBS vs EFS: AWS Storage Comparison'
description: Understanding when to use EBS (block storage) vs EFS (network filesystem).
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - aws
  - storage
  - devops
  - work
category: aws
draft: false
lang: en
references:
  - url: 'https://docs.aws.amazon.com/ebs/latest/userguide/what-is-ebs.html'
    title: What is Amazon Elastic Block Store?
    type: official
  - url: 'https://docs.aws.amazon.com/efs/latest/ug/whatisefs.html'
    title: What is Amazon Elastic File System?
    type: official
source_content_hash: b21e4b0c5f5b18ca96f4ccb62a23f0956dc2508b704014c5c84f7112e2324019
---

## Quick Summary

| Storage | Type                 | Shared?                  | Purpose                             |
| ------- | -------------------- | ------------------------ | ----------------------------------- |
| **EBS** | Block (like HDD/SSD) | No (1 instance only)     | OS, Docker, PostgreSQL, Redis, logs |
| **EFS** | Network (NFS)        | Yes (multiple instances) | DAG files shared between master     |

## EBS (Elastic Block Storage)

Block storage attached to each EC2 instance. Like the hard drive inside your
computer - only that specific computer can access it.

### Typical Sizes

| Instance | EBS Size | Contents                                   |
| -------- | -------- | ------------------------------------------ |
| Master   | 100 GB   | PostgreSQL, Redis, Docker images, logs, OS |
| Worker   | 50 GB    | Docker images, task artifacts, OS          |
| Bastion  | 8 GB     | OS only (minimal)                          |

### What's On EBS

```text
100 GB EBS Volume
│
├── /var/lib/docker/              (~30 GB)
│   ├── images/                   # Docker images
│   └── volumes/
│       ├── postgres-data/        # Airflow metadata database
│       └── redis-data/           # Celery message queue
│
├── /opt/airflow/logs/            (~10-50 GB over time)
│   └── dag_id/run_id/task_id/    # Task execution logs
│
└── / (root)                      (~10 GB)
    └── Operating system
```

### If EBS Is Lost

You lose **everything**:

- All DAG run history
- Task execution logs
- User accounts and passwords
- Airflow Variables and Connections

**Recovery**: Restore from EBS snapshot or rebuild from scratch.

## EFS (Elastic File System)

Network filesystem (NFS) that **multiple EC2 instances can mount
simultaneously**.

### Why EFS For Shared Files?

**The Problem Without Shared Storage:**

```text
Scenario: You update a DAG file

┌─────────────┐                    ┌─────────────┐
│   Master    │                    │   Worker    │
│ my_dag.py   │                    │ my_dag.py   │
│ (version 2) │                    │ (version 1) │ ← OUTDATED!
│ Scheduler   │ ──── task ────►   │ Celery      │
│ sees v2     │                    │ runs v1     │ ← WRONG CODE!
└─────────────┘                    └─────────────┘

Result: Task fails or runs wrong logic
```

**The Solution With EFS:**

```text
                    ┌─────────────────┐
                    │      EFS        │
                    │  my_dag.py (v2) │  ← Single source of truth
                    └────────┬────────┘
              ┌──────────────┴──────────────┐
              ▼                             ▼
     ┌─────────────┐               ┌─────────────┐
     │   Master    │               │   Worker    │
     │ Sees v2     │               │ Sees v2     │  ← SAME!
     └─────────────┘               └─────────────┘

Result: Consistency guaranteed
```

### What's On EFS

```text
EFS (~10 GB)
└── /opt/airflow/dags/
    ├── example_dag.py
    ├── etl_pipeline.py
    └── utils/
        └── helpers.py
```

**Only DAG Python files** - very small.

### If EFS Is Lost

Less critical than EBS:

- DAG files can be re-deployed from Git
- No historical data lost (that's in PostgreSQL on EBS)

## Why Not Use EFS for Everything?

| Factor                   | EBS       | EFS             |
| ------------------------ | --------- | --------------- |
| **Latency**              | ~1ms      | ~5-10ms         |
| **Cost per GB**          | $0.08     | $0.30 (4x more) |
| **Database performance** | Excellent | Poor            |
| **Shared access**        | No        | Yes             |

**PostgreSQL on EFS would be:**

- 4x more expensive
- 5-10x slower (NFS adds latency)
- Against AWS best practices

## Rule of Thumb

- **EBS**: Single-instance data, databases, high I/O
- **EFS**: Shared files, configuration, code

## Cost Breakdown

| Storage    | Size   | Rate     | Monthly Cost   |
| ---------- | ------ | -------- | -------------- |
| EBS Master | 100 GB | $0.08/GB | $8.00          |
| EBS Worker | 50 GB  | $0.08/GB | $4.00          |
| EFS        | ~10 GB | $0.30/GB | $3.00          |
| **Total**  |        |          | **~$15/month** |

## Key Takeaways

1. **EBS = Instance-specific storage** - each instance has its own, used for
   databases
2. **EFS = Shared storage** - multiple instances access same files
3. **Critical data protection** - enable EBS snapshots for Master
4. **DAG code should be in Git** - ultimate backup
