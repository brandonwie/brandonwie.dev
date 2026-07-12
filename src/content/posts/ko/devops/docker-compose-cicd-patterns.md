---
title: "Docker Compose CI/CD 패턴"
description: CI/CD 파이프라인에서 Docker Compose를 쓰는 패턴. 개발과 프로덕션 설정 분리, ECR 연동, 배포 전략을 다뤄요.
date: 2026-01-23T00:00:00.000Z
updated: '2026-07-13'
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
source_updated: '2026-07-13'
translation_date: '2026-07-13'
references:
  - url: 'https://docs.docker.com/compose/how-tos/production/'
    title: Use Compose in production — Docker Docs
    type: official
---

프로덕션 서버에서 CI/CD 파이프라인이 `docker-compose pull`을 돌리고 나서 `docker-compose up -d`를 실행했어요. 로그에는 성공이라고 찍혔는데, 정작 돌아가고 있던 건 방금 ECR에 올린 새 image가 아니라 로컬에서 빌드한 옛날 image였어요. 범인은 `docker-compose.yml`이었어요. `image:` 대신 `build:`를 쓰고 있어서 `pull`이 조용히 아무 일도 안 한 거예요.

겉으로는 다 맞아 보여서 몇 시간씩 잡아먹는 부류의 실수예요. 이 글에서는 그걸 막아주는 패턴을 다뤄요. Docker Compose 파일을 개발용(`build:`)과 프로덕션용(`image:`)으로 나누는 방법, 그리고 EC2 위에서 돌아가는 Airflow 배포를 위한 CI/CD 파이프라인 전략까지 짚어볼게요.

---

## build vs image 문제

### 이슈

근본 원인은 `build:`와 `image:`가 Docker Compose에게 서로 다른 의미라는 데 있어요. 서비스가 `build:`를 쓰면 Compose는 `pull`을 아예 무시해요. 설정이 "로컬에서 빌드하라"고 말하니까 가져올 게 없는 거죠. 반대로 `image:`를 쓰면 Compose는 지정된 image를 registry에서 가져와야 한다는 걸 알아요.

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

해결책은 Compose 파일을 두 개로 나눠서 관리하는 거예요. 하나는 소스에서 빌드하는 로컬 개발용, 하나는 미리 빌드된 image를 ECR에서 가져오는 프로덕션용이에요.

```text
project/
├── docker-compose.yml       # 로컬 개발용 (build:)
└── docker-compose.prod.yml  # 프로덕션용 (image:)
```

**로컬 개발**은 `build:`를 써요. 덕분에 registry에 push하지 않고도 Dockerfile을 고치면서 반복 작업할 수 있어요.

```yaml
# docker-compose.yml
services:
  webserver:
    build:
      context: ..
      dockerfile: master/Dockerfile
```

**프로덕션**은 ECR registry URL과 함께 `image:`를 써요. `${ECR_REGISTRY}` 변수는 배포 시점에 CI/CD가 주입해요.

```yaml
# docker-compose.prod.yml
services:
  webserver:
    image: ${ECR_REGISTRY}/airflow-master:latest # ← ECR에서 풀
```

Compose 파일을 분리하면 CI/CD 파이프라인이 환경마다 맞는 파일을 골라 쓸 수 있어요. Airflow 배포 흐름은 DAG만 바뀌는 경우(빠르고 재시작 없음)와 image가 바뀌는 경우(전체 재빌드 후 배포)를 둘 다 지원해요.

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

프로덕션 Compose 파일 안의 `${ECR_REGISTRY}` 변수는 실제 ECR URL로 치환돼야 해요. CI/CD가 대상 서버의 `.env` 파일 끝에 registry URL을 덧붙여서 처리해요.

```bash
# deploy.yml에서
echo "ECR_REGISTRY=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com" >> master/.env
```

그러면 docker-compose.prod.yml에서 이 값을 써요.

```yaml
services:
  webserver:
    image: ${ECR_REGISTRY}/airflow-master:latest
```

## 트리거 전략

프로덕션 배포에서 한 가지 정할 게 있어요. push마다 자동으로 돌릴지, 아니면 수동 승인을 받을지예요. 처음엔 자동 트리거로 시작했다가 왜 수동이 더 안전한지 뼈아프게 배웠어요.

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

**왜 수동일까요?**

- 프로덕션 배포는 의도적이어야 해요
- main push로 인한 실수 배포를 막아요
- 배포 타입을 고를 수 있어요(DAG만, image만, 전체)

## Secrets Manager 연동

프로덕션 서버에는 database 자격 증명이나 API key 같은 환경 변수가 필요한데, 이런 값은 repository에 두면 절대 안 돼요. CI/CD 파이프라인이 배포 시점에 AWS Secrets Manager에서 가져와 대상 서버의 `.env`에 써요.

```bash
# deploy.yml에서
aws secretsmanager get-secret-value \
  --secret-id prod/airflow/master \
  --query SecretString --output text | \
  jq -r 'to_entries | map("\(.key)=\(.value)") | .[]' > master/.env
```

### 필요한 secret

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

가장 흔한 배포 시나리오 두 가지는 속도와 영향 범위가 달라요.

### 시나리오 1: DAG만 변경

DAG만 바뀌면 가장 빠른 배포 경로예요. EC2 인스턴스에서 `git pull`만 하면 Airflow가 30초 안에 변경을 반영해요. container를 재시작할 필요도 없어요.

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

### 시나리오 2: Dockerfile/requirements 변경

