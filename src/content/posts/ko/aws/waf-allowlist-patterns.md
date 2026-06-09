---
title: WAF Allowlist 패턴
description: >-
  라우트 allowlist를 사용한 block-by-default WAF 접근 방식. 알 수 없는 라우트가 자동 차단되어 blocklist보다
  보안이 강해요.
date: 2026-01-26T00:00:00.000Z
updated: '2026-06-09'
tags:
  - aws
  - waf
  - security
  - infrastructure
category: aws
draft: false
lang: ko
source_lang: en
source_slug: waf-allowlist-patterns
source_updated: '2026-06-09'
translation_date: '2026-06-09'
references:
  - url: >-
      https://docs.aws.amazon.com/waf/latest/developerguide/waf-ip-set-managing.html
    title: Creating and managing an IP set in AWS WAF
    type: official
---

## Allowlist vs Blocklist

| 접근 방식 | 기본 동작 | 보안      | 유지보수            |
| --------- | --------- | --------- | ------------------- |
| Allowlist | 차단      | ✅ 강함   | 새 라우트 추가 필요 |
| Blocklist | 허용      | ❌ 약함   | 새 공격 차단 필요   |

**권장**: 알려진 안정적 라우트를 가진 API에는 allowlist를 사용하세요.

## 구현 패턴

### 패턴 1: Regex 통합(Dev/비용 최적화)

여러 경로를 단일 regex 규칙으로 처리해요:

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

  # 기본: 나머지 모두 차단
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

**장점**: 규칙 수가 적어 WAF 비용이 낮아요
**단점**: 유지보수가 어렵고, regex가 복잡해질 수 있어요

### 패턴 2: 명시적 규칙(Prod/명확성)

각 경로 카테고리에 별도 규칙을 만들어요:

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

**장점**: 명확하고 유지보수하기 쉽고 라우트 추가/제거가 간편해요
**단점**: 규칙이 많아지면 WAF 비용이 높아져요

## 규칙 평가: Terminating Allow는 이후 규칙을 건너뛰어요

각 규칙의 `priority` 필드는 단순 장식이 아니에요. WAFv2는 priority 오름차순으로 규칙을 평가하는데, `allow {}` 액션은 terminating이에요. allowlist 규칙이 매칭되는 순간 WAF는 평가를 멈추고, 그 뒤에 있는 규칙(AWS 관리형 규칙 그룹, rate-based 규칙 등)은 해당 요청에 대해 아예 실행되지 않아요.

여기엔 짚고 넘어갈 보안적 함의가 있어요. allowlist에 포함된 라우트는 관리형 보호를 완전히 우회한다는 점이에요. OWASP나 SQL 인젝션 관리형 규칙 그룹을 allow 규칙보다 낮은 priority(뒤쪽)에 붙이면, 이 규칙들은 allowlist를 통과하지 못한 트래픽만 보게 돼요. 정작 신뢰해서 허용한 라우트는 검사하지 않죠. 신뢰 라우트는 WAF가 단락(short-circuit)되니 지연이 낮지만, 그만큼 관리형 규칙 보호도 전혀 받지 못해요.

대부분의 공개 API 라우트라면 받아들일 만한 트레이드오프예요. 핸들러를 직접 통제하고, allowlist가 이미 나머지를 다 막았으니까요. 문제가 되는 건 `/internals/*` 같은 내부·권한 엔드포인트예요. 이런 경로를 allowlist에 넣으면 관리형 규칙과 rate limiting이 적용되지 않으니, 보호는 애플리케이션 계층이 직접 책임져야 해요. allow 항목을 추가하기 전에 위협 모델에서 한 번 따져볼 부분이에요.

## 경로 매칭 전략

### STARTS_WITH

```hcl
positional_constraint = "STARTS_WITH"
search_string         = "/socket.io"
```

매칭 대상: `/socket.io`, `/socket.io/`, `/socket.io?EIO=4`

용도: 쿼리 파라미터나 하위 경로가 있는 라우트.

### EXACTLY

```hcl
positional_constraint = "EXACTLY"
search_string         = "/health"
```

매칭 대상: `/health`만 정확히 매칭.

용도: 정확한 경로 매칭(헬스 체크).

### CONTAINS

```hcl
positional_constraint = "CONTAINS"
search_string         = "/api/"
```

매칭 대상: `/api/`를 포함하는 모든 경로.

용도: API 버전 관리 패턴.

## WebSocket/Socket.IO 경로

Socket.IO는 여러 하위 경로를 사용해요:

```text
/socket.io/?EIO=4&transport=polling
/socket.io/?EIO=4&transport=websocket
```

Socket.IO에는 항상 `STARTS_WITH`를 사용하세요:

```hcl
byte_match_statement {
  search_string         = "/socket.io"
  positional_constraint = "STARTS_WITH"
}
```

## 검증 명령어

### WAF 규칙 확인

```bash
aws wafv2 get-web-acl \
  --name app-prod-waf \
  --scope REGIONAL \
  --id <webacl-id> \
  --region ap-northeast-2 \
  --query 'WebACL.Rules[?Name==`AllowAPIRoutes`]'
```

### 차단된 요청 확인

