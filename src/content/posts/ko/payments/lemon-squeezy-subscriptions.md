---
title: Lemon Squeezy 구독 lifecycle 관리
description: >-
  구독 취소, 유예 기간, 만료, 재활성화와 기존 구독의 가격 변경을 구현하며
  확인한 lifecycle 경계예요.
date: 2026-01-23T00:00:00.000Z
updated: 2026-07-23
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
source_updated: 2026-07-23
translation_date: 2026-07-23
references:
  - url: >-
      https://docs.lemonsqueezy.com/guides/developer-guide/managing-subscriptions
    title: Lemon Squeezy subscription management
    type: official
  - url: https://docs.lemonsqueezy.com/help/products/subscriptions
    title: Subscription 가격 변경 도움말
    type: official
  - url: https://docs.lemonsqueezy.com/api/subscriptions/update-subscription
    title: Subscription update API
    type: official
---

Lemon Squeezy로 결제를 붙인 SaaS에서 한 사용자가 구독을 취소했어요. 2주 뒤
마음을 바꿔 다시 쓰고 싶다고 해서 API로 재개하려 했지만 이미 `expired` 상태였고
되살릴 수 없었어요.

이 실패를 계기로 상태 전환 전체를 다시 그렸어요. 취소 뒤 유예 기간과, 새
checkout이 필요해지는 정확한 경계를 알아야 했어요.

## 구독 lifecycle

Lemon Squeezy 구독에는 일곱 가지 상태가 있어요.

| 상태        | 설명                                |
| ----------- | ----------------------------------- |
| `on_trial`  | 무료 체험 기간                      |
| `active`    | 활성 상태, 정상 결제 중             |
| `paused`    | 결제 수집 일시 중지                 |
| `past_due`  | 갱신 실패, 2주에 걸쳐 4회 재시도    |
| `unpaid`    | 모든 재시도 실패, dunning 규칙 적용 |
| `cancelled` | 취소했지만 유예 기간 중             |
| `expired`   | 구독이 완전히 끝남                  |

위험한 구간은 `past_due`부터 시작해요. 갱신 결제가 실패하면 Lemon Squeezy가
2주 동안 네 번 재시도해요. 모두 실패하면 `unpaid`로 이동하고, 다음 동작은
설정한 dunning 규칙이 결정해요.

구현에서 더 중요했던 경계는 `cancelled`에서 `expired`로 넘어가는 순간이었어요.
그 사이에는 구독을 재개할 수 있지만, 지나고 나면 새 구독을 만들어야 해요.

## 유예 기간에는 무엇이 일어날까

사용자가 구독을 취소하면 바로 끝나지 않아요.

1. 상태가 `cancelled`로 바뀌어요.
2. `cancelled` 속성이 `true`가 돼요.
3. `ends_at`에 만료일이 들어가요.
4. 사용자는 `ends_at`까지 계속 이용할 수 있어요.
5. 유예 기간에는 API로 구독을 재개할 수 있어요.
6. 유예 기간이 끝나면 `expired`가 되고 재개할 수 없어요.

`cancelled`이지만 아직 `expired`가 아니라면 API 호출 한 번으로 같은 구독을
다시 활성화할 수 있어요.

## 취소된 구독 재개하기

`cancelled`를 다시 `false`로 바꾸는 PATCH 요청을 보내요.

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

같은 구독이 재활성화되고 원래 결제 일정도 이어져요. subscription, order,
order_item ID가 유지되므로 새 checkout이나 database relation 변경이 필요하지
않아요. 이 경로는 유예 기간에만 쓸 수 있어요.

## 만료 뒤에는 새 구독이 필요해요

> `expired`가 된 구독은 API로 재개할 수 없어요.

만료 뒤에는 다음 흐름으로 바뀌어요.

1. resume endpoint가 요청을 거절해요.
2. 사용자가 새 checkout을 거쳐야 해요.
3. subscription, order, order_item ID가 모두 새로 생겨요.
4. 새 구독일을 기준으로 결제 주기가 시작해요.

한 customer에 구독 record가 두 개 남기 때문에 access control은 오래된
`expired` record를 무시하고 새 `active` record를 인식해야 해요. 구독 이력을
추적한다면 두 record를 application에서 직접 연결해야 해요.

## pause, cancel, expire의 차이

