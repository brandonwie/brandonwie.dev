---
title: AWS WAF 구현
description: Allowlist 방식의 Web Application Firewall 설정 가이드.
date: 2026-01-23T00:00:00.000Z
updated: '2026-03-22'
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
translation_date: '2026-05-10'
references:
  - url: 'https://docs.aws.amazon.com/waf/latest/developerguide/getting-started.html'
    title: Get started with AWS WAF
    type: official
---

스캐너가 우리 API에 WordPress admin 패널, `.env` 파일, Spring Boot actuator 엔드포인트를
계속 찔러보고 있었어요. 백엔드에는 그런 게 하나도 없었죠. 요청 자체는 전부 404로
끝나서 위험하지는 않았지만, 로그에 잡음이 쌓이고 ALB 용량을 갉아먹고, 모니터링
대시보드에서 진짜 이슈를 찾기가 어려워졌어요. "정해진 엔드포인트가 아니면 앱에
닿기 전에 떨궈줘"라고 말할 방법이 필요했어요.

그게 AWS WAF의 allowlist 접근이에요. 가능한 공격 패턴을 전부 나열하는 blocklist
대신, 정상 경로만 정의하고 나머지는 다 막는 방식이죠. 이 글은 우리가 적용한
아키텍처, 규칙, 운영 절차를 정리한 메모예요.

## 아키텍처 개요

WAF 구성을 두 개로 나눠서 운영해요. production은 풀 보호, dev/local은 가벼운
공유 인스턴스로요.

| 환경       | 타입               | 기본 동작 | 비용    |
| ---------- | ------------------ | --------- | ------- |
| Production | Regional WAF       | BLOCK     | ~$23/월 |
| Dev/Local  | Regional WAF(공유) | BLOCK     | ~$7/월  |

여기서 가장 중요한 설계 결정은 기본 동작이에요. `BLOCK`으로 두면 룰이 명시적으로
허용한 요청만 통과해요. 대부분의 WAF 튜토리얼은 `ALLOW`를 기본값으로 두고 차단
규칙을 추가하는데, 그 반대 방향이에요. 라우트 구조가 잘 정의된 API라면 allowlist
방식이 더 안전해요. 모든 공격 패턴을 미리 예상할 필요 없이, 모르는 경로는 그냥
막으니까요.

비용 차이는 룰 개수에서 나와요. Production은 룰 10개(allowlist + managed rules
+ rate limiting), dev는 2개(넓은 allowlist와 rate limiting)예요. 룰당 월 $1
정도에 평가된 요청 100만 건당 $0.60이라, WAF는 보안 투자치곤 가성비가 좋은
편이에요.

## Production WAF 룰

룰은 priority로 정리해요. 숫자가 작을수록 먼저 평가되니까, allowlist 룰이
managed 보안 룰보다 먼저 돌아요. 이 순서가 중요해요. 요청은 먼저 알려진 경로에
매치된 다음, AWS managed rule set을 통과해야 해요.

### Allowlist 룰(Priority 1-3)

API가 정상적으로 서비스하는 모든 엔드포인트를 여기 적어둬요. 이 목록에 없으면
기본 `BLOCK`으로 빠져요.

**인증:**

- `/auth`, `/v1/auth`
- `/google`(OAuth)

**Core API:**

- `/blocks`, `/calendars`, `/spaces`
- `/users`, `/contacts`

**통합:**

- `/v1/integrations`
- `/subscriptions`
- `/webhooks`(결제)

**유틸리티:**

- `/health`(ALB health check)
- `/internals`

각 allowlist 룰은 URI path 위에서 string-match 조건을 써요. 하나의 거대한 룰로
묶지 않고 셋(auth, core, integrations)으로 쪼갠 이유는 두 가지예요. WAF가 룰
하나당 조건 10개로 제한되고, 룰을 분리해두면 어떤 트래픽 카테고리가 통과되는지
CloudWatch 메트릭에서 바로 보여요.

### AWS Managed Rules(Priority 10-11)

allowlist를 통과한 요청은 AWS managed rule set 두 개를 더 거쳐요.

- **Core Rule Set(CRS):** OWASP Top 10 보호를 다루는 700개 이상의 룰이에요.
  SQL injection, XSS, 일반적인 웹 공격을 잡아줘요.
- **Known Bad Inputs:** 200개 이상의 알려진 악성 페이로드 패턴이에요. Log4j
  exploit, 봇 시그니처, 흔한 취약점 스캐너 같은 것들이 들어 있어요.

이 룰들은 AWS가 관리하면서 자동으로 업데이트해요. 비용은 룰 그룹 단위로 내고,
안에 든 개별 룰 단위로 내지는 않아요. 트레이드오프는 명확해요. 직접 룰을 짜지
않아도 폭넓은 보호를 받지만, 각 sub-rule이 정확히 뭘 하는지는 보이지 않고,
false positive가 나면 특정 룰 ID를 override해야 해요.