```bash
aws wafv2 get-sampled-requests \
  --web-acl-arn <webacl-arn> \
  --rule-metric-name BlockedRequests \
  --scope REGIONAL \
  --time-window StartTime=2024-01-01T00:00:00Z,EndTime=2024-01-02T00:00:00Z \
  --max-items 100
```

## 상태 코드 트리아지: 어느 계층이 요청을 거부했나요?

allowlist가 적용되면 요청은 세 계층을 거쳐요. WAF, 그다음 ALB, 마지막으로 백엔드(여기서는 ECS)예요. 에러가 났을 때 HTTP 상태 코드를 보면 어느 계층이 거부했는지 알 수 있어서, 엉뚱한 컴포넌트를 디버깅하는 일을 줄여줘요.

| 상태 코드         | 출처                | 의미                                                                       |
| ----------------- | ------------------- | -------------------------------------------------------------------------- |
| 403 (커스텀 본문) | WAF 기본 동작       | allowlist에 없는 경로, ALB에 닿기 전에 차단됨                              |
| 429               | WAF rate-based 규칙 | IP별 요청 한도 초과                                                        |
| 504               | ALB                 | WAF·ALB는 통과; **백엔드**가 `idle_timeout`(기본 60초) 안에 응답하지 못함  |
| 502 / 503         | ALB                 | 정상 타겟이 없거나 타겟이 에러를 반환함                                    |

헷갈리기 쉬운 건 504예요. 504는 절대 WAF 차단이 아니에요. 504가 보인다는 건 요청이 이미 allowlist를 통과해 백엔드까지 도달했다는 뜻이라, 문제는 WAF 규칙이 아니라 핸들러나 그 egress에 있어요. 반대로 커스텀 차단 본문과 함께 오는 403은 경로가 allowlist에서 빠졌다는 신호예요. 해당 `byte_match` 항목을 추가하면 되고, 버전 라우트라면 위에서 본 `/v2/` 접두사 함정을 기억하세요.

## 비용 최적화

| 항목            | 월 비용(약) |
| --------------- | ----------- |
| Web ACL         | $5          |
| 규칙(처음 10개) | 개당 $1     |
| 요청(백만 건당) | $0.60       |

**전략**: dev에서는 regex 통합, prod에서는 명시적 규칙을 사용하세요.

## 어려웠던 점

### 버전 경로 접두사 함정

예상 밖이었던 문제: `STARTS_WITH "/spaces"`는 `/v2/spaces`를 매칭하지 않아요. URI 경로가 문자 그대로 `/v2/`로 시작하지 `/spaces`로 시작하지 않거든요. 돌이켜보면 당연한 건데, 새로운 버전 API 라우트를 추가할 때 기존 `/spaces` allowlist 항목이 모든 버전을 커버한다고 생각하기 쉬워요.

각 API 버전 접두사마다 별도의 allowlist 항목이 필요해요:

```hcl
# 세 개의 별도 statement — 하나가 아님
statement { byte_match_statement { search_string = "/spaces"    ... } }
statement { byte_match_statement { search_string = "/v1/spaces" ... } }
statement { byte_match_statement { search_string = "/v2/spaces" ... } }
```

명시적 `/v2/spaces` 항목이 없으면 프로덕션에서 요청이 조용히 403을 반환해요. 까다로운 점은 dev 환경에서는 regex로 `/v2/*`를 포괄 허용하는 경우가 많아서 dev에서는 완벽하게 작동하고 명시적 규칙을 쓰는 prod에서만 실패한다는 거예요.

**v2 라우트 추가 체크리스트:** 백엔드에 v2 컨트롤러를 추가할 때, 항상 `waf/prod_waf.tf`에 WAF allowlist 항목도 같이 추가하세요. Dev WAF는 `/v2/*`를 자동 허용하기 때문에 개발 환경에서는 잡히지 않아요.

## 핵심 교훈

1. **기본적으로 allowlist** - 알 수 없는 라우트를 자동 차단해요
2. **API에는 STARTS_WITH** - 대부분의 라우트에 쿼리 파라미터나 하위 경로가 있어요
3. **WebSocket을 잊지 마세요** - Socket.IO는 명시적 allowlist가 필요해요
4. **Dev/Prod가 달라도 괜찮아요** - 비용(dev) vs 명확성(prod) 최적화
5. **배포 후 검증** - AWS CLI로 규칙이 활성화되었는지 확인하세요
6. **버전 라우트는 별도 항목이 필요해요** - `STARTS_WITH "/spaces"`는 `/v2/spaces`를 매칭하지 않아요. 각 버전 접두사마다 자체 allowlist statement가 필요해요
7. **상태 코드로 거부 계층을 구분해요** - 커스텀 본문과 함께 오는 403은 allowlist 누락, 429는 WAF rate limiting, 504는 요청이 WAF를 통과한 뒤 백엔드가 타임아웃된 거예요. 규칙이 아니라 핸들러를 디버깅하세요
8. **terminating `allow {}`는 이후 규칙을 건너뛰어요** - allowlist 규칙이 매칭되면 관리형 규칙 그룹과 rate limiting이 그 요청에는 실행되지 않으니, 권한 있는 내부 엔드포인트는 자체 보호가 필요해요
