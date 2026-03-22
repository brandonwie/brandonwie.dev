---
title: AWS WAF Implementation
description: Web Application Firewall setup with allowlist approach.
date: 2026-01-23T00:00:00.000Z
updated: '2026-03-22'
tags:
  - aws
  - security
  - waf
  - work
category: aws
draft: false
lang: en
expanded: true
references:
  - url: 'https://docs.aws.amazon.com/waf/latest/developerguide/getting-started.html'
    title: Get started with AWS WAF
    type: official
source_content_hash: 1edb4cc346e40636ff07804f907058368f7ffb919151a1fd7fc51954e58a8348
---

Our API was getting hit by scanners probing for WordPress admin panels, `.env` files, and Spring Boot actuator endpoints -- none of which existed on our backend. The requests were harmless in that they all returned 404, but they generated noise in our logs, consumed ALB capacity, and made it harder to spot real issues in monitoring dashboards. We needed a way to say "if a request is not for a known endpoint, drop it before it reaches our application."

That is the allowlist approach to AWS WAF: instead of trying to enumerate every possible attack pattern (blocklist), you define which paths are legitimate and block everything else. This post documents the architecture, rules, and operational procedures we implemented.

---

## Architecture Overview

We run two WAF configurations: one for production with full protection, and a lighter shared instance for dev and local environments.

| Environment | Type                  | Default Action | Cost       |
| ----------- | --------------------- | -------------- | ---------- |
| Production  | Regional WAF          | BLOCK          | ~$23/month |
| Dev/Local   | Regional WAF (shared) | BLOCK          | ~$7/month  |

The default action is the critical design decision here. Setting it to `BLOCK` means every request is denied unless a rule explicitly allows it. This is the opposite of most WAF tutorials, which start with `ALLOW` as default and add block rules. The allowlist approach is more secure for APIs with well-defined route structures because it denies unknown paths by default -- you do not need to anticipate every attack pattern.

The cost difference comes from rule count. Production uses 10 rules (allowlist + managed rules + rate limiting), while dev uses 2 (a broad allowlist and rate limiting). At roughly $1 per rule per month plus $0.60 per million requests evaluated, WAF is one of the cheaper security investments you can make.

---

## Production WAF Rules

The rules are organized by priority. Lower numbers are evaluated first, meaning allowlist rules run before managed security rules. This ordering matters: a request must first match a known path, then pass through AWS managed rule sets.

### Allowlist Rules (Priority 1-3)

These define every legitimate endpoint our API serves. Anything not on this list gets the default `BLOCK` action.

**Authentication:**

- `/auth`, `/v1/auth`
- `/google` (OAuth)

**Core API:**

- `/blocks`, `/calendars`, `/spaces`
- `/users`, `/contacts`

**Integrations:**

- `/v1/integrations`
- `/subscriptions`
- `/webhooks` (payment)

**Utility:**

- `/health` (ALB health checks)
- `/internals`

Each allowlist rule uses string-match conditions on the URI path. We split them into three rules (auth, core, integrations) rather than one massive rule because WAF has a limit of 10 conditions per rule, and separate rules make it easier to see which category of traffic is being allowed in CloudWatch metrics.

### AWS Managed Rules (Priority 10-11)

After a request passes the allowlist check, it goes through two AWS-managed rule sets:

- **Core Rule Set (CRS):** Covers OWASP Top 10 protections with roughly 700+ individual rules. This catches SQL injection, XSS, and other common web exploits.
- **Known Bad Inputs:** Contains 200+ patterns for known malicious payloads, including Log4j exploits, bad bot signatures, and common vulnerability scanners.

These managed rules are maintained by AWS and update automatically. You pay for the rule group, not the individual rules inside it. The trade-off: you get broad protection without writing custom rules, but you cannot see exactly what each sub-rule does, and false positives require overriding specific rule IDs.

### Rate Limiting

Rate limiting sits at the end of the rule chain as a safety net against brute-force and denial-of-service attempts.

- **Production:** 500 requests per 5-minute window per IP address
- **Dev:** 1,000 requests per 5-minute window per IP address

The dev limit is higher because automated test suites can generate bursts of requests that would trip a 500-request threshold. In production, 500 requests in 5 minutes is generous for normal API usage -- any single IP exceeding that is either a misconfigured client or an attack.

---

## Monitoring

WAF logs go to CloudWatch, where you can tail them in real time or filter for specific patterns. Here are the commands I use most often.

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

The activity summary is the one I check daily. It gives a quick count of ALLOW vs BLOCK actions over the last hour. A sudden spike in BLOCK actions usually means a scanner found our endpoint, while a spike in ALLOW with no corresponding user activity could indicate a compromised API key making automated requests.

---

## Maintenance Procedures

### Adding Blocked IPs

When you identify a persistent bad actor (repeated blocks from the same IP, or an IP that somehow gets past managed rules), add it to the IP block list in `waf.tf`:

```hcl
# In waf.tf
addresses = [
  "192.0.2.1/32",    # Malicious IP
  "203.0.113.0/24",  # Malicious range
]
```

Then run `terraform apply`. The IP set updates take effect within seconds across all WAF-protected endpoints.

### Adding New Routes

When the backend team ships a new API endpoint, it needs to be added to the allowlist rules in `waf.tf`. Without this step, the new endpoint returns 403 Forbidden even though the application code is deployed and healthy. This is the one operational cost of the allowlist approach -- every new route requires a WAF update. In practice, we add the WAF rule in the same PR that adds the API route, so it ships together.

---

## Rollback

If WAF starts causing issues (false positives blocking legitimate users, or you need to debug a connectivity problem without WAF interference), you have two options:

```bash
# Disable WAF (keep config for re-enabling later)
terraform destroy -target=aws_wafv2_web_acl_association.alb_waf

# Complete removal (destroys all WAF resources)
terraform destroy -target=module.waf
```

The first command is the one you want in an emergency. It removes the association between the WAF and the ALB, so traffic flows directly to your application unfiltered. The WAF rules, IP sets, and logging configuration all remain intact. Re-enabling is a single `terraform apply` away.

The second command tears everything down. Use it only if you are decommissioning WAF entirely or rebuilding from scratch.

---

## Dev vs Production Differences

| Aspect           | Production | Dev     |
| ---------------- | ---------- | ------- |
| Rules            | 10         | 2       |
| Managed rules    | Yes        | No      |
| Logging          | CloudWatch | None    |
| `/api` (Swagger) | Blocked    | Allowed |

The most notable difference: dev allows the `/api` Swagger documentation path so developers can browse the API docs during development. Production blocks it because public-facing API documentation exposes your endpoint structure to attackers. If someone needs to reference the API docs for a production service, they check the dev environment or the source code.

---

## Practical Takeaway

The allowlist approach inverts the typical WAF mental model. Instead of asking "what should I block?" you ask "what should I allow?" This is more work upfront -- you need to enumerate every legitimate path -- but it provides stronger default security. Unknown paths are blocked without you having to predict every possible attack vector.

The ongoing cost is discipline: every new API route needs a corresponding WAF rule update. Build that into your deployment checklist, and the allowlist approach becomes a reliable layer of defense that costs less than $25 a month for production-grade protection.
