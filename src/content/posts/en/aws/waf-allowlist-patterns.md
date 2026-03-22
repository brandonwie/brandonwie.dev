---
title: WAF Allowlist Patterns
description: Block-by-default WAF approach using route allowlisting. Stronger security than
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - aws
  - waf
  - security
  - infrastructure
category: aws
draft: false
lang: en
expanded: true
references:
  - url: >-
      https://docs.aws.amazon.com/waf/latest/developerguide/waf-ip-set-managing.html
    title: Creating and managing an IP set in AWS WAF
    type: official
source_content_hash: bcd75e1d0315d6f4e19407e083afd37c4fdda9c7d4069ba5e45cb18378c90499
---

I noticed our production API was receiving thousands of requests to paths like `/wp-admin`, `/phpmyadmin`, and `/.env`. Bots scanning for vulnerabilities, hitting every common exploit path they know. Our API returned 404s for all of them, but each request still consumed compute resources, cluttered logs, and occasionally triggered rate limiting for legitimate users.

The fix was to flip the default: instead of allowing everything and blocking known-bad paths, block everything and allow only the routes our API serves. This is the allowlist approach to WAF configuration, and it is fundamentally stronger than the blocklist alternative.

## Allowlist vs Blocklist

| Approach  | Default Action | Security   | Maintenance            |
| --------- | -------------- | ---------- | ---------------------- |
| Allowlist | Block          | Stronger   | Must add new routes    |
| Blocklist | Allow          | Weaker     | Must block new attacks |

With a blocklist, you are playing defense. Every new attack vector requires a new rule. Miss one, and the request reaches your application. You are always one step behind.

With an allowlist, unknown routes are blocked by default. A bot scanning for `/wp-admin` gets a 403 before it touches your application. You do not need to know about the attack -- any path not in your allowlist is rejected automatically.

**The recommendation:** use allowlist for APIs with known, stable routes. If your API serves `/users`, `/calendars`, `/blocks`, and `/socket.io`, those are the only paths that should reach your application. Everything else is noise.

The tradeoff is maintenance. Every time you add a new API route, you must also update the WAF allowlist. Forgetting to do so means the new route returns 403 in production. This is a deployment step that needs to be in your checklist, but the security benefit far outweighs the operational cost.

## Implementation Patterns

There are two ways to structure an allowlist in AWS WAF. I use both, for different environments.

### Pattern 1: Regex Consolidation (Dev/Cost-Optimized)

A single regex rule matches multiple paths at once:

```hcl
resource "aws_wafv2_web_acl" "dev" {
  rule {
    name     = "AllowLegitimateRoutes"
    priority = 1

    statement {
      regex_pattern_set_reference_statement {
        arn = aws_wafv2_regex_pattern_set.allowed_routes.arn
        field_to_match {
          uri_path {}
        }
        text_transformation {
          priority = 0
          type     = "NONE"
        }
      }
    }

    action {
      allow {}
    }
  }

  # Default: Block everything else
  default_action {
    block {}
  }
}

resource "aws_wafv2_regex_pattern_set" "allowed_routes" {
  name  = "allowed-routes"
  scope = "REGIONAL"

  regular_expression {
    regex_string = "^/(users|calendars|blocks|sync|socket\\.io)"
  }
}
```

The entire allowlist lives in a single regex pattern. One rule, one pattern set, minimal WAF cost.

**Pros:** Fewer rules means lower WAF billing. At $1 per rule per month, a single regex rule versus ten explicit rules saves $9/month.

**Cons:** The regex gets harder to maintain as you add routes. A complex regex with 20 alternatives is error-prone and difficult to review in a pull request.

### Pattern 2: Explicit Rules (Prod/Clarity)

Separate rules for each path category, using byte match statements:

```hcl
resource "aws_wafv2_web_acl" "prod" {
  rule {
    name     = "AllowAPIRoutes"
    priority = 1

    statement {
      or_statement {
        statement {
          byte_match_statement {
            search_string         = "/users"
            positional_constraint = "STARTS_WITH"
            field_to_match { uri_path {} }
            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
        statement {
          byte_match_statement {
            search_string         = "/calendars"
            positional_constraint = "STARTS_WITH"
            field_to_match { uri_path {} }
            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
      }
    }

    action {
      allow {}
    }
  }

  rule {
    name     = "AllowWebSocketRoutes"
    priority = 2

    statement {
      byte_match_statement {
        search_string         = "/socket.io"
        positional_constraint = "STARTS_WITH"
        field_to_match { uri_path {} }
        text_transformation {
          priority = 0
          type     = "NONE"
        }
      }
    }

    action {
      allow {}
    }
  }

  default_action {
    block {}
  }
}
```

Each route category gets its own named rule. API routes are grouped in an `or_statement`, and WebSocket routes get a separate rule.

