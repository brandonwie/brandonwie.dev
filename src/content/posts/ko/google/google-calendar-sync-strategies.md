---
title: "Google Calendar 동기화 전략"
description: "Full sync와 incremental sync 패턴, 그리고 캘린더 분류 로직을 정리했어요."
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - backend
  - google-api
  - sync
  - calendar
  - work
category: google
draft: false
lang: ko
source_lang: en
source_slug: google-calendar-sync-strategies
source_updated: "2026-01-23"
translation_date: "2026-03-04"
references:
  - url: "https://developers.google.com/workspace/calendar/api/guides/sync"
    title: Synchronize resources efficiently — Google Calendar
    type: official
---

## Sync Parity 원칙

> **앱은 Google Calendar 웹 앱에서 보이는 것과 정확히 같은 내용을 보여줘야 해요. 그 이상도, 이하도 아니에요.**

사용자는 이렇게만 이해해요: "Google에서 X가 보인다" → "앱에서도 X가 보여야 한다". 차이가 있으면 버그예요.

## Sync 모드

### Full Sync (토큰 없음)

**실행 시점**: 첫 동기화, 또는 410 GONE 에러 이후

```typescript
const params = {
  showDeleted: true, // 삭제된 캘린더도 포함
  showHidden: true, // 숨겨진 primary 캘린더 감지
  maxResults: 250,
};
```

**동작**:

- 계정의 모든 캘린더를 반환해요
- Orphan 감지 활성화 (CASE #3)
- Primary 캘린더는 항상 있어야 해요

### Incremental Sync (토큰 있음)

**실행 시점**: DB에 syncToken이 있을 때

```typescript
const params = {
  syncToken: "<stored_token>",
  maxResults: 250,
};
```

**동작**:

- 마지막 동기화 이후 변경된 캘린더만 반환해요
- Google이 삭제/숨김을 자동 포함해요
- `deleted=true`로 제거된 캘린더를 명시적으로 표시해요
- Orphan 감지 비활성화 (응답에 없음 = 변경 없음)
- Primary가 없을 수 있어요 (변경 없음 = 반환되지 않음)

## API 파라미터

### Calendar List API

| 파라미터      | Full Sync | Incremental | 설명                  |
| ------------- | --------- | ----------- | --------------------- |
| `syncToken`   | 생략      | 필수        | 이전 동기화의 토큰    |
| `showDeleted` | true      | 자동 포함   | 삭제된 캘린더 포함    |
| `showHidden`  | true      | 자동 포함   | 숨겨진 캘린더 포함    |
| `maxResults`  | 250       | 250         | 페이지 크기(최대 250) |

### Events API

| 파라미터                | 값        | 설명                           |
| ----------------------- | --------- | ------------------------------ |
| `showHiddenInvitations` | **false** | 거절한 일정 — 표시하지 않음    |
| `showDeleted`           | true      | 동기화를 위해 삭제된 것도 포함 |
| `singleEvents`          | false     | recurring 구조 유지            |

## 410 GONE 에러 처리

```typescript
if (error.code === 410) {
  // 토큰 삭제 후 full sync로 재시도
  return this.findCalendars(userId, integrationId, undefined);
}
```

**발생 시점**: 토큰 만료, ACL 변경, 서버 무효화

## 캘린더 분류 로직(CASE)

| CASE | 트리거                | Full Sync          | Incremental         |
| ---- | --------------------- | ------------------ | ------------------- |
| #1   | 응답에 `deleted=true` | 삭제               | 삭제                |
| #2   | 응답에 캘린더 있음    | 생성/업데이트      | 생성/업데이트       |
| #3   | 응답에 없음           | Orphan 표시 → 삭제 | **스킵**(변경 없음) |

### CASE #1 보호 장치

Primary 캘린더는 삭제할 수 없어요. Primary에 `deleted=true`가 오면:

- 모순된 데이터(불가능한 상태)
- 예외를 throw하고 Sentry에 캡처
- 트랜잭션 롤백

### CASE #3 보호 장치

Google primary가 full sync 응답에 없는데 DB에 있으면:

- 삭제 스킵(캘린더 보호)
- ERROR 로깅 + Sentry
- 동기화 계속(자기 복구)

## App Primary vs Google Primary

| 개념           | 필드                       | 설명                            |
| -------------- | -------------------------- | ------------------------------- |
| App Primary    | `calendar.primary`         | 사용자가 설정 가능, 아무 캘린더 |
| Google Primary | `calendar.isGooglePrimary` | 항상 사용자의 이메일 캘린더     |

### Primary 재할당

앱 primary가 삭제될 때:

1. Google primary이기도 한지 확인 (맞으면 throw)
2. 응답에서 Google primary 찾기
3. 대안: DB에서 찾기
4. `show=true`로 새 앱 primary 설정
5. 대체할 것이 없으면 에러

## 핵심 포인트

1. **Sync parity**가 최우선 규칙 - Google 웹 UI와 정확히 일치
2. **Full vs incremental**은 orphan 처리가 달라요
3. **Primary 캘린더**를 삭제로부터 보호하세요
4. **410 GONE**은 토큰 삭제 후 full resync 필요
