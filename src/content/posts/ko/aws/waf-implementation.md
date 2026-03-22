---
title: AWS WAF 구현
description: Allowlist 방식의 Web Application Firewall 설정 가이드.
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - aws
  - security
  - waf
  - work
category: aws
draft: false
lang: ko
source_lang: en
source_slug: waf-implementation
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: 'https://docs.aws.amazon.com/waf/latest/developerguide/getting-started.html'
    title: Get started with AWS WAF
    type: official
---

## 아키텍처

| 환경       | 타입               | 기본 동작 | 비용    |
| ---------- | ------------------ | --------- | ------- |
| Production | Regional WAF       | BLOCK     | ~$23/월 |
| Dev/Local  | Regional WAF(공유) | BLOCK     | ~$7/월  |

## Production WAF 규칙

### Allowlist 규칙(Priority 1-3)

허용되는 엔드포인트:

### 인증

- `/auth`, `/v1/auth`
- `/google`(OAuth)

### Core API

- `/blocks`, `/calendars`, `/spaces`
- `/users`, `/contacts`

### 통합

- `/v1/integrations`
- `/subscriptions`
- `/webhooks`(결제)

### 유틸리티

- `/health`(ALB)
- `/internals`

### AWS Managed Rules(Priority 10-11)

- **Core Rule Set**: OWASP Top 10(~700개 이상 규칙)
- **Known Bad Inputs**: 악성 페이로드(~200개 이상 패턴)

### Rate Limiting

- Production: IP당 5분 내 500 요청
- Dev: IP당 5분 내 1000 요청

## 모니터링

```bash
# 실시간 로그
aws logs tail aws-waf-logs-prod --follow

# 차단된 요청
aws logs filter-log-events \
  --log-group-name aws-waf-logs-prod \
  --filter-pattern '"action":"BLOCK"'

# 활동 요약(최근 1시간)
aws logs filter-log-events \
  --log-group-name aws-waf-logs-prod \
  --start-time $(echo $(($(date +%s) - 3600))000) \
  --query 'events[*].message' \
  --output text | jq -r '.action' | sort | uniq -c
```

## 유지보수

### 차단 IP 추가

```hcl
# waf.tf에서
addresses = [
  "192.0.2.1/32",    # 악성 IP
  "203.0.113.0/24",  # 악성 범위
]
```

### 새 라우트 추가

waf.tf의 allowlist 규칙에 추가한 후 `terraform apply`를 실행하세요.

## Rollback

```bash
# WAF 비활성화(설정은 유지)
terraform destroy -target=aws_wafv2_web_acl_association.alb_waf

# 완전 제거
terraform destroy -target=module.waf
```

## Dev vs Production

| 항목            | Production | Dev  |
| --------------- | ---------- | ---- |
| 규칙            | 10         | 2    |
| Managed rules   | 있음       | 없음 |
| 로깅            | CloudWatch | 없음 |
| `/api`(Swagger) | 차단       | 허용 |
