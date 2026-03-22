---
title: Lemon Squeezy Subscription Management
description: 'Subscription lifecycle, cancellation, expiration, and reactivation.'
date: 2026-01-23T00:00:00.000Z
updated: '2026-03-22'
tags:
  - backend
  - payments
  - subscriptions
  - work
category: payments
draft: false
lang: en
expanded: true
references:
  - url: >-
      https://docs.lemonsqueezy.com/guides/developer-guide/managing-subscriptions
    title: Subscription Management — Lemon Squeezy
    type: official
source_content_hash: a03d4b527e84f6bd9192ccec061d44ea854d3de02efc44e3bd1835d7e16a4f90
---

I was building a SaaS product with Lemon Squeezy handling payments, and a user cancelled their subscription. No big deal -- I had a "Cancel" button wired up. But then they changed their mind two weeks later and wanted back in. I clicked around the API docs, tried to resume the subscription, and hit a wall: **the subscription had expired, and Lemon Squeezy would not let me reactivate it.**

That one moment taught me that subscription management is not about the happy path. It is about understanding the full lifecycle -- every status transition, every grace period edge case, and exactly when a subscription crosses the point of no return.

---

## The Subscription Lifecycle

Lemon Squeezy subscriptions move through seven distinct statuses. Each one determines what your users can access and what actions your backend can take.

| Status      | Description                             |
| ----------- | --------------------------------------- |
| `on_trial`  | In free trial period                    |
| `active`    | Active and billing normally             |
| `paused`    | Payment collection paused               |
| `past_due`  | Renewal failed, 4 retries over 2 weeks  |
| `unpaid`    | All retries failed, dunning rules apply |
| `cancelled` | Cancelled but in grace period           |
| `expired`   | Subscription ended completely           |

The first three statuses are straightforward. The interesting -- and dangerous -- territory starts at `past_due`. When a renewal charge fails, Lemon Squeezy retries four times over two weeks. If all retries fail, the subscription moves to `unpaid`, and your dunning rules determine what happens next.

But the status transition that bit me hardest was `cancelled` to `expired`. There is a narrow window between those two, and if you miss it, your user has to start from scratch.

---

## Grace Period Behavior: The Window You Cannot Afford to Ignore

When a user cancels, the subscription does not end immediately. Here is the exact sequence:

1. Status changes to `cancelled`
2. The `cancelled` attribute flips to `true`
3. `ends_at` populates with the expiration date (typically the end of the current billing period)
4. The customer retains full access until `ends_at`
5. **During the grace period**: The subscription CAN be resumed via API
6. **After the grace period**: Status transitions to `expired` -- and it is NOT resumable

That grace period is your safety net. As long as the subscription is `cancelled` but not yet `expired`, you can bring it back to life with a single API call.

---

## Resuming a Cancelled Subscription

The API call to resume is a PATCH request that sets `cancelled` back to `false`:

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

The result is clean: the same subscription reactivates, the original payment schedule continues, and all the existing IDs (subscription, order, order_item) stay intact. No new checkout required, no disruption to your database relationships.

This is the ideal reactivation path, and it is only available during the grace period.

---

## After Expiration: The Point of No Return

This is the part I learned the hard way.

> **Once a subscription reaches `expired` status, it is no longer resumable through the API.**

After expiration, your options narrow dramatically:

1. You cannot resume the subscription via API -- the endpoint will reject the request
2. The user must go through a new checkout flow
3. A new checkout creates a completely new subscription with different IDs (subscription, order, order_item)
4. A fresh billing cycle starts from the new subscription date

This means your database now has two subscription records for the same customer. Your access-control logic needs to handle the old expired record gracefully while recognizing the new active one. If you are tracking subscription history for analytics or compliance, you need to link these records yourself -- Lemon Squeezy does not do it for you.

---

## Pause vs Cancel vs Expire: Know the Differences

These three actions look similar from a UI perspective, but they have very different implications for your backend:

| Action | Resumable                | Status                  |
| ------ | ------------------------ | ----------------------- |
| Pause  | Yes, anytime             | `paused`                |
| Cancel | Yes, during grace period | `cancelled` → `expired` |
| Expire | **No**                   | `expired`               |

**Pausing** is the safest option when a user wants to take a break. The subscription stays in a `paused` state indefinitely and can be resumed at any time. Lemon Squeezy offers two pause modes:

- `void`: No service during the pause (user loses access)
- `free`: Service continues for free (user keeps access, you stop billing)

**Cancelling** starts a countdown. The user keeps access through the grace period, but once `ends_at` passes, the subscription expires and cannot be brought back.

If your product has a "take a break" feature, use pause. If the user genuinely wants to leave, use cancel -- but make sure your resubscription flow is ready for the expired case.

---

## Webhook Events to Monitor

Lemon Squeezy communicates subscription changes through webhooks. These five events cover the full lifecycle:

- `subscription_created` -- New subscription started
- `subscription_updated` -- Status or attributes changed (covers pause, resume, plan changes)
- `subscription_cancelled` -- User or system cancelled the subscription
- `subscription_resumed` -- Cancelled subscription was reactivated during grace period
- `subscription_expired` -- Grace period ended, subscription is now permanently inactive

Your webhook handler should update your local database on every event. Do not rely on polling the API -- webhooks are the source of truth for real-time status changes.

---

## Database Design

A customer can have multiple subscriptions over time (especially after expirations that require new checkouts). Your schema should reflect this one-to-many relationship:

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

The `endsAt` field is particularly important. When `status` is `cancelled`, `endsAt` tells you exactly when to stop granting access. Your access-control middleware should check both fields: a `cancelled` subscription with a future `endsAt` still grants access.

---

## Practical Takeaways

Four rules that would have saved me hours of debugging:

1. **Always check `ends_at` for cancelled subscriptions.** A cancelled subscription is not the same as an expired one. The user may still have legitimate access.

2. **Verify status before allowing service access.** Do not treat any non-`active` status as "no access." `on_trial`, `cancelled` (during grace), and `paused` (in `free` mode) all grant access depending on your business rules.

3. **Build a resubscription flow from day one.** Expired subscriptions require a full new checkout. If you wait until a user asks "why can't I reactivate?" to build this, you are too late.

4. **Keep expired subscription data.** Do not delete or archive expired records aggressively. You need them for billing history, analytics, and to understand why a customer who "was subscribed" no longer has access.

The subscription lifecycle in Lemon Squeezy is well-designed, but it is unforgiving once you cross the expiration boundary. Understanding the grace period window -- and building your UX around it -- is the difference between a smooth reactivation and a frustrated user going through checkout again.
