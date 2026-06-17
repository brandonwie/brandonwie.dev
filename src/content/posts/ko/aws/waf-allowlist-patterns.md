---
title: WAF Allowlist 패턴
description: >-
  라우트 allowlist를 사용한 block-by-default WAF 접근 방식. 알 수 없는 라우트가 자동 차단되어 blocklist보다
  보안이 강해요.
date: 2026-01-26T00:00:00.000Z
updated: '2026-06-18'
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
source_updated: '2026-06-18'
translation_date: '2026-06-18'
references:
  - url: >-
      https://docs.aws.amazon.com/waf/latest/developerguide/waf-ip-set-managing.html
    title: Creating and managing an IP set in AWS WAF
    type: official
---

운영 중인 production API에 `/wp-admin`, `/phpmyadmin`, `/.env` 같은 경로로 요청이 수천 건씩 들어오고 있더라고요. 취약점을 노리고 스캔하는 봇들이 자기가 아는 흔한 exploit 경로를 죄다 두드려 보는 거였어요. 우리 API는 전부 404로 돌려보냈지만, 그래도 요청 하나하나가 compute 자원을 쓰고 로그를 어지럽혔고, 가끔은 정상 사용자한테까지 rate limiting을 걸리게 했어요.

해결책은 기본값을 뒤집는 거였어요. 전부 허용하고 알려진 나쁜 경로만 막는 대신, 전부 막고 우리 API가 실제로 제공하는 라우트만 허용하는 거죠. 이게 WAF 설정의 allowlist 방식인데, blocklist 방식보다 근본적으로 더 강력해요.

## Allowlist vs Blocklist

| 접근 방식 | 기본 동작 | 보안      | 유지보수            |
| --------- | --------- | --------- | ------------------- |
| Allowlist | 차단      | ✅ 강함   | 새 라우트 추가 필요 |
| Blocklist | 허용      | ❌ 약함   | 새 공격 차단 필요   |

blocklist를 쓰면 계속 수비만 하게 돼요. 새로운 공격 벡터가 나올 때마다 규칙을 하나씩 추가해야 하고, 하나라도 놓치면 그 요청이 애플리케이션까지 닿아요. 항상 한 발 늦는 셈이에요.

allowlist를 쓰면 알 수 없는 라우트는 기본적으로 차단돼요. `/wp-admin`을 스캔하던 봇은 애플리케이션에 닿기도 전에 403을 받아요. 그 공격을 미리 알 필요도 없어요. allowlist에 없는 경로는 전부 자동으로 거부되니까요.

**권장하는 방식은요**, 알려진 안정적인 라우트를 가진 API라면 allowlist를 쓰는 거예요. API가 `/users`, `/calendars`, `/blocks`, `/socket.io`를 제공한다면, 애플리케이션에 닿아도 되는 경로는 딱 그것들뿐이에요. 나머지는 전부 잡음이죠.

대신 유지보수라는 트레이드오프가 있어요. 새 API 라우트를 추가할 때마다 WAF allowlist도 같이 갱신해야 해요. 깜빡하면 새 라우트가 프로덕션에서 403을 반환하죠. 배포 체크리스트에 꼭 넣어둬야 할 단계지만, 보안 이득이 운영 비용을 훨씬 웃돌아요.

## 구현 패턴

AWS WAF에서 allowlist를 구성하는 방법은 두 가지예요. 저는 환경에 따라 둘 다 써요.

### 패턴 1: Regex 통합(Dev/비용 최적화)

여러 경로를 단일 regex 규칙으로 한 번에 매칭해요.

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

allowlist 전체가 regex 패턴 하나 안에 들어가요. 규칙 하나, 패턴 세트 하나로 WAF 비용을 최소화해요.

**장점**: 규칙 수가 적으니 WAF 요금이 낮아져요. 규칙당 월 $1이니까, regex 규칙 하나로 끝내는 것과 명시적 규칙 10개를 두는 것 사이에는 월 $9가 차이 나요.

**단점**: 라우트를 추가할수록 regex 유지보수가 까다로워져요. 분기 20개짜리 복잡한 regex는 실수하기 쉽고, pull request에서 리뷰하기도 어려워요.

### 패턴 2: 명시적 규칙(Prod/명확성)

byte match statement를 써서 경로 카테고리마다 규칙을 따로 만들어요.

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

라우트 카테고리마다 이름이 붙은 규칙을 하나씩 가져요. API 라우트는 `or_statement` 하나로 묶고, WebSocket 라우트는 별도 규칙으로 빼요.

