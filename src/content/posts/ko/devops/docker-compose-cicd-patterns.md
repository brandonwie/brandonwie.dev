---
title: "Docker Compose CI/CD 패턴"
description: "CI/CD 파이프라인에서 Docker Compose를 사용하는 패턴. 특히 개발과 프로덕션 설정을 분리하는 방법."
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - devops
  - docker
  - cicd
  - work
category: devops
draft: false
lang: ko
source_lang: en
source_slug: docker-compose-cicd-patterns
source_updated: "2026-01-23"
translation_date: "2026-03-04"
references:
  - url: "https://docs.docker.com/compose/how-tos/production/"
    title: Use Compose in production — Docker Docs
    type: official
---

## Build vs Image 문제

### 이슈

docker-compose.yml에서 `build:` 지시어를 사용하면 `docker-compose pull`이 아무것도 안 해요.

```yaml
# docker-compose.yml
services:
  webserver:
    build: # ← "로컬에서 빌드"
      context: ..
      dockerfile: master/Dockerfile
```

```bash
docker-compose pull  # ← 아무것도 안 함! 풀할 이미지가 없음
docker-compose up -d # ← 로컬에서 빌드함
```

**비유:** 이미 요리해서 냉장고(ECR)에 넣어뒀는데 "이 레시피대로 만들어"(build)라고 하는 것과 같아요.

### 해결: 파일 분리

```text
project/
├── docker-compose.yml       # 로컬 개발용 (build:)
└── docker-compose.prod.yml  # 프로덕션용 (image:)
```

**로컬 개발:**

```yaml
# docker-compose.yml
services:
  webserver:
    build:
      context: ..
      dockerfile: master/Dockerfile
```

**프로덕션:**

```yaml
# docker-compose.prod.yml
services:
  webserver:
    image: ${ECR_REGISTRY}/airflow-master:latest # ← ECR에서 풀
```

## CI/CD 파이프라인 흐름

```text
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions (deploy.yml)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. detect-changes                                               │
│     └─ dags/ 또는 master/, worker/ 변경 감지                    │
│                                                                  │
│  2a. sync-dags (DAG만 변경됨)                                   │
│      └─ EC2: git pull                                           │
│      └─ 재시작 없음, ~30초 반영                                 │
│                                                                  │
│  2b. build-images (이미지 변경됨)                               │
│      └─ GitHub Actions: Docker build                            │
│      └─ ECR에 push (airflow-master:latest, airflow-worker:latest)│
│                                                                  │
│  3. deploy-ec2 (이미지 변경됨)                                  │
│      ├─ Secrets Manager → .env 파일                             │
│      ├─ ECR_REGISTRY를 .env에 추가                              │
│      ├─ docker-compose.prod.yml pull  ← 핵심 변경              │
│      └─ docker-compose.prod.yml up -d                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## ECR_REGISTRY 환경 변수

CI/CD가 ECR registry URL을 `.env`에 주입해요.

```bash
# deploy.yml에서
echo "ECR_REGISTRY=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com" >> master/.env
```

그러면 docker-compose.prod.yml에서 사용해요.

```yaml
services:
  webserver:
    image: ${ECR_REGISTRY}/airflow-master:latest
```

## 트리거 전략

### 변경 전: 자동 + 수동

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

### 변경 후: 수동만 (프로덕션 권장)

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

**왜 수동인가:**

- 프로덕션 배포는 의도적이어야 해요
- main push로 인한 실수 배포를 방지해요
- 배포 타입 선택이 가능해요(DAG만, 이미지만, 전체)

## Secrets Manager 연동

CI/CD가 Secrets Manager에서 환경 변수를 가져와요.

```bash
# deploy.yml에서
aws secretsmanager get-secret-value \
  --secret-id prod/airflow/master \
  --query SecretString --output text | \
  jq -r 'to_entries | map("\(.key)=\(.value)") | .[]' > master/.env
```

### 필요한 Secret

**Master:**

```text
prod/airflow/master:
├── POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB
├── POSTGRES_USER, POSTGRES_PASSWORD
├── REDIS_HOST, REDIS_PORT
├── AIRFLOW_ADMIN_USER, AIRFLOW_ADMIN_PASSWORD, AIRFLOW_ADMIN_EMAIL
├── AIRFLOW_SECRET_KEY
├── AWS_DEFAULT_REGION
├── AWS_ACCOUNT_ID          ← DAG ECR 이미지 경로용
└── GITHUB_PAT              ← git pull용
```

## 배포 시나리오

### 시나리오 1: DAG만 변경

```bash
# 1. 코드 push
git add dags/my_dag.py
git commit -m "feat: add new DAG"
git push origin main

# 2. GitHub Actions (수동 트리거)
# → deploy_type: dags

# 3. 결과
# - EC2: git pull
# - 재시작 없음
# - ~30초 반영
```

### 시나리오 2: Dockerfile/Requirements 변경

```bash
# 1. 코드 push
git add master/Dockerfile requirements.txt
git commit -m "feat: add new dependency"
git push origin main

# 2. GitHub Actions (수동 트리거)
# → deploy_type: images

# 3. 결과
# - GitHub Actions: 이미지 빌드
# - ECR에 push
# - EC2: docker-compose.prod.yml pull
# - 컨테이너 재시작 (~1-2분 다운타임)
```

## rollback 방법

### ECR 이미지 rollback

```bash
ssh airflow-master
cd /opt/airflow

# docker-compose.prod.yml 편집: :latest → :abc123 (특정 커밋 SHA)
docker-compose -f master/docker-compose.prod.yml pull
docker-compose -f master/docker-compose.prod.yml up -d
```

### DAG rollback

```bash
ssh airflow-master
cd /opt/airflow

# 특정 파일 rollback
git checkout <commit-sha> -- dags/

# 또는 전체 rollback
git reset --hard <commit-sha>
```

## 요약

| 파일                      | 용도          | 사용 방식       |
| ------------------------- | ------------- | --------------- |
| `docker-compose.yml`      | 로컬 개발     | `build:` 지시어 |
| `docker-compose.prod.yml` | 프로덕션 배포 | `image:` 지시어 |
