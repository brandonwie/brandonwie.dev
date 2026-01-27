---
title: 'ECR Credential Helper 사용법'
description: >-
  ECR 인증을 자동으로 처리해주는 AWS 공식 도구입니다. 만료되는 토큰을 저장하는 대신, 필요할 때마다 새 토큰을 가져옵니다.
date: 2026-01-26T00:00:00.000Z
updated: '2026-01-28'
tags:
  - devops
  - aws
  - docker
  - ecr
category: devops
draft: false
lang: ko
source_lang: en
source_slug: ecr-credential-helper
source_updated: 2026-01-26T00:00:00.000Z
translation_date: '2026-01-28'
references:
  - url: 'https://github.com/awslabs/amazon-ecr-credential-helper'
    title: Amazon ECR Credential Helper
    type: official
  - url: 'https://docs.aws.amazon.com/AmazonECR/latest/userguide/registry_auth.html'
    title: AWS ECR Registry Authentication
    type: official
---

<script>
import Mermaid from '$lib/components/Mermaid.svelte';
</script>

## 문제 상황

```text
기존 방식 (일회성 로그인):
┌─────────────────────────────────────────────────┐
│ 컨테이너 시작: docker login → 토큰 저장          │
│ 12시간 후: 토큰 만료                             │
│ docker pull: "authorization token has expired"  │
└─────────────────────────────────────────────────┘
```

ECR 토큰은 12시간 후에 만료됩니다. 토큰을 저장해두면 다음에 쓸 때 이미 만료되어 있을 수 있습니다.

## 해결 방법

```text
새로운 방식 (Credential helper):
┌─────────────────────────────────────────────────┐
│ docker pull 요청                                 │
│ Docker가 ~/.docker/config.json 읽음              │
│ credHelpers 확인 → docker-credential-ecr-login 호출 │
│ Helper가 AWS STS에서 새 토큰 가져옴              │
│ Docker가 토큰을 바로 사용                        │
│ 저장 안 함 = 만료 문제 없음                      │
└─────────────────────────────────────────────────┘
```

## 동작 원리

<Mermaid code={`
sequenceDiagram
    participant Docker as Docker Client
    participant Helper as docker-credential-ecr-login
    participant STS as AWS STS
    participant ECR as ECR Registry
    Docker->>Docker: ~/.docker/config.json 읽기
    Note over Docker: credHelpers - ecr-login 확인
    Docker->>Helper: registry 인증 정보 요청
    Helper->>STS: aws ecr get-authorization-token
    STS-->>Helper: 새 토큰 12시간 유효
    Helper-->>Docker: username + password 반환
    Docker->>ECR: 새 인증 정보로 Pull
`} />

## 설정 방법

### 1. Helper 설치

```dockerfile
# Dockerfile에서
RUN curl -sL "https://amazon-ecr-credential-helper-releases.s3.us-east-2.amazonaws.com/0.9.0/linux-${ARCH}/docker-credential-ecr-login" \
    -o /usr/local/bin/docker-credential-ecr-login \
    && chmod +x /usr/local/bin/docker-credential-ecr-login
```

### 2. Docker 설정

```json
// ~/.docker/config.json
{
    "credHelpers": {
        "123456789.dkr.ecr.ap-northeast-2.amazonaws.com": "ecr-login"
    }
}
```

### 3. 필요한 IAM 권한

```text
- sts:GetCallerIdentity      (계정 ID 조회)
- ecr:GetAuthorizationToken  (Docker 로그인 토큰)
- ecr:BatchCheckLayerAvailability
- ecr:GetDownloadUrlForLayer
- ecr:BatchGetImage
```

## 핵심 포인트

- **온디맨드**: Docker가 필요할 때만 토큰을 가져옴
- **저장 안 함**: 토큰을 바로 사용하고 디스크에 쓰지 않음
- **자동 갱신**: 매번 새 토큰을 가져옴
- **IAM 기반**: EC2 instance role 사용, 별도 credential 관리 불필요

## 언제 사용할까

| 상황 | Credential Helper 사용? |
| ---- | ----------------------- |
| ECR에서 pull하는 장시간 실행 컨테이너 | O |
| CI/CD 파이프라인 | 상황에 따라 (짧은 실행이면 login으로 충분) |
| 로컬 개발 환경 | O (편리함) |
| Lambda/ECS에서 ECR 사용 | X (AWS가 알아서 처리) |

## 비교

| 항목 | docker login | Credential Helper |
| ---- | ------------ | ----------------- |
| 토큰 저장 | ~/.docker/config.json | 없음 |
| 만료 처리 | 수동 갱신 (cron) | 자동 |
| 설정 복잡도 | 단순 | 약간 더 복잡 |
| 유지보수 | 높음 (cron, 모니터링) | 없음 |
