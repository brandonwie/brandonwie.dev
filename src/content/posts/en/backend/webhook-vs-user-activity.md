---
title: Webhook vs User Activity
description: >-
  Webhooks from external services indicate **their** activity, not **your
  user's**
date: 2026-01-26T00:00:00.000Z
updated: 2026-02-13T00:00:00.000Z
tags:
  - backend
  - webhooks
  - architecture
  - patterns
category: backend
draft: false
lang: en
references:
  - url: 'https://webhooks.fyi/best-practices/webhook-providers'
    title: Best Practices for Webhook Providers
    type: authoritative
---

activity. This distinction is critical for resource management.

## The Problem: Ghost User Loop

```text
User stops using app → still uses Google Calendar
  → Google sends webhook (calendar change)
  → App triggers sync
  → Sync renews notification channels
  → New webhook arrives
  → Loop continues INDEFINITELY
```

**Wasted resources:**

- Database (channel records for inactive users)
- API quota (channel renewals)
- Server processing (webhook handling)

## The Solution: Track Trigger Source

Add a flag to distinguish webhook-triggered vs user-triggered operations:

```typescript
// In webhook handler
this.eventEmitter.emit(SYNC_REQUESTED, {
  userId: channel.integration.userId,
  integrationId: channel.integrationId,
  triggeredByWebhook: true,  // ← KEY FLAG
});

// In sync service
async sync(options: SyncOptions) {
  await this.performSync();

  // Only renew channels for user-initiated syncs
  if (!options?.triggeredByWebhook) {
    await this.renewChannels();
  }
}
```

## Lifecycle With This Pattern

| Scenario                                | Channel Behavior                        |
| --------------------------------------- | --------------------------------------- |
| Active user opens app                   | Channels renewed on client sync         |
| User stops using app                    | Channels expire after ~7 days           |
| Inactive user's Google Calendar changes | Webhook handled, but NO channel renewal |
| User returns after inactivity           | App sync recreates channels             |

## Generalized Pattern

This applies to any webhook-driven integration:

```typescript
interface SyncEvent {
  userId: number;
  resourceId: string;
  triggeredBy: 'client' | 'webhook' | 'cron';
}

async handleSync(event: SyncEvent) {
  await this.performSync(event.resourceId);

  // Resource-intensive operations only for client-triggered
  if (event.triggeredBy === 'client') {
    await this.renewSubscriptions();
    await this.refreshTokens();
    await this.updateLastActivity();
  }
}
```

## Applications

| Integration     | Webhook Source      | Apply Pattern?                    |
| --------------- | ------------------- | --------------------------------- |
| Google Calendar | Calendar changes    | ✅ Yes                            |
| Slack           | Messages, reactions | ✅ Yes                            |
| GitHub          | Pushes, PRs         | ✅ Yes                            |
| Stripe          | Payments            | ⚠️ Maybe (payments are important) |

## Alternative: User Activity Tracking

More sophisticated approach with explicit activity timestamp:

```typescript
// Schema
interface Integration {
  lastUserActivityAt: Date;  // Updated on client actions
}

// Decision logic
async shouldRenewChannels(integration: Integration): Promise<boolean> {
  const inactivityThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days
  const lastActivity = integration.lastUserActivityAt.getTime();
  const now = Date.now();

  return (now - lastActivity) < inactivityThreshold;
}
```

**Trade-offs:**

- ✅ More precise control
- ❌ Schema change required
- ❌ More complex to maintain
- ❌ Need to track activity in multiple places

## Key Lessons

1. **Webhook ≠ user activity** - External service activity, not user engagement
2. **Let resources expire naturally** - Don't renew for inactive users
3. **Track trigger source** - Simple flag enables smart decisions
4. **User returns → recreate** - No permanent loss, just delayed setup
5. **Apply broadly** - Pattern works for any webhook integration
