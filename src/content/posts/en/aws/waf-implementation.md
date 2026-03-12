---
title: AWS WAF Implementation
description: Web Application Firewall setup with allowlist approach.
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - aws
  - security
  - waf
  - work
category: aws
draft: false
lang: en
references:
  - url: 'https://docs.aws.amazon.com/waf/latest/developerguide/getting-started.html'
    title: Get started with AWS WAF
    type: official
source_content_hash: 1edb4cc346e40636ff07804f907058368f7ffb919151a1fd7fc51954e58a8348
---

## Architecture

| Environment | Type                  | Default Action | Cost       |
| ----------- | --------------------- | -------------- | ---------- |
| Production  | Regional WAF          | BLOCK          | ~$23/month |
| Dev/Local   | Regional WAF (shared) | BLOCK          | ~$7/month  |

## Production WAF Rules

### Allowlist Rules (Priority 1-3)

Only these endpoints allowed:

### Authentication

- `/auth`, `/v1/auth`
- `/google` (OAuth)

### Core API

- `/blocks`, `/calendars`, `/spaces`
- `/users`, `/contacts`

### Integrations

- `/v1/integrations`
- `/subscriptions`
- `/webhooks` (payment)

### Utility

- `/health` (ALB)
- `/internals`

### AWS Managed Rules (Priority 10-11)

- **Core Rule Set**: OWASP Top 10 (~700+ rules)
- **Known Bad Inputs**: Malicious payloads (~200+ patterns)

### Rate Limiting

- Production: 500 requests / 5 min / IP
- Dev: 1000 requests / 5 min / IP

## Monitoring

```bash
# Real-time logs
aws logs tail aws-waf-logs-prod --follow

# Blocked requests
aws logs filter-log-events \
  --log-group-name aws-waf-logs-prod \
  --filter-pattern '"action":"BLOCK"'

# Activity summary (last hour)
aws logs filter-log-events \
  --log-group-name aws-waf-logs-prod \
  --start-time $(echo $(($(date +%s) - 3600))000) \
  --query 'events[*].message' \
  --output text | jq -r '.action' | sort | uniq -c
```

## Maintenance

### Adding Blocked IPs

```hcl
# In waf.tf
addresses = [
  "192.0.2.1/32",    # Malicious IP
  "203.0.113.0/24",  # Malicious range
]
```

### Adding New Routes

Add to allowlist rules in waf.tf, then `terraform apply`.

## Rollback

```bash
# Disable WAF (keep config)
terraform destroy -target=aws_wafv2_web_acl_association.alb_waf

# Complete removal
terraform destroy -target=module.waf
```

## Dev vs Production

| Aspect           | Production | Dev     |
| ---------------- | ---------- | ------- |
| Rules            | 10         | 2       |
| Managed rules    | Yes        | No      |
| Logging          | CloudWatch | None    |
| `/api` (Swagger) | Blocked    | Allowed |
