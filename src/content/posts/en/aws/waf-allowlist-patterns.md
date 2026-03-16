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
references:
  - url: >-
      https://docs.aws.amazon.com/waf/latest/developerguide/waf-ip-set-managing.html
    title: Creating and managing an IP set in AWS WAF
    type: official
source_content_hash: bcd75e1d0315d6f4e19407e083afd37c4fdda9c7d4069ba5e45cb18378c90499
---

blocklist approach because unknown routes are automatically blocked.

## Allowlist vs Blocklist

| Approach  | Default Action | Security    | Maintenance            |
| --------- | -------------- | ----------- | ---------------------- |
| Allowlist | Block          | ✅ Stronger | Must add new routes    |
| Blocklist | Allow          | ❌ Weaker   | Must block new attacks |

**Recommendation**: Use allowlist for APIs with known, stable routes.

## Implementation Patterns

### Pattern 1: Regex Consolidation (Dev/Cost-Optimized)

Single regex rule for multiple paths:

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

**Pros**: Fewer rules = lower WAF cost **Cons**: Harder to maintain, regex can
get complex

### Pattern 2: Explicit Rules (Prod/Clarity)

Separate rules for each path category:

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

**Pros**: Clear, maintainable, easy to add/remove routes **Cons**: More rules =
higher WAF cost

## Path Matching Strategies

### STARTS_WITH

```hcl
positional_constraint = "STARTS_WITH"
search_string         = "/socket.io"
```

Matches: `/socket.io`, `/socket.io/`, `/socket.io?EIO=4`

Use for: Routes with query parameters or sub-paths.

### EXACTLY

```hcl
positional_constraint = "EXACTLY"
search_string         = "/health"
```

Matches: Only `/health` exactly.

Use for: Exact path matches (health checks).

### CONTAINS

```hcl
positional_constraint = "CONTAINS"
search_string         = "/api/"
```

Matches: Any path containing `/api/`.

Use for: API versioning patterns.

## WebSocket/Socket.IO Paths

Socket.IO uses multiple sub-paths:

```text
/socket.io/?EIO=4&transport=polling
/socket.io/?EIO=4&transport=websocket
```

Always use `STARTS_WITH` for Socket.IO:

```hcl
byte_match_statement {
  search_string         = "/socket.io"
  positional_constraint = "STARTS_WITH"
}
```

## Verification Commands

### Check WAF Rules

```bash
aws wafv2 get-web-acl \
  --name app-prod-waf \
  --scope REGIONAL \
  --id <webacl-id> \
  --region ap-northeast-2 \
  --query 'WebACL.Rules[?Name==`AllowAPIRoutes`]'
```

### Check Blocked Requests

```bash
aws wafv2 get-sampled-requests \
  --web-acl-arn <webacl-arn> \
  --rule-metric-name BlockedRequests \
  --scope REGIONAL \
  --time-window StartTime=2024-01-01T00:00:00Z,EndTime=2024-01-02T00:00:00Z \
  --max-items 100
```

## Cost Optimization

| Component             | Monthly Cost (approx) |
| --------------------- | --------------------- |
| Web ACL               | $5                    |
| Rule (first 10)       | $1 each               |
| Request (per million) | $0.60                 |

**Strategy**: Use regex consolidation in dev, explicit rules in prod.

## Key Lessons

1. **Allowlist by default** - Block unknown routes automatically
2. **STARTS_WITH for APIs** - Most routes have query params or sub-paths
3. **Don't forget WebSockets** - Socket.IO needs explicit allowlisting
4. **Dev/Prod can differ** - Optimize for cost (dev) vs clarity (prod)
5. **Verify after deploy** - Use AWS CLI to confirm rules are active