**장점**: 명확하고 유지보수하기 좋아요. 새 라우트를 추가하려면 알맞은 규칙에 byte match statement만 하나 넣으면 돼요. 리뷰하기 쉽고 디버깅도 편해요. 요청이 차단되면 WAF 로그가 어느 규칙이 그걸 평가했고 왜 막았는지 알려줘요.

**단점**: 규칙이 많아지니 WAF 비용이 올라가요. 규칙 하나당 월 $1이에요. 프로덕션이라면 그 명확성이 비용만큼의 값어치를 해요.

## 규칙 평가: terminating allow는 이후 규칙을 건너뛰어요

각 규칙의 `priority` 필드는 단순 장식이 아니에요. WAFv2는 priority 오름차순으로 규칙을 평가하는데, `allow {}` 액션은 terminating이에요. allowlist 규칙이 매칭되는 순간 WAF는 평가를 멈추고, 그 뒤에 있는 규칙(AWS 관리형 규칙 그룹, rate-based 규칙 등)은 그 요청에는 아예 실행되지 않아요.

여기엔 짚고 넘어갈 보안적 함의가 있어요. allowlist에 포함된 라우트는 관리형 보호를 완전히 우회한다는 점이에요. OWASP나 SQL 인젝션 관리형 규칙 그룹을 allow 규칙보다 낮은 priority(뒤쪽)에 붙이면, 이 규칙들은 allowlist를 통과하지 못한 트래픽만 보게 돼요. 정작 신뢰해서 허용한 라우트는 검사하지 않죠. 신뢰 라우트는 WAF가 단락(short-circuit)되니 지연이 낮지만, 그만큼 관리형 규칙 보호도 전혀 받지 못해요.

대부분의 공개 API 라우트라면 받아들일 만한 트레이드오프예요. 핸들러를 직접 통제하고, allowlist가 이미 나머지를 다 막았으니까요. 문제가 되는 건 `/internals/*` 같은 내부·권한 엔드포인트예요. 이런 경로를 allowlist에 넣으면 관리형 규칙과 rate limiting이 적용되지 않으니, 보호는 애플리케이션 계층이 직접 책임져야 해요. allow 항목을 추가하기 전에 위협 모델에서 한 번 따져볼 부분이에요.

## 경로 매칭 전략

WAF는 positional constraint 세 가지를 제공해요. 경로마다 알맞은 걸 고르면 false positive(정상 요청 차단)와 false negative(의도하지 않은 경로 허용)를 둘 다 막을 수 있어요.

### STARTS_WITH

```hcl
positional_constraint = "STARTS_WITH"
search_string         = "/socket.io"
```

매칭 대상: `/socket.io`, `/socket.io/`, `/socket.io?EIO=4`

대부분의 API 라우트에는 이게 맞아요. 실제 요청에는 쿼리 파라미터나 하위 경로, 끝의 슬래시가 붙거든요. `STARTS_WITH`는 변형을 일일이 나열하지 않아도 이걸 전부 받아줘요.

### EXACTLY

```hcl
positional_constraint = "EXACTLY"
search_string         = "/health"
```

매칭 대상: 오직 `/health`, 그 외엔 없음.

헬스 체크 엔드포인트처럼 하위 경로나 쿼리 파라미터가 절대 붙으면 안 되는 경로에 써요. 이 엄격함 덕분에 공격자가 `/health/../admin` 같은 경로를 덧붙이는 걸 막아줘요.

### CONTAINS

```hcl
positional_constraint = "CONTAINS"
search_string         = "/api/"
```

매칭 대상: `/api/`를 어디든 포함하는 모든 경로.

`/v1/api/users`나 `/v2/api/calendars` 같은 API 버전 패턴에 써요. 다만 `CONTAINS`는 조심해야 해요. 제약이 가장 느슨해서 의도보다 넓게 매칭될 수 있거든요.

## WebSocket/Socket.IO 경로

Socket.IO는 쿼리 파라미터가 붙은 여러 하위 경로를 쓰기 때문에 따로 신경 써야 해요.

```text
/socket.io/?EIO=4&transport=polling
/socket.io/?EIO=4&transport=websocket
```

처음 연결은 `/socket.io/?EIO=4&transport=polling`에서 HTTP long-polling으로 시작했다가, `/socket.io/?EIO=4&transport=websocket`에서 WebSocket으로 업그레이드돼요. Socket.IO가 동작하려면 두 경로 모두 허용해야 해요.

Socket.IO에는 항상 `STARTS_WITH`를 써요.

```hcl
byte_match_statement {
  search_string         = "/socket.io"
  positional_constraint = "STARTS_WITH"
}
```

`EXACTLY`를 쓰면 쿼리 파라미터 때문에 두 경로가 다 막혀요. regex로도 되긴 하지만 괜한 복잡함만 늘어요. `STARTS_WITH` 하나면 Socket.IO의 모든 하위 경로와 transport를 다 덮어요.

