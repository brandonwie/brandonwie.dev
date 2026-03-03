---
title: "Webhook vs 사용자 활동"
description: "외부 서비스의 webhook은 그쪽의 활동을 나타내는 것이지, 우리 사용자의 활동이 아니에요. 이 구분이 리소스 관리에 중요해요."
date: 2026-01-26T00:00:00.000Z
updated: 2026-02-13T00:00:00.000Z
tags:
  - backend
  - webhooks
  - architecture
  - patterns
category: backend
draft: false
lang: ko
source_lang: en
source_slug: webhook-vs-user-activity
source_updated: "2026-02-13"
translation_date: "2026-03-04"
references:
  - url: "https://webhooks.fyi/best-practices/webhook-providers"
    title: Best Practices for Webhook Providers
    type: authoritative
---

## 문제: 유령 사용자 루프

```text
사용자가 앱 사용 중단 → 여전히 Google Calendar 사용 중
  → Google이 webhook 전송 (캘린더 변경)
  → 앱이 동기화 트리거
  → 동기화가 알림 채널 갱신
  → 새 webhook 도착
  → 루프가 무한 반복
```

**낭비되는 리소스:**

- 데이터베이스(비활성 사용자의 채널 레코드)
- API 할당량(채널 갱신)
- 서버 처리(webhook 핸들링)

## 해결: 트리거 소스 추적

webhook 트리거인지 사용자 트리거인지 구분하는 플래그를 추가하면 돼요.

```typescript
// webhook 핸들러에서
this.eventEmitter.emit(SYNC_REQUESTED, {
  userId: channel.integration.userId,
  integrationId: channel.integrationId,
  triggeredByWebhook: true,  // ← 핵심 플래그
});

// 동기화 서비스에서
async sync(options: SyncOptions) {
  await this.performSync();

  // 사용자가 직접 트리거한 동기화에서만 채널 갱신
  if (!options?.triggeredByWebhook) {
    await this.renewChannels();
  }
}
```

## 이 패턴의 라이프사이클

| 시나리오                             | 채널 동작                            |
| ------------------------------------ | ------------------------------------ |
| 활성 사용자가 앱 열기                | 클라이언트 동기화 시 채널 갱신       |
| 사용자가 앱 사용 중단                | ~7일 후 채널 만료                    |
| 비활성 사용자의 Google Calendar 변경 | webhook 처리하지만 채널 갱신은 안 함 |
| 사용자가 비활성 후 복귀              | 앱 동기화가 채널 재생성              |

## 일반화된 패턴

모든 webhook 기반 연동에 적용할 수 있어요.

```typescript
interface SyncEvent {
  userId: number;
  resourceId: string;
  triggeredBy: 'client' | 'webhook' | 'cron';
}

async handleSync(event: SyncEvent) {
  await this.performSync(event.resourceId);

  // 리소스를 많이 쓰는 작업은 클라이언트 트리거일 때만
  if (event.triggeredBy === 'client') {
    await this.renewSubscriptions();
    await this.refreshTokens();
    await this.updateLastActivity();
  }
}
```

## 적용 범위

| 연동            | webhook 소스   | 패턴 적용?               |
| --------------- | -------------- | ------------------------ |
| Google Calendar | 캘린더 변경    | 적용                     |
| Slack           | 메시지, 리액션 | 적용                     |
| GitHub          | Push, PR       | 적용                     |
| Stripe          | 결제           | 상황에 따라(결제는 중요) |

## 대안: 사용자 활동 추적

명시적인 활동 타임스탬프를 사용하는 좀 더 정교한 방법이에요.

```typescript
// 스키마
interface Integration {
  lastUserActivityAt: Date;  // 클라이언트 액션 시 갱신
}

// 판단 로직
async shouldRenewChannels(integration: Integration): Promise<boolean> {
  const inactivityThreshold = 7 * 24 * 60 * 60 * 1000; // 7일
  const lastActivity = integration.lastUserActivityAt.getTime();
  const now = Date.now();

  return (now - lastActivity) < inactivityThreshold;
}
```

**트레이드오프:**

- 더 정밀한 제어 가능
- 스키마 변경 필요
- 유지보수가 더 복잡해요
- 여러 곳에서 활동을 추적해야 해요

## 핵심 교훈

1. **webhook ≠ 사용자 활동** - 외부 서비스의 활동이지, 사용자의 참여가 아니에요
2. **리소스는 자연스럽게 만료되게** - 비활성 사용자를 위해 갱신하지 말아요
3. **트리거 소스를 추적** - 간단한 플래그로 스마트한 판단이 가능해요
4. **사용자가 돌아오면 재생성** - 영구적인 손실 없이, 설정이 지연될 뿐이에요
5. **범용 적용** - 모든 webhook 연동에 적용 가능한 패턴이에요