| 동작   | 재개 가능        | 상태                    |
| ------ | ---------------- | ----------------------- |
| Pause  | 언제든 가능      | `paused`                |
| Cancel | 유예 기간에 가능 | `cancelled` → `expired` |
| Expire | 불가능           | `expired`               |

잠깐 쉬는 기능에는 pause가 맞아요. 구독은 `paused`로 남고 나중에 다시 시작할
수 있어요.

- `void`: pause 중에는 서비스를 제공하지 않아요.
- `free`: 결제만 멈추고 서비스는 무료로 이어가요.

cancel은 만료까지 countdown을 시작해요. 사용자는 `ends_at`까지 접근할 수 있지만
그 시각이 지나면 구독을 되살릴 수 없어요. 제품에 "잠시 쉬기"가 있다면 pause를,
정말 떠나는 흐름이라면 cancel과 만료 후 재구독을 함께 구현해요.

## 확인해야 할 webhook event

구독 상태는 다음 webhook으로 local database에 반영해요.

- `subscription_created`: 새 구독이 시작됐어요.
- `subscription_updated`: 상태나 속성이 바뀌었어요.
- `subscription_cancelled`: 사용자나 시스템이 구독을 취소했어요.
- `subscription_resumed`: 유예 기간에 취소를 되돌렸어요.
- `subscription_expired`: 유예 기간이 끝나 구독이 비활성화됐어요.

polling만 사용하면 provider와 제품 상태 사이에 지연이 생겨요. webhook을 받을
때마다 local record를 갱신하는 편이 안전해요.

## database 설계

한 customer는 시간이 지나며 여러 구독을 가질 수 있어요.

```typescript
Customer 1:n Subscription

Subscription {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  cancelled: boolean;
  endsAt: Date | null;
}
```

`endsAt`은 access 판단에 필요해요. 상태가 `cancelled`여도 미래의 `endsAt`이
있다면 아직 정상 접근 기간이에요.

## 기존 구독을 새 가격으로 옮기기

product나 variant 가격을 수정해도 이미 그 variant를 참조하는 구독은 자동으로
바뀌지 않아요. 기존 구독은 plan이 바뀔 때까지 생성 시점 가격을 유지해요.

안전한 이동 순서는 다음과 같아요.

1. 새 가격의 variant를 만들어요.
2. 이전 variant를 참조하는 구독을 조회해요.
3. 각 구독을 새 `variant_id`로 PATCH해요.
4. 의존하는 구독이 없어진 뒤에만 이전 variant를 unpublish해요.

proration도 명시적으로 골라야 해요. `disable_prorations: true`는 현재 결제일을
유지하고 다음 갱신부터 새 가격을 적용해요. `invoice_immediately: true`는 지금
prorated invoice를 만들어요.

```bash
PATCH /v1/subscriptions/{subscription_id}
{
  "data": {
    "type": "subscriptions",
    "id": "{subscription_id}",
    "attributes": {
      "variant_id": 123456,
      "disable_prorations": true
    }
  }
}
```

결제 주기 변경, 무료와 유료 variant 사이 이동, trial 시작과 종료는 결제 기준일을
바꿀 수 있어서 별도로 처리해야 해요. PayPal 구독은 이 API 경로로 바꿀 수 없고
customer portal에서 plan을 변경해야 해요.

같은 `variant_id`의 가격만 고친 뒤 PATCH하면 새 가격 snapshot을 얻는다고
가정하지 않았어요. 문서에 보장된 동작이 아니기 때문이에요. 새 variant를 만들면
이동 대상을 관찰할 수 있고 되돌리기도 쉬워요.

## 구현할 때 남긴 기준

1. 취소된 구독은 `ends_at`을 확인해요. `cancelled`와 `expired`는 달라요.
2. `active`가 아니라는 이유만으로 접근을 모두 막지 않아요. `on_trial`,
   유예 기간의 `cancelled`, `free` mode의 `paused`도 정책에 따라 접근할 수
   있어요.
3. 만료 뒤에는 새 checkout이 필요하므로 재구독 흐름을 미리 만들어요.
4. 만료 record는 billing history와 access 조사에 필요하니 보관해요.
5. 가격은 새 variant로 옮기고 proration과 PayPal 경로를 따로 다뤄요.

운영 경계는 만료 시점이에요. 그 전에는 같은 구독과 ID를 유지하며 재개할 수
있고, 그 뒤에는 새 checkout과 새 record 연결이 필요해요.