## 검증 명령어

WAF를 변경해 배포한 뒤에는 규칙이 활성화됐고 기대대로 동작하는지 확인해요.

### WAF 규칙 확인

```bash
aws wafv2 get-web-acl \
  --name app-prod-waf \
  --scope REGIONAL \
  --id <webacl-id> \
  --region ap-northeast-2 \
  --query 'WebACL.Rules[?Name==`AllowAPIRoutes`]'
```

규칙 정의를 돌려주니 byte match statement가 올바른지 확인할 수 있어요.

### 차단된 요청 확인

```bash
aws wafv2 get-sampled-requests \
  --web-acl-arn <webacl-arn> \
  --rule-metric-name BlockedRequests \
  --scope REGIONAL \
  --time-window StartTime=2024-01-01T00:00:00Z,EndTime=2024-01-02T00:00:00Z \
  --max-items 100
```

배포 후에는 샘플링된 차단 요청을 살펴서 정상 트래픽을 실수로 막고 있지 않은지 확인해요. 허용돼야 할 경로에 403이 떴다면, allowlist 항목이 빠졌다는 신호예요.

저는 WAF를 배포하고 나면 첫 한 시간 안에 샘플 요청을 확인하는 걸 습관으로 삼고 있어요. 빠진 allowlist 항목을 첫 시간에 잡으면 금방 고치지만, 고객 지원 티켓으로 알게 되면 얘기가 다르거든요.

## 상태 코드 트리아지: 어느 계층이 요청을 거부했나요?

allowlist가 적용되면 요청은 세 계층을 거쳐요. WAF, 그다음 ALB, 마지막으로 백엔드(여기서는 ECS)예요. 에러가 났을 때 HTTP 상태 코드를 보면 어느 계층이 거부했는지 알 수 있어서, 엉뚱한 컴포넌트를 디버깅하는 일을 줄여줘요.

| 상태 코드         | 출처                | 의미                                                                       |
| ----------------- | ------------------- | -------------------------------------------------------------------------- |
| 403 (커스텀 본문) | WAF 기본 동작       | allowlist에 없는 경로, ALB에 닿기 전에 차단됨                              |
| 429               | WAF rate-based 규칙 | IP별 요청 한도 초과                                                        |
| 504               | ALB                 | WAF·ALB는 통과; **백엔드**가 `idle_timeout`(기본 60초) 안에 응답하지 못함  |
| 502 / 503         | ALB                 | 정상 타겟이 없거나 타겟이 에러를 반환함                                    |

헷갈리기 쉬운 건 504예요. 504는 절대 WAF 차단이 아니에요. 504가 보인다는 건 요청이 이미 allowlist를 통과해 백엔드까지 도달했다는 뜻이라, 문제는 WAF 규칙이 아니라 핸들러나 그 egress에 있어요. 반대로 커스텀 차단 본문과 함께 오는 403은 경로가 allowlist에서 빠졌다는 신호예요. 해당 `byte_match` 항목을 추가하면 되고, 버전 라우트라면 위에서 본 `/v2/` 접두사 함정을 기억해 두세요.

## 비용 최적화

WAF 요금은 예측 가능하지만 규칙이 많아지면 쌓여요.

| 항목            | 월 비용(약) |
| --------------- | ----------- |
| Web ACL         | $5          |
| 규칙(처음 10개) | 개당 $1     |
| 요청(백만 건당) | $0.60       |

**전략은요**, dev에서는 regex 통합으로 비용을 줄이고, prod에서는 명시적 규칙으로 명확성과 유지보수성을 챙기는 거예요. regex 규칙 2개(월 $7)와 명시적 규칙 10개(월 $15)의 차이는 작아서, 프로덕션 환경이라면 언제나 디버깅 편의를 우선해도 돼요.

트래픽이 많은 API라면 어떤 패턴을 고르든 요청당 비용(백만 건당 $0.60)이 지배적인 요인이에요. 월 1억 건이면 규칙 요금 $5~$15에 비해 요청 요금만 $60이 나와요. 규모가 커지면 규칙 수를 줄이는 것보다, 애초에 그 요청이 API에 닿아야 하는지를 따지는 게 더 중요해져요.

## 어려웠던 점

### 버전 경로 접두사 함정

예상 밖이었던 문제 하나: `STARTS_WITH "/spaces"`는 `/v2/spaces`를 매칭하지 않아요. URI 경로가 문자 그대로 `/v2/`로 시작하지 `/spaces`로 시작하지 않거든요. 돌이켜보면 당연한 건데, 새 버전 API 라우트를 추가할 때 기존 `/spaces` allowlist 항목이 모든 버전을 커버한다고 넘겨짚기 쉬워요.

