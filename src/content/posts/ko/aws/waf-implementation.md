---
title: AWS WAF 구현
description: Allowlist 방식의 Web Application Firewall 설정 가이드.
date: 2026-01-23T00:00:00.000Z
updated: '2026-08-02'
tags:
  - aws
  - security
  - waf
category: aws
draft: false
lang: ko
source_lang: en
source_slug: waf-implementation
source_updated: '2026-08-02'
translation_date: '2026-05-10'
references:
  - url: 'https://docs.aws.amazon.com/waf/latest/developerguide/getting-started.html'
    title: Get started with AWS WAF
    type: official
  - url: 'https://aws.amazon.com/waf/pricing/'
    title: AWS WAF Pricing
    type: official
  - url: 'https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html'
    title: AWS WAF baseline managed rule groups
    type: official
  - url: 'https://docs.aws.amazon.com/waf/latest/developerguide/limits.html'
    title: AWS WAF quotas
    type: official
  - url: 'https://docs.aws.amazon.com/waf/latest/developerguide/classic-limits.html'
    title: AWS WAF Classic quotas
    type: official
---

ALB 뒤에 있던 공개 API에 스캐너가 WordPress admin 패널, `.env` 파일, Spring Boot
actuator 엔드포인트를 계속 찔러보고 있었어요. 그 서비스에는 그런 게 하나도
없었죠. 요청 자체는 전부 404로 끝나서 위험하지는 않았지만, 로그에 잡음이 쌓이고
ALB 용량을 갉아먹고, 모니터링 대시보드에서 진짜 이슈를 찾기가 어려워졌어요.
"정해진 엔드포인트가 아니면 앱에 닿기 전에 떨궈줘"라고 말할 방법이 필요했어요.

그게 AWS WAF의 allowlist 접근이에요. 가능한 공격 패턴을 전부 나열하는 blocklist
대신, 정상 경로만 정의하고 나머지는 다 막는 방식이죠. 이 글은 이 방식에 필요한
아키텍처, 룰, 운영 절차를 정리한 메모예요.

## 아키텍처 개요

Regional web ACL을 두 개로 쪼개는 게 실용적이에요. production은 풀 보호,
dev/local은 둘이 같이 쓰는 가벼운 쪽으로요. 아래는 그렇게 굴려본 구성의 대략적인
수치예요.

| 환경       | 타입               | 기본 동작 | 비용    |
| ---------- | ------------------ | --------- | ------- |
| Production | Regional WAF       | BLOCK     | ~$23/월 |
| Dev/Local  | Regional WAF(공유) | BLOCK     | ~$7/월  |

여기서 가장 중요한 설계 결정은 기본 동작이에요. `BLOCK`으로 두면 룰이 명시적으로
허용한 요청만 통과해요. 대부분의 WAF 튜토리얼은 `ALLOW`를 기본값으로 두고 차단
규칙을 추가하는데, 그 반대 방향이에요. 라우트 구조가 잘 정의된 API라면 allowlist
방식이 잘 맞아요. 모든 공격 패턴을 미리 예상할 필요 없이, 모르는 경로는 그냥
막으니까요.

