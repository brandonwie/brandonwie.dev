---
title: "Lemon Squeezy 구독 관리"
description: "구독 라이프사이클, 취소, 만료, 재활성화에 대한 정리예요."
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - backend
  - payments
  - subscriptions
  - work
category: payments
draft: false
lang: ko
source_lang: en
source_slug: lemon-squeezy-subscriptions
source_updated: "2026-01-23"
translation_date: "2026-03-04"
references:
  - url: >-
      https://docs.lemonsqueezy.com/guides/developer-guide/managing-subscriptions
    title: Subscription Management — Lemon Squeezy
    type: official
---

## 구독 상태 유형

| 상태        | 설명                                |
| ----------- | ----------------------------------- |
| `on_trial`  | 무료 체험 기간 중                   |
| `active`    | 활성, 정상 결제 중                  |
| `paused`    | 결제 수집 일시 중지됨               |
| `past_due`  | 갱신 실패, 2주에 걸쳐 4회 재시도    |
| `unpaid`    | 모든 재시도 실패, dunning 규칙 적용 |
| `cancelled` | 취소됐지만 유예 기간 중             |
| `expired`   | 구독 완전 종료                      |

## 유예 기간 동작

취소했을 때:

1. 상태 → `cancelled`
2. `cancelled` 속성 → `true`
3. `ends_at`에 만료 날짜가 채워짐
4. `ends_at`까지 서비스 이용 가능
5. **유예 기간 중**: 구독을 재개할 수 있어요
6. **유예 기간 후**: 상태 → `expired`, 재개 불가

## 취소된 구독 재개

```bash
PATCH /v1/subscriptions/{subscription_id}
{
  "data": {
    "type": "subscriptions",
    "id": "{subscription_id}",
    "attributes": {
      "cancelled": false
    }
  }
}
```

결과: 같은 구독이 재활성화되고 원래 결제 일정이 계속돼요.

## 만료된 구독 - 중요

> **중요**: `expired`가 되면 API를 통해 **구독을 재개할 수 없어요.**

만료 후:

1. API로 재개 불가
2. 새 구독을 만들어야 해요(새 checkout)
3. 새 구독 = 다른 ID들(subscription, order, order_item)
4. 새로운 결제 주기 시작

## Pause vs Cancel vs Expire

| 액션   | 재개 가능        | 상태                    |
| ------ | ---------------- | ----------------------- |
| Pause  | 네, 언제든       | `paused`                |
| Cancel | 네, 유예 기간 중 | `cancelled` → `expired` |
| Expire | **아니요**       | `expired`               |

### Pause 모드

- `void`: 일시 중지 중 서비스 없음
- `free`: 무료로 서비스 제공

## Webhook 이벤트

모니터링할 이벤트:

- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_resumed`
- `subscription_expired`

## 데이터베이스 설계

```typescript
// 고객은 시간이 지나면서 여러 구독을 가질 수 있음
Customer 1:n Subscription

Subscription {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  cancelled: boolean;
  endsAt: Date | null;
}
```

## 모범 사례

1. 취소된 구독은 `ends_at`을 확인하세요
2. 서비스 접근 허용 전에 상태를 검증하세요
3. 명확한 재구독 플로우를 구현하세요
4. 만료된 구독 데이터는 이력용으로 보관하세요
