---
title: "Sync Token 무효화 복구 (410 GONE)"
description: "Google Calendar API가 410 GONE을 반환하면 sync token이 무효화되고 전체 재동기화가 필요해요. 올바른 처리 방법을 알아봐요."
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - backend
  - google-calendar
  - sync
  - error-handling
category: backend
draft: false
lang: ko
source_lang: en
source_slug: sync-token-invalidation-recovery
source_updated: "2026-01-26"
translation_date: "2026-03-04"
references:
  - url: "https://developers.google.com/workspace/calendar/api/guides/sync"
    title: Synchronize resources efficiently — Google Calendar
    type: official
---

## Sync Token이 무효화되는 이유

Google 문서에 따르면:

> "Sync token은 **토큰 만료**나 **관련 ACL 변경** 등 다양한 이유로 서버에 의해 무효화돼요."

핵심 인사이트: 410 GONE은 단순한 시간 기반 만료가 아니에요. ACL 변경(권한 변경)도 토큰을 무효화해요.

## 데이터 유실 버그

기존 접근 방식은 모든 block을 삭제하고 Google에서 다시 생성했어요.

```typescript
// ❌ 위험: 앱 고유 데이터가 사라짐
async handleResync(calendarId: string) {
  await this.blockRepo.delete({ calendarId });  // 날아감!
  const events = await this.googleApi.listEvents(calendarId);
  await this.createBlocksFromEvents(events);
}
```

**유실되는 데이터:**

- 커스텀 메모(`note` 필드)
- 링크 데이터(`linkData`)
- 공간 할당(`spaceId`)
- 사용자 커스터마이징 전부

## 해결: 전략 선택

캘린더 접근 권한에 따라 다른 전략을 적용해요.

```typescript
async handleResync(calendar: Calendar) {
  const accessRole = calendar.accessRole;

  if (isEditableCalendar(accessRole)) {
    // MERGE: 앱 고유 필드 보존
    await this.mergeResync(calendar);
  } else {
    // CLEAN-SLATE: 읽기 전용 캘린더에 안전
    await this.cleanSlateResync(calendar);
  }
}

function isEditableCalendar(accessRole: string | null): boolean {
  if (!accessRole) {
    Sentry.captureMessage('accessRole is null during 410 recovery');
    return false;  // 편집 불가로 취급(clean-slate)
  }
  return ['owner', 'writer'].includes(accessRole);
}
```

### Merge 전략 (편집 가능한 캘린더)

```typescript
async mergeResync(calendar: Calendar) {
  const events = await this.googleApi.listEvents(calendar.gcalId);

  for (const event of events) {
    const existing = await this.blockRepo.findOne({
      where: { calendarId: calendar.id, gcalId: event.id }
    });

    if (existing) {
      // UPDATE: 앱 필드는 유지하고 Google 필드만 갱신
      await this.updateBlockFromEvent(existing, event);
    } else {
      // INSERT: Google에서 온 새 이벤트
      await this.createBlockFromEvent(event);
    }
  }
}
```

### Clean-Slate 전략 (읽기 전용 캘린더)

```typescript
async cleanSlateResync(calendar: Calendar) {
  // 안전: 읽기 전용 캘린더에는 앱 고유 데이터가 없음
  await this.blockRepo.delete({ calendarId: calendar.id });
  const events = await this.googleApi.listEvents(calendar.gcalId);
  await this.createBlocksFromEvents(events);
}
```

## ACL 인식 복구

410이 발생하면 ACL이 변경됐을 수 있어요. 전략 선택 전에 최신 메타데이터를 가져와야 해요.

```typescript
async handleFindEventsWithResync(calendar: Calendar) {
  const result = await this.findEvents(calendar);

  if (result.resyncRequired) {
    // 중요: 재시도 전에 메타데이터 갱신
    const freshCalendar = await this.googleApi.getCalendar(calendar.gcalId);

    if (freshCalendar) {
      // Google에서 모든 필드 업데이트
      await this.updateCalendar(calendar.id, freshCalendar);
    }

    // 갱신된 accessRole로 재시도
    return this.handleResync(calendar);
  }

  return result;
}
```

## 판단 기준표

| accessRole       | 전략        | 이유                         |
| ---------------- | ----------- | ---------------------------- |
| `owner`          | Merge       | 사용자가 커스터마이징 가능   |
| `writer`         | Merge       | 사용자가 커스터마이징 가능   |
| `reader`         | Clean-slate | 읽기 전용, 커스터마이징 없음 |
| `freeBusyReader` | Clean-slate | 바쁨/한가함 정보만 표시      |
| `null`           | Clean-slate | 예상 외 상태, Sentry에 로깅  |

## 핵심 교훈

1. **410 ≠ 단순 만료** - ACL 변경도 토큰을 무효화해요
2. **410 발생 시 메타데이터 갱신** - 이전 accessRole이 오래된 정보일 수 있어요
3. **편집 가능 ≠ 읽기 전용** - 복구 전략이 달라야 해요
4. **예상 외 상태는 로깅** - null accessRole은 조사가 필요해요
5. **Google이 진실의 원천** - 하지만 앱 고유 데이터는 보존해야 해요
