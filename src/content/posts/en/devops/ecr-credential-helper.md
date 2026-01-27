---
title: ECR Credential Helper
description: >-
  AWS's official solution for automatic ECR authentication. Instead of storing
  tokens that expire, it fetches fresh tokens on-demand.
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - devops
  - aws
  - docker
  - ecr
category: devops
draft: false
lang: en
references:
  - url: 'https://github.com/awslabs/amazon-ecr-credential-helper'
    title: Amazon ECR Credential Helper
    type: official
  - url: 'https://docs.aws.amazon.com/AmazonECR/latest/userguide/registry_auth.html'
    title: AWS ECR Registry Authentication
    type: official
---

# ECR Credential Helper

AWS's official solution for automatic ECR authentication. Instead of storing tokens that expire, it fetches fresh tokens on-demand.

## The Problem

```text
OLD WAY (One-time login):
┌─────────────────────────────────────────────────┐
│ Container startup: docker login → token stored  │
│ 12 hours later: token expires                   │
│ docker pull: "authorization token has expired"  │
└─────────────────────────────────────────────────┘
```

ECR tokens expire after 12 hours. Storing them means they can expire before the next use.

## The Solution

```text
NEW WAY (Credential helper):
┌─────────────────────────────────────────────────┐
│ docker pull requested                           │
│ Docker reads ~/.docker/config.json              │
│ Sees credHelpers → calls docker-credential-ecr-login │
│ Helper fetches fresh token from AWS STS         │
│ Docker uses token immediately                   │
│ No storage = no expiry problem                  │
└─────────────────────────────────────────────────┘
```

## How It Works

```mermaid
sequenceDiagram
    participant Docker as Docker Client
    participant Helper as docker-credential-ecr-login
    participant STS as AWS STS
    participant ECR as ECR Registry

    Docker->>Docker: Read ~/.docker/config.json
    Note over Docker: Sees credHelpers → ecr-login
    Docker->>Helper: Get credentials for registry
    Helper->>STS: aws ecr get-authorization-token
    STS-->>Helper: Fresh token (valid 12h)
    Helper-->>Docker: Return username + password
    Docker->>ECR: Pull with fresh credentials
```

## Configuration

### 1. Install the Helper

```dockerfile
# In Dockerfile
RUN curl -sL "https://amazon-ecr-credential-helper-releases.s3.us-east-2.amazonaws.com/0.9.0/linux-${ARCH}/docker-credential-ecr-login" \
    -o /usr/local/bin/docker-credential-ecr-login \
    && chmod +x /usr/local/bin/docker-credential-ecr-login
```

### 2. Configure Docker

```json
// ~/.docker/config.json
{
    "credHelpers": {
        "123456789.dkr.ecr.ap-northeast-2.amazonaws.com": "ecr-login"
    }
}
```

### 3. Required IAM Permissions

```text
- sts:GetCallerIdentity      (account ID lookup)
- ecr:GetAuthorizationToken  (Docker login token)
- ecr:BatchCheckLayerAvailability
- ecr:GetDownloadUrlForLayer
- ecr:BatchGetImage
```

## Key Points

- **On-demand**: Token fetched only when Docker needs it
- **No storage**: Token used immediately, never written to disk
- **Auto-refresh**: Each operation gets a fresh token
- **IAM-based**: Uses EC2 instance role, no credentials to manage

## When to Use

| Scenario | Use Credential Helper? |
|----------|------------------------|
| Long-running containers pulling from ECR | Yes |
| CI/CD pipelines | Maybe (short-lived, login OK) |
| Local development | Yes (convenient) |
| Lambda/ECS with ECR | No (AWS handles it) |

## Comparison

| Aspect | docker login | Credential Helper |
|--------|--------------|-------------------|
| Token storage | ~/.docker/config.json | None |
| Expiry handling | Manual refresh (cron) | Automatic |
| Setup complexity | Simple | Slightly more |
| Maintenance | High (cron, monitoring) | None |
