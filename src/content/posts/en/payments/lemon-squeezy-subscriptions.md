---
title: Lemon Squeezy Subscription Management
description: 'Subscription lifecycle, cancellation, expiration, and reactivation.'
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - backend
  - payments
  - subscriptions
  - work
category: payments
draft: false
lang: en
references:
  - url: >-
      https://docs.lemonsqueezy.com/guides/developer-guide/managing-subscriptions
    title: Subscription Management — Lemon Squeezy
    type: official
---

## Subscription Status Types

| Status      | Description                              |
| ----------- | ---------------------------------------- |
| `on_trial`  | In free trial period                     |
| `active`    | Active and billing normally              |
| `paused`    | Payment collection paused                |
| `past_due`  | Renewal failed, 4 retries over 2 weeks   |
| `unpaid`    | All retries failed, dunning rules apply  |
| `cancelled` | Cancelled but in grace period            |
| `expired`   | Subscription ended completely            |

## Grace Period Behavior

When cancelled:

1. Status → `cancelled`
2. `cancelled` attribute → `true`
3. `ends_at` populated with expiration date
4. Customer retains access until `ends_at`
5. **During grace period**: Subscription CAN be resumed
6. **After grace period**: Status → `expired`, NOT resumable

## Resuming Cancelled Subscriptions

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

Result: Same subscription reactivated, original payment schedule continues.

## Expired Subscriptions - Critical

> **Important**: Once `expired`, subscription is **no longer resumable** through API.

After expiration:

1. Cannot resume via API
2. Must create new subscription (new checkout)
3. New subscription = different IDs (subscription, order, order_item)
4. Fresh billing cycle starts

## Pause vs Cancel vs Expire

| Action | Resumable                | Status                    |
| ------ | ------------------------ | ------------------------- |
| Pause  | Yes, anytime             | `paused`                  |
| Cancel | Yes, during grace period | `cancelled` → `expired`   |
| Expire | **No**                   | `expired`                 |

### Pause Modes

- `void`: No service during pause
- `free`: Service provided for free

## Webhook Events

Monitor these events:

- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_resumed`
- `subscription_expired`

## Database Design

```typescript
// Customer can have multiple subscriptions over time
Customer 1:n Subscription

Subscription {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  cancelled: boolean;
  endsAt: Date | null;
}
```

## Best Practices

1. Check `ends_at` for cancelled subscriptions
2. Verify status before allowing service access
3. Implement clear resubscription flow
4. Keep expired subscription data for history