**Pros:** Clear and maintainable. Adding a new route means adding a byte match statement to the appropriate rule. Easy to review, easy to debug. When a request is blocked, the WAF logs tell you which rule evaluated it and why.

**Cons:** More rules means higher WAF cost. Each rule is $1/month. For production, the clarity is worth the cost.

## Path Matching Strategies

WAF offers three positional constraints. Choosing the right one for each path prevents both false positives (blocking legitimate requests) and false negatives (allowing unintended paths).

### STARTS_WITH

```hcl
positional_constraint = "STARTS_WITH"
search_string         = "/socket.io"
```

Matches: `/socket.io`, `/socket.io/`, `/socket.io?EIO=4`

This is the right choice for most API routes. Real requests include query parameters, sub-paths, and trailing slashes. `STARTS_WITH` handles all of these without listing every variation.

### EXACTLY

```hcl
positional_constraint = "EXACTLY"
search_string         = "/health"
```

Matches: only `/health`, nothing else.

Use this for health check endpoints and other paths that should never have sub-paths or query parameters. The strictness prevents attackers from appending paths like `/health/../admin`.

### CONTAINS

```hcl
positional_constraint = "CONTAINS"
search_string         = "/api/"
```

Matches: any path containing `/api/` anywhere.

Use this for API versioning patterns like `/v1/api/users` or `/v2/api/calendars`. Be careful with `CONTAINS` -- it is the least restrictive constraint and can match more broadly than you intend.

## WebSocket/Socket.IO Paths

Socket.IO deserves special attention because it uses multiple sub-paths with query parameters:

```text
/socket.io/?EIO=4&transport=polling
/socket.io/?EIO=4&transport=websocket
```

The initial connection uses HTTP long-polling at `/socket.io/?EIO=4&transport=polling`, then upgrades to WebSocket at `/socket.io/?EIO=4&transport=websocket`. Both paths must be allowed for Socket.IO to function.

Always use `STARTS_WITH` for Socket.IO:

```hcl
byte_match_statement {
  search_string         = "/socket.io"
  positional_constraint = "STARTS_WITH"
}
```

Using `EXACTLY` would block both paths because of the query parameters. Using a regex would work but adds unnecessary complexity. `STARTS_WITH` covers all Socket.IO sub-paths and transports with a single rule.

## Verification Commands

After deploying WAF changes, verify that the rules are active and working as expected.

### Check WAF Rules

```bash
aws wafv2 get-web-acl \
  --name moba-prod-waf \
  --scope REGIONAL \
  --id <webacl-id> \
  --region ap-northeast-2 \
  --query 'WebACL.Rules[?Name==`AllowAPIRoutes`]'
```

This returns the rule definition so you can confirm the byte match statements are correct.

### Check Blocked Requests

```bash
aws wafv2 get-sampled-requests \
  --web-acl-arn <webacl-arn> \
  --rule-metric-name BlockedRequests \
  --scope REGIONAL \
  --time-window StartTime=2024-01-01T00:00:00Z,EndTime=2024-01-02T00:00:00Z \
  --max-items 100
```

Review sampled blocked requests after deployment to make sure you are not accidentally blocking legitimate traffic. Look for 403 responses to paths that should be allowed -- those indicate a missing allowlist entry.

I make it a habit to check sampled requests within the first hour after any WAF deployment. Catching a missing allowlist entry in the first hour is a quick fix. Discovering it from a customer support ticket is not.

## Cost Optimization

WAF pricing is predictable but adds up with many rules:

| Component             | Monthly Cost (approx) |
| --------------------- | --------------------- |
| Web ACL               | $5                    |
| Rule (first 10)       | $1 each               |
| Request (per million) | $0.60                 |

**Strategy:** Use regex consolidation in dev environments to minimize cost. Use explicit rules in production for clarity and maintainability. The difference between 2 regex rules ($7/month total) and 10 explicit rules ($15/month total) is small enough that production environments should always prioritize debuggability.

For high-traffic APIs, the per-request cost ($0.60 per million) is the dominant factor regardless of which pattern you choose. At 100 million requests per month, you pay $60 in request charges compared to $5-$15 in rule charges. Optimizing the number of rules matters less at scale than optimizing whether requests should reach your API at all.

## Key Takeaways

Five principles for WAF allowlist configuration:

1. **Default to block.** Unknown routes should never reach your application. The allowlist approach handles this automatically.
2. **Use STARTS_WITH for API routes.** Most routes have query parameters or sub-paths. Exact matching is too restrictive for general API paths.
3. **Do not forget WebSockets.** Socket.IO uses multiple sub-paths with query parameters. A single `STARTS_WITH` rule on `/socket.io` covers all of them.
4. **Use different patterns for dev and prod.** Regex consolidation saves cost in dev. Explicit rules save debugging time in prod.
5. **Verify after every deployment.** Use the AWS CLI to confirm rules are active and check sampled requests for false positives.
