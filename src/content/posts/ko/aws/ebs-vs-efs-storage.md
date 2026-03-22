---
title: 'EBS vs EFS: AWS 스토리지 비교'
description: EBS(블록 스토리지)와 EFS(네트워크 파일 시스템)를 언제 사용해야 하는지 정리.
date: 2026-01-23T00:00:00.000Z
updated: '2026-03-22'
tags:
  - aws
  - storage
  - devops
  - work
category: aws
draft: false
lang: ko
source_lang: en
source_slug: ebs-vs-efs-storage
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: 'https://docs.aws.amazon.com/ebs/latest/userguide/what-is-ebs.html'
    title: What is Amazon Elastic Block Store?
    type: official
  - url: 'https://docs.aws.amazon.com/efs/latest/ug/whatisefs.html'
    title: What is Amazon Elastic File System?
    type: official
---

## 요약

| 스토리지 | 타입                 | 공유 가능?             | 용도                                |
| -------- | -------------------- | ---------------------- | ----------------------------------- |
| **EBS**  | 블록(HDD/SSD와 유사) | 아니오(인스턴스 1개만) | OS, Docker, PostgreSQL, Redis, 로그 |
| **EFS**  | 네트워크(NFS)        | 예(여러 인스턴스)      | 마스터 간 공유되는 DAG 파일         |

## EBS(Elastic Block Storage)

각 EC2 인스턴스에 연결되는 블록 스토리지예요. 컴퓨터 내부 하드 드라이브처럼 해당 컴퓨터만 접근할 수 있어요.

### 일반적인 크기

| 인스턴스 | EBS 크기 | 내용                                       |
| -------- | -------- | ------------------------------------------ |
| Master   | 100 GB   | PostgreSQL, Redis, Docker 이미지, 로그, OS |
| Worker   | 50 GB    | Docker 이미지, 태스크 아티팩트, OS         |
| Bastion  | 8 GB     | OS만(최소)                                 |

### EBS에 저장되는 것

```text
100 GB EBS Volume
│
├── /var/lib/docker/              (~30 GB)
│   ├── images/                   # Docker 이미지
│   └── volumes/
│       ├── postgres-data/        # Airflow 메타데이터 DB
│       └── redis-data/           # Celery 메시지 큐
│
├── /opt/airflow/logs/            (~10-50 GB, 시간이 지나면서 증가)
│   └── dag_id/run_id/task_id/    # 태스크 실행 로그
│
└── / (root)                      (~10 GB)
    └── 운영체제
```

### EBS를 잃으면

**모든 것**을 잃어요:

- 모든 DAG 실행 히스토리
- 태스크 실행 로그
- 사용자 계정과 비밀번호
- Airflow Variables와 Connections

**복구 방법**: EBS 스냅샷에서 복원하거나 처음부터 다시 구축해요.

## EFS(Elastic File System)

**여러 EC2 인스턴스가 동시에 마운트할 수 있는** 네트워크 파일 시스템(NFS)이에요.

### 왜 공유 파일에 EFS를 쓸까?

**공유 스토리지 없이 생기는 문제:**

```text
시나리오: DAG 파일을 업데이트

┌─────────────┐                    ┌─────────────┐
│   Master    │                    │   Worker    │
│ my_dag.py   │                    │ my_dag.py   │
│ (version 2) │                    │ (version 1) │ ← 구버전!
│ Scheduler   │ ──── task ────►   │ Celery      │
│ sees v2     │                    │ runs v1     │ ← 잘못된 코드!
└─────────────┘                    └─────────────┘

결과: 태스크 실패 또는 잘못된 로직 실행
```

**EFS를 쓰면 해결돼요:**

```text
                    ┌─────────────────┐
                    │      EFS        │
                    │  my_dag.py (v2) │  ← 단일 진실 공급원
                    └────────┬────────┘
              ┌──────────────┴──────────────┐
              ▼                             ▼
     ┌─────────────┐               ┌─────────────┐
     │   Master    │               │   Worker    │
     │ Sees v2     │               │ Sees v2     │  ← 동일!
     └─────────────┘               └─────────────┘

결과: 일관성 보장
```

### EFS에 저장되는 것

```text
EFS (~10 GB)
└── /opt/airflow/dags/
    ├── example_dag.py
    ├── etl_pipeline.py
    └── utils/
        └── helpers.py
```

**DAG Python 파일만** 저장돼요. 매우 작아요.

### EFS를 잃으면

EBS보다 덜 치명적이에요:

- DAG 파일은 Git에서 다시 deploy할 수 있어요
- 히스토리 데이터는 손실되지 않아요(EBS의 PostgreSQL에 있으니까요)

## 왜 EFS를 전부 다 쓰지 않을까?

| 항목          | EBS   | EFS             |
| ------------- | ----- | --------------- |
| **지연시간**  | ~1ms  | ~5-10ms         |
| **GB당 비용** | $0.08 | $0.30(4배 비쌈) |
| **DB 성능**   | 우수  | 좋지 않음       |
| **공유 접근** | 불가  | 가능            |

**PostgreSQL을 EFS에서 실행하면:**

- 4배 비싸고
- 5-10배 느리고(NFS 지연시간 추가)
- AWS 권장사항에도 어긋나요

## 기본 원칙

- **EBS**: 단일 인스턴스 데이터, 데이터베이스, 높은 I/O
- **EFS**: 공유 파일, 설정, 코드

## 비용 분석

| 스토리지   | 크기   | 요금     | 월 비용     |
| ---------- | ------ | -------- | ----------- |
| EBS Master | 100 GB | $0.08/GB | $8.00       |
| EBS Worker | 50 GB  | $0.08/GB | $4.00       |
| EFS        | ~10 GB | $0.30/GB | $3.00       |
| **합계**   |        |          | **~$15/월** |

## 핵심 정리

1. **EBS = 인스턴스별 스토리지** - 각 인스턴스가 자체 스토리지를 갖고, 데이터베이스에 사용해요
2. **EFS = 공유 스토리지** - 여러 인스턴스가 동일한 파일에 접근해요
3. **중요 데이터 보호** - Master에 EBS 스냅샷을 활성화하세요
4. **DAG 코드는 Git에** - 궁극적인 백업이에요