API 버전 접두사마다 별도의 allowlist 항목이 필요해요.

```hcl
# 세 개의 별도 statement — 하나가 아님
statement { byte_match_statement { search_string = "/spaces"    ... } }
statement { byte_match_statement { search_string = "/v1/spaces" ... } }
statement { byte_match_statement { search_string = "/v2/spaces" ... } }
```

명시적 `/v2/spaces` 항목이 없으면 프로덕션에서 요청이 조용히 403을 반환해요. 까다로운 점은, dev 환경에서는 regex로 `/v2/*`를 포괄 허용하는 경우가 많다는 거예요. 그래서 dev에서는 완벽하게 돌아가고, 명시적 규칙을 쓰는 prod에서만 실패해요.

**v2 라우트 추가 체크리스트:** 백엔드에 v2 controller를 추가할 때는 항상 `waf/prod_waf.tf`에 대응하는 WAF allowlist 항목도 같이 넣어요. dev WAF는 `/v2/*`를 포괄 허용하니까 거기선 알아서 동작하는데, 바로 그래서 개발 단계에서는 이 문제가 안 잡혀요.

## Terraform Plan 읽기: 규칙 변경 시 Set-Diff

기존 규칙에 `byte_match` 구문을 하나만 추가하고 `terraform plan`을 처음 돌려보면 당황하게 돼요. 깔끔한 한 줄 추가로 표시되지 않거든요. AWS provider는 `rule`과 그 안의 `statement` 블록을 set으로 모델링해서, 규칙 전체가 `- rule { … } -> null` 다음에 `+ rule { … }`로 다시 렌더링돼요. 규칙을 지웠다가 다시 만드는 것처럼 보이죠.

하지만 삭제가 아니에요. set 요소를 교체하는 것뿐이에요. web ACL은 `~ update in-place` 상태를 유지하고, AWS는 `PutWebACL`로 전체 규칙 set을 원자적으로 적용해서 규칙이 빠지는 순간이 없어요.

중요한 건 plan 리뷰예요. `- rule` 줄을 삭제로 읽으면 안 돼요. 대신 새 set이 기존 set에 추가분만 더한 것과 같은지 확인하세요. 제거된 `search_string` 값과 추가된 값을 비교해서, 방금 추가한 경로 하나만 빼고 모두 일치하면 돼요.

```bash
grep -E "^[[:space:]]*- +search_string" plan.txt | sed -E 's/.*= "//;s/".*//' | sort | uniq -c
grep -E "^[[:space:]]*\+ +search_string" plan.txt | sed -E 's/.*= "//;s/".*//' | sort | uniq -c
# 추가한 경로만 빼고 개수가 동일
```

## 핵심 교훈

WAF allowlist 설정을 위한 여덟 가지 원칙이에요.

1. **기본은 차단으로.** 알 수 없는 라우트는 애플리케이션에 절대 닿으면 안 돼요. allowlist 방식이 이걸 자동으로 처리해요.
2. **API 라우트에는 STARTS_WITH.** 대부분의 라우트에는 쿼리 파라미터나 하위 경로가 붙어요. 일반적인 API 경로에 정확 매칭은 너무 빡빡해요.
3. **WebSocket을 잊지 마요.** Socket.IO는 쿼리 파라미터가 붙은 여러 하위 경로를 써요. `/socket.io`에 `STARTS_WITH` 규칙 하나면 다 덮어요.
4. **dev와 prod는 패턴이 달라도 돼요.** regex 통합은 dev에서 비용을 줄여주고, 명시적 규칙은 prod에서 디버깅 시간을 줄여줘요.
5. **배포할 때마다 검증해요.** AWS CLI로 규칙이 활성화됐는지 확인하고, 샘플 요청에서 false positive를 살펴봐요.
6. **버전 라우트는 별도 항목이 필요해요.** `STARTS_WITH "/spaces"`는 `/v2/spaces`를 매칭하지 않아요. 버전 접두사마다 자체 allowlist statement가 있어야 해요.
7. **상태 코드로 거부 계층을 구분해요.** 커스텀 본문과 함께 오는 403은 allowlist 누락, 429는 WAF rate limiting, 504는 요청이 WAF를 통과한 뒤 백엔드가 타임아웃된 거예요. 규칙이 아니라 핸들러를 디버깅해요.
8. **terminating `allow {}`는 이후 규칙을 건너뛰어요.** allowlist 규칙이 매칭되면 관리형 규칙 그룹과 rate limiting이 그 요청에는 실행되지 않으니, 권한 있는 내부 엔드포인트는 자체 보호를 갖춰야 해요.
