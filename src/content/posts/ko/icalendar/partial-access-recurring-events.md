---
title: 부분 접근 반복 일정
description: >-
  반복 시리즈의 중간부터 초대받은 사용자의 경우, Google Calendar API가 예상과 다르게 동작해요. 제대로 처리하지 않으면 데이터
  무결성 문제가 발생해요.
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - backend
  - google-calendar
  - data-integrity
  - edge-cases
category: icalendar
draft: false
lang: ko
source_lang: en
source_slug: partial-access-recurring-events
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: 'https://developers.google.com/workspace/calendar/api/concepts/sharing'
    title: Calendar sharing — Google Calendar
    type: official
---

## 문제

### 시나리오

1. 반복 일정: 1~10일, 사용자 A가 소유
2. 사용자 B가 5일부터 초대됨
3. 사용자 B가 캘린더를 동기화

### Google API 동작

> "free/busy 권한이 있는 사용자가 events.list()를 조회하면, singleEvent가 true인 것처럼 동작해요."
> — Google Calendar API 문서

사용자 B의 경우:

- API가 인스턴스(5~10일)를 반환해요
- API가 **parent event를 필터링**(접근 권한 없음)해요
- 각 인스턴스의 `recurringEventId`가 존재하지 않는 parent를 가리켜요

### 버그

```typescript
// ❌ 버그: parent가 없으면 orphan이라고 가정
if (!parentBlock && !skipOrphanDetection) {
  orphansToDelete.push(block); // 잘못됨! 활성 이벤트가 삭제됨!
}
```

**결과**: 사용자 B의 정당한 이벤트가 "orphan"으로 삭제돼요.

## 수정: 상태 인식 Orphan 감지

```typescript
// ✅ 올바름: orphan 표시 전에 상태 확인
if (!parentBlock && !skipOrphanDetection) {
  if (block.itemStatus === BlockStatus.Deleted) {
    // 취소됐고 parent도 없음 = orphan
    orphansToDelete.push(block);
  } else {
    // 활성 block인데 parent 없음 = 부분 접근일 가능성
    // 독립 이벤트로 보존
    Sentry.captureMessage("Partial access detected", {
      extra: { blockId: block.id },
    });
  }
}
```

## "Effective Parent" 패턴

부분 접근 사용자가 연산을 수행할 때:

```text
True Root (1-4일) ← 사용자가 접근 권한 없음
  ↓ (originalId 링크 없음)
TA Block (5-10일) ← originalId = null, 하지만 recurrence 있음
  ↓ (originalId = TA.id)
T Block (7일) ← originalId = TA.id ✅
```

TA block이 사용자의 접근 범위 내에서 "effective parent" 역할을 해요.

### 동작하는 연산

| 연산                       | 상태    | 이유                        |
| -------------------------- | ------- | --------------------------- |
| "이 일정만"(단일 인스턴스) | ✅ 동작 | originalId = TA.id로 T 생성 |
| "전체"(모든 항목)          | ✅ 동작 | TA + T 자식들 업데이트      |
| recurrence 제거            | ✅ 동작 | TA를 단일 이벤트로 변환     |
| 삭제                       | ✅ 동작 | T 자식들 정리               |

### 차단해야 하는 연산

| 연산             | 상태    | 이유                       |
| ---------------- | ------- | -------------------------- |
| "이후 모든 일정" | ❌ 깨짐 | true root의 DTSTART가 필요 |

```typescript
// 부분 접근에서 ThisAndAfter 차단
if (isPartialAccessBlock(requestedBlock)) {
  throw new ConflictException(
    "ThisAndAfter not supported for limited access events. " +
      'Use "This occurrence" or "All occurrences" instead.',
  );
}
```

## 감지 유틸리티

### T Block 감지

T block은 반복 시리즈에서 exception 인스턴스예요:

```typescript
function isTBlock(block: {
  recurrence: string[] | null;
  originalId: number | null;
  googleEventData?: { recurringEventId?: string | null } | null;
}): boolean {
  // T block = recurrence 없음, parent 있음
  if (block.recurrence !== null || block.originalId === null) {
    return false;
  }

  const recurringEventId = block.googleEventData?.recurringEventId;
  if (!recurringEventId) return false;

  // 패턴: base_YYYYMMDDTHHmmssZ 또는 base_YYYYMMDD
  return /^[A-Z0-9]{26}_(\d{8}T\d{6}Z|\d{8})$/.test(recurringEventId);
}
```

### Partial Access Block 감지

```typescript
function isPartialAccessBlock(block: {
  originalId: number | null;
  recurrence: string[] | null;
  googleEventData?: { recurringEventId?: string | null } | null;
}): boolean {
  // Partial access TA: parent 없음, 하지만 recurrence 있음
  if (block.originalId !== null || !block.recurrence) {
    return false;
  }

  const recurringEventId = block.googleEventData?.recurringEventId;
  if (!recurringEventId) return false;

  return /_R\d{8}T\d{6}Z$/.test(recurringEventId);
}
```

## 핵심 교훈

1. **parent 부재 ≠ orphan** - 비즈니스 상태(itemStatus)를 확인하세요
2. **Google API 권한 필터링은 조용해요** - 에러 없이 데이터만 빠져요
3. **상태와 삭제는 다른 것** - itemStatus=Deleted ≠ deletedAt
4. **edge case를 코드에 문서화** - 향후 회귀를 방지해요
5. **감지 로직을 중앙화** - 일관성 없는 체크를 방지해요