비용 차이는 룰 개수에서 나와요. 표의 production ACL은 룰 10개(allowlist +
managed rule group + rate limiting), dev는 2개(넓은 allowlist와 rate limiting)예요.
AWS WAF는 web ACL 하나당 월 $5, 룰 하나당 월 $1, 평가된 요청 100만 건당 $0.60을
받아요. managed rule group은 안에 룰이 몇 개가 들었든 $1짜리 룰 하나로 계산돼서,
관리형 세트를 켜는 부담이 적어요. 그래서 위의 ~$23은 고정비 $15에 요청량이
붙은 값이에요. 리전에 따라 가격이 달라지니 예산 잡기 전에
[pricing 페이지](https://aws.amazon.com/waf/pricing/)를 직접 확인하세요.
여기 숫자는 2026년 8월에 읽은 기준이에요.

## Production WAF 룰

룰은 priority로 정리해요. 숫자가 작을수록 먼저 평가되니까, allowlist 룰이
managed 보안 룰보다 먼저 돌아요. 이 순서가 중요해요. 요청은 먼저 알려진 경로에
매치된 다음, AWS managed rule set을 통과해야 해요.

### Allowlist 룰(Priority 1-3)

API가 정상적으로 서비스하는 모든 엔드포인트를 여기 적어둬요. 이 목록에 없으면
기본 `BLOCK`으로 빠져요.

아래 라우트는 지어낸 거예요. 실제 allowlist는 그 제품의 표면을 그대로 그린
지도라서, 라우트 구조를 숨기자는 글에 진짜 목록을 박아두면 앞뒤가 안 맞으니까요.
가져갈 건 그룹을 나누는 방식이에요.

**인증:**

- `/auth`, `/v1/auth`
- `/oauth/callback`

**핵심 리소스:**

- `/orders`, `/customers`, `/products`

**통합:**

- `/v1/integrations`
- `/webhooks`

**유틸리티:**

- `/health`(ALB health check)
- `/metrics`

각 allowlist 룰은 URI path를 기준으로 매치해요. 경로마다 byte-match statement를
하나씩 두거나, 접두어를 공유하면 regex pattern set을 써요. 하나의 거대한 룰로
묶지 않고 그룹별로 셋으로 쪼개면 두 가지를 얻어요. CloudWatch가 룰 단위로
메트릭을 뿌려주니까 어떤 카테고리 트래픽이 통과되는지 한눈에 보이고, 룰 하나가
diff에서 읽을 만한 크기로 남아요.

여기서 한 가지는 정확히 짚고 갈게요. 인터넷에 도는 옛날 숫자 때문에요. AWS WAF
Classic에는 [룰 하나당 조건 10개](https://docs.aws.amazon.com/waf/latest/developerguide/classic-limits.html)
제한이 있었어요. 지금의 AWS WAF(wafv2)에는 그런 쿼터가 없어요. 이 글을 쓰는
시점의 [쿼터 문서](https://docs.aws.amazon.com/waf/latest/developerguide/limits.html)
기준으로, web ACL은 capacity unit으로 제한돼요(최대 5,000 WCU, 1,500 WCU를
넘으면 추가 비용). 대신 regex pattern set 하나당 고유 패턴 10개, string-match
statement 하나당 200자라는 별도 상한이 있어요. wafv2를 쓴다면 조건 개수가 아니라
WCU와 regex set 항목 수를 계산하세요.

### AWS Managed Rules(Priority 10-11)

allowlist를 통과한 요청은 AWS managed rule set 두 개를 더 거쳐요.

- **Core Rule Set(`AWSManagedRulesCommonRuleSet`):** OWASP Top 10에 나오는
  취약점 유형을 다뤄요. XSS, local/remote file inclusion, EC2 metadata SSRF,
  크기 제한, bad-bot user agent 같은 것들이요.
- **Known Bad Inputs(`AWSManagedRulesKnownBadInputsRuleSet`):** 알려진 특정
  exploit에 묶인 요청 패턴이에요. Log4j(CVE-2021-44228 계열), Java
  deserialization RCE, `PROPFIND`, exploitable path 같은 것들이요.

제 노트에는 이 둘이 "룰 700개 이상", "패턴 200개 이상"으로 적혀 있었는데, 틀린
기록이었어요. 700과 200은 두 rule group의 **WCU 용량**이지 룰 개수가 아니에요.
2026년 8월에 [baseline rule group 문서](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html)를
다시 보니 Core Rule Set에 이름 붙은 룰이 스무 개 남짓, Known Bad Inputs가 열
개 남짓이더라고요. WCU는 web ACL 한도에 맞춰 계산할 숫자고, 룰 개수는
CloudWatch 라벨에 찍히는 숫자예요. 헷갈리기 쉬운데, ACL 크기를 잡기 전에
구분해두면 좋아요.

이 rule group들은 AWS가 관리하면서 자동으로 업데이트하고, 안에 룰이 몇 개든
비용은 룰 하나로 계산돼요. 트레이드오프는 명확해요. 직접 룰을 짜지 않아도
폭넓은 보호를 받지만, 각 sub-rule이 정확히 뭘 보는지는 알 수 없고(AWS가 쓸 수
있을 만큼만 공개해요), false positive가 나면 해당 룰 이름을 Count로 override해야
해요.

### Rate Limiting

Rate limiting은 룰 체인 끝에 안전망으로 붙여요. brute-force와 DoS 시도를
막아줘요.

- **Production:** IP당 5분 윈도우 내 500 요청
- **Dev:** IP당 5분 윈도우 내 1,000 요청

이건 트래픽이 많지 않은 API에서 잘 맞았던 값이고, 실제 임계값은 각자 트래픽
모양에 달렸어요. dev 한도가 더 높은 이유는 자동화된 테스트 스위트가 짧은 시간에
많은 요청을 쏘기 때문이에요. 500 요청 임계값에 걸려버리거든요. production 기준
5분에 500 요청이면 사용자 한 명의 API 사용에는 넉넉한 편이에요. 이걸 넘기는 단일
IP는 보통 잘못 설정된 클라이언트거나 공격이에요. 반대로 너무 낮게 잡으면 본인이
돌린 부하 테스트에 본인이 알림을 받게 돼요.

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

활동 요약은 매일 한 번씩 볼 만한 거예요. 최근 1시간 동안의 ALLOW와 BLOCK
카운트가 한눈에 보여요. BLOCK이 갑자기 튀면 보통 스캐너가 엔드포인트를 찾았다는
신호고, 사용자 활동 없이 ALLOW만 튀면 API 키가 새서 자동 요청이 도는 상황일 수
있어요.

## 유지보수 절차

### 차단 IP 추가

같은 IP에서 차단이 반복되거나 managed rule을 어떻게든 통과한 IP가 보이면,
WAF Terraform 설정의 IP set에 추가해요.

```hcl
# aws_wafv2_ip_set
addresses = [
  "192.0.2.1/32",    # 악성 IP
  "203.0.113.0/24",  # 악성 범위
]
```

그다음 `terraform apply`. IP set 업데이트는 WAF가 보호하는 모든 엔드포인트에
초 단위로 적용돼요.

### 새 라우트 추가

새 API 엔드포인트가 나가면 WAF Terraform 설정의 allowlist 룰에도 추가해야 해요.
이 단계를 빠뜨리면 앱은 정상 배포되고 헬스 체크도 다 초록불인데 새 엔드포인트만
403 Forbidden을 뱉어요. 모든 신호가 "서비스 멀쩡함"이라고 말하니 헷갈리는
실패예요. allowlist 방식의 진짜 운영 비용이 바로 이 부분이에요. 모든 새 라우트가
WAF 업데이트를 동반하거든요. 이걸 버틸 만하게 만드는 방법은 라우트를 추가하는
PR에 WAF 룰 변경을 같이 넣는 거예요. 둘이 함께 나가니 어느 쪽도 잊히지 않아요.

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
개발자가 API를 붙이면서 문서를 그냥 브라우저로 열어볼 수 있어야 하니까요.
production에서는 차단해요. 공개된 API 문서는 공격자에게 엔드포인트 구조를 그대로
넘겨주는 셈이고, 그게 바로 allowlist가 숨기려던 거니까요. production에서 `/api`를
막는다는 건 문서를 dev 환경에서만 볼 수 있다는 뜻이에요. 라우트 구조를 공개로
광고하지 않는 대가로 받아들이는 트레이드오프고, dev 환경이 실제로 동기화된
상태로 유지될 때만 감당할 만해요.

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
- [AWS WAF Pricing](https://aws.amazon.com/waf/pricing/)
- [AWS WAF baseline managed rule groups](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html)
- [AWS WAF quotas](https://docs.aws.amazon.com/waf/latest/developerguide/limits.html)
- [AWS WAF Classic quotas](https://docs.aws.amazon.com/waf/latest/developerguide/classic-limits.html)