### Rate Limiting

Rate limiting은 룰 체인 끝에 안전망으로 붙여요. brute-force와 DoS 시도를
막아줘요.

- **Production:** IP당 5분 윈도우 내 500 요청
- **Dev:** IP당 5분 윈도우 내 1,000 요청

dev 한도가 더 높은 이유는 자동화된 테스트 스위트가 짧은 시간에 많은 요청을
쏘기 때문이에요. 500 요청 임계값에 걸려버리거든요. production 기준으로 5분에
500 요청이면 일반 API 사용에는 넉넉한 편이에요. 이걸 넘기는 단일 IP는 잘못
설정된 클라이언트거나 공격이라고 봐요.

## 모니터링

WAF 로그는 CloudWatch로 흘러가요. 거기서 실시간으로 tail하거나 특정 패턴으로
필터링할 수 있어요. 자주 쓰는 명령어 모음이에요.

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

활동 요약은 매일 한 번씩 보는 거예요. 최근 1시간 동안의 ALLOW와 BLOCK 카운트가
한눈에 보여요. BLOCK이 갑자기 튀면 보통 스캐너가 엔드포인트를 찾았다는 신호고,
사용자 활동 없이 ALLOW만 튀면 API 키가 새서 자동 요청이 도는 상황일 수
있어요.

## 유지보수 절차

### 차단 IP 추가

같은 IP에서 차단이 반복되거나 managed rule을 어떻게든 통과한 IP가 보이면,
`waf.tf`의 IP block list에 추가해요.

```hcl
# waf.tf에서
addresses = [
  "192.0.2.1/32",    # 악성 IP
  "203.0.113.0/24",  # 악성 범위
]
```

그다음 `terraform apply`. IP set 업데이트는 WAF가 보호하는 모든 엔드포인트에
초 단위로 적용돼요.

### 새 라우트 추가

백엔드 팀이 새 API 엔드포인트를 배포하면, `waf.tf`의 allowlist 룰에도 추가해야
해요. 이 단계를 빠뜨리면 앱은 정상 배포돼도 새 엔드포인트가 403 Forbidden을
뱉어요. allowlist 방식의 운영 비용이 바로 이 부분이에요. 모든 새 라우트가 WAF
업데이트를 동반해야 하거든요. 실무에서는 API 라우트를 추가하는 PR에 WAF 룰
변경을 같이 묶어서 함께 배포해요.

## Rollback

WAF가 문제를 일으키면(false positive로 정상 사용자가 막히거나, WAF 간섭 없이
연결 문제를 디버깅해야 할 때) 두 가지 옵션이 있어요.

```bash
# WAF 비활성화(설정은 유지)
terraform destroy -target=aws_wafv2_web_acl_association.alb_waf

# 완전 제거
terraform destroy -target=module.waf
```

긴급 상황에서는 첫 번째 명령을 써요. WAF와 ALB 간 연결만 끊어서 트래픽이
필터링 없이 앱으로 바로 흘러가요. 룰, IP set, 로깅 설정은 그대로 남아 있어요.
다시 켜고 싶으면 `terraform apply` 한 번이면 끝이에요.

두 번째 명령은 전부 다 부숴요. WAF를 완전히 폐기하거나 처음부터 다시 짜야 할
때만 써요.

## Dev vs Production

| 항목            | Production | Dev  |
| --------------- | ---------- | ---- |
| 룰              | 10         | 2    |
| Managed rules   | 있음       | 없음 |
| 로깅            | CloudWatch | 없음 |
| `/api`(Swagger) | 차단       | 허용 |

가장 눈에 띄는 차이는 dev가 `/api` Swagger 문서 경로를 허용한다는 점이에요.
개발자가 개발 중에 API 문서를 그냥 브라우저로 열어볼 수 있어야 하니까요.
production에서는 차단해요. 공개된 API 문서는 공격자에게 엔드포인트 구조를
그대로 노출하는 거니까요. production 서비스의 API 문서를 봐야 하면 dev 환경이나
소스 코드를 직접 확인해요.

## 정리

allowlist 방식은 일반적인 WAF 사고 모델을 뒤집어요. "뭘 막을까?" 대신 "뭘
허용할까?"로 묻는 거예요. 초기 작업은 더 많아요. 정상 경로를 모두 나열해야
하니까요. 대신 기본 보안이 더 단단해져요. 모든 공격 벡터를 예측할 필요 없이,
모르는 경로는 자동으로 막혀요.

운영 비용은 규율이에요. 새 API 라우트마다 WAF 룰을 같이 업데이트해야 하니까요.
이걸 배포 체크리스트에 박아두면, allowlist 방식은 월 $25 미만으로 production
수준의 보호 계층을 안정적으로 깔아줘요.

## References

- [Get started with AWS WAF](https://docs.aws.amazon.com/waf/latest/developerguide/getting-started.html)
