---
title: ECR 토큰 갱신 Cron
description: AWS ECR 인증 토큰은 12시간 후 만료돼요. 오래 실행되는 Docker 호스트에서는 자동 토큰 갱신을 구현해야 해요.
date: 2026-01-23T00:00:00.000Z
updated: '2026-03-22'
tags:
  - devops
  - aws
  - ecr
  - docker
  - cron
  - work
category: devops
draft: false
lang: ko
source_lang: en
source_slug: ecr-token-refresh-cron
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: 'https://docs.aws.amazon.com/AmazonECR/latest/userguide/registry_auth.html'
    title: Private registry authentication in Amazon ECR
    type: official
---

## 문제

- ECR 토큰은 12시간 후 만료돼요
- Docker 컨테이너는 보통 시작할 때만 로그인해요
- 컨테이너가 12시간 이상 실행되면 이후 `docker pull` 명령이 실패해요
- 에러: `authorization token has expired`

## 해결 방법

만료 전에 ECR 토큰을 6시간마다 갱신하는 cron job을 설정하면 돼요.

```bash
# Cron 항목 (6시간마다 실행)
0 */6 * * * HOME=/home/ec2-user /usr/bin/aws ecr get-login-password --region ap-northeast-2 | /usr/bin/docker login --username AWS --password-stdin <ECR_REGISTRY> >> /var/log/ecr-refresh.log 2>&1
```

## 핵심 포인트

- 토큰 수명: 12시간(AWS 제한)
- 갱신 간격: 6시간(안전 마진)
- cron에서는 전체 경로(`/usr/bin/aws`, `/usr/bin/docker`)를 사용해야 해요
- AWS CLI가 자격 증명을 찾을 수 있도록 `HOME`을 설정해야 해요
- 디버깅을 위해 파일에 로그를 남겨요

## Amazon Linux 2023 설정

```bash
# cronie 설치 (기본으로 포함되어 있지 않음)
sudo yum install -y cronie

# 활성화 및 시작
sudo systemctl enable crond
sudo systemctl start crond

# 특정 사용자에게 cron 설치
sudo -u ec2-user crontab -e
```

## 구현 위치

1. **CI/CD 파이프라인**(`deploy.yml`): DAG 동기화 job 시 설치
2. **초기 설정 스크립트**(`setup-git-credentials.sh`): EC2 부트스트랩 시 설치

## 트러블슈팅

```bash
# cron이 실행 중인지 확인
systemctl status crond

# cron 로그 확인
cat /var/log/ecr-refresh.log

# 수동 갱신 테스트
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin <ECR_REGISTRY>

# 현재 로그인 상태 확인
cat ~/.docker/config.json
```

## 흔한 실수

| 이슈                      | 해결                               |
| ------------------------- | ---------------------------------- |
| 잘못된 사용자로 cron 설치 | `sudo -u ec2-user crontab` 사용    |
| SSM에서 셸 이스케이핑     | 인라인 대신 임시 파일 사용         |
| cronie 미설치             | AL2023에서 `yum install -y cronie` |