image가 바뀌면 전체 파이프라인이 돌아야 해요. 새 Docker image를 빌드하고, ECR에 push하고, 서버에서 pull한 뒤 container를 재시작해요. 잠깐의 다운타임과 함께 1~2분쯤 걸려요.

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

배포가 잘못되면 확인된 정상 상태로 빠르게 돌아가야 해요. rollback 방법은 무엇이 바뀌었는지에 따라 달라져요.

### ECR image rollback

image 관련 문제라면, Compose 파일을 `:latest` 대신 특정 image 태그(git SHA)로 고정하면 돼요.

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

## CI/CD 주의사항

뼈아프게 배운 교훈이 하나 있어요. **floating action 태그가 빌드를 조용히 깨뜨려요.** GitHub Actions workflow에서 `cloudflare/wrangler-action@v3`를 쓰고 있었는데, 어느 날 갑자기 "bun not found"로 빌드가 실패했어요. 이 action이 기본 `packageManager`를 npm에서 bun으로 바꿔버린 거예요 — `ubuntu-latest`에는 bun이 없으니까 바로 실패한 거죠.

해결은 간단했어요. `packageManager: npm`을 명시적으로 설정하면 돼요. 더 넓은 원칙은 이거예요. 항상 action 버전을 고정하거나, 설정 가능한 기본값을 전부 명시적으로 지정하세요. `@v3` 태그는 코드 한 줄 안 바꿔도 발밑에서 바뀔 수 있어요.

두 번째 주의사항은 빌드 실패보다 훨씬 비싼 대가를 치러요. 데이터를 위협하거든요. Docker Compose 프로젝트 이름은 Compose 메이저 버전 하나 안에서만 안정적으로 유지돼요. Compose v1은 현재 작업 디렉터리 이름에서 프로젝트 이름을 뽑고, v2는 compose 파일이 있는 디렉터리에서 뽑아요. 호스트에서 Compose 바이너리를 v1에서 v2로 바꾸면(별거 아닌 것 같은 업그레이드죠) 프로젝트 이름이 슬그머니 바뀌어 버려요. 그러면 세 가지가 깨지는데, 고통이 커지는 순서대로예요. `docker-compose down`은 새 이름으로는 아무것도 못 찾아서 옛날 스택이 계속 돌아가요. `docker-compose up -d`는 명시적으로 지정한 `container_name`에서 충돌해요. 그리고 최악의 경우, named volume이 살아 있는 볼륨 대신 텅 빈 `<newproject>_<volume>`에 새로 연결돼서, database에 빈 디스크를 새로 쥐여줘요.

Compose를 다시 돌리는 배포 전에는 이걸 확실한 go/no-go 기준으로 삼으세요. 먼저 살아 있는 프로젝트 label과 현재 volume을 확인해 두는 거예요.

```bash
docker inspect <ctr> --format '{{index .Config.Labels "com.docker.compose.project"}}'
docker volume ls
```

배포가 이미 이름을 바꿔버렸다면, 예전 이름을 강제로 지정해서 살아 있는 volume에 다시 연결하면 돼요.

```bash
docker-compose -p <live-project> up -d
```

세 번째 주의사항은 두 번째에서 바로 이어져요. 장애 상황에서는 절대 `down -v`나 `docker volume prune`을 돌리지 마세요. 프로젝트 이름이 바뀐 뒤에는 참조가 끊긴 옛날 volume이 상태 데이터의 유일한 사본인 경우가 많아요. `-v` 없이 쓰는 `down`은 volume을 지우지 않으니 안전하지만, `-v`나 `volume prune`은 복구에 꼭 필요한 그 디스크를 날려버려요.

## 실전 요점

Docker Compose CI/CD에서 가장 먼저 제대로 잡아야 할 건 `build:`와 `image:`의 구분이에요. 나머지는 전부 이 분리에서 따라와요.

1. **개발용과 프로덕션용 Compose 파일은 항상 분리하세요.** 로컬 개발은 `build:`를 쓰는 `docker-compose.yml`, 프로덕션은 `image:`를 쓰는 `docker-compose.prod.yml`이에요. 둘을 섞으면 파일이 "로컬에서 빌드하라"고 말하는 탓에 `pull`이 아무 일도 안 하는 조용한 실패로 이어져요.

2. **ECR registry URL은 환경 변수로 주입하세요.** `ECR_REGISTRY` 패턴을 쓰면 Compose 파일이 이식성을 유지해서, 같은 파일이 어떤 AWS 계정이나 리전에서도 돌아가요. CI/CD가 `.env`에 써주면 Docker Compose가 알아서 값을 채워 넣어요.

3. **프로덕션 배포에는 수동 트리거를 쓰세요.** 배포 타입을 고르는 `workflow_dispatch`(`dags`, `images`, `all`)는 main에 push하다 실수로 배포되는 걸 막아줘요. Airflow 같은 시스템에서는 container를 다시 빌드하지 않고도 DAG 변경만 배포할 수 있어서, 2분짜리 작업이 30초로 줄어요.

4. **secret은 repository가 아니라 AWS Secrets Manager에 두세요.** CI/CD 파이프라인이 배포 시점에 secret을 가져와 대상 서버의 `.env`에 써요. 이러면 자격 증명이 git 히스토리에 남지 않고, 교체(rotation)도 간단해져요.

이 글의 패턴은 EC2 한 대에서 멀티 노드 배포까지 그대로 확장돼요. 규칙은 늘 같아요. 개발은 로컬에서 빌드하고, 프로덕션은 미리 빌드된 image를 가져와요.
