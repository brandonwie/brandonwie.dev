---
title: 'Google Calendar API: 반복 일정 업데이트'
description: '반복 일정에서 "이 일정만", "이후 모든 일정", "전체 일정" 업데이트를 처리하는 방법이에요.'
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - backend
  - google-api
  - calendar
category: google
draft: false
lang: ko
source_lang: en
source_slug: google-calendar-recurring-events
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: >-
      https://developers.google.com/workspace/calendar/api/guides/recurringevents
    title: Recurring events — Google Calendar
    type: official
---

## 업데이트 유형

| UI 옵션          | API 접근 방식                   |
| ---------------- | ------------------------------- |
| "이 일정만"      | 특정 인스턴스 업데이트          |
| "전체 일정"      | recurring event 리소스 업데이트 |
| "이후 모든 일정" | 시리즈 분할(API 호출 2번)       |

## 단일 항목 업데이트 ("이 일정만")

1. `events.instances()`로 특정 인스턴스를 조회해요
2. 인스턴스 ID를 업데이트하면 예외(exception)가 생겨요

```typescript
// 각 인스턴스가 예외 이벤트가 돼요:
// - recurringEventId: 원본 시리즈를 가리킴
// - originalStartTime: 원래 차지했을 시간 슬롯
```

**주의:** 개별 인스턴스를 많이 수정하지 마세요. 데이터가 복잡해지고 성능이 떨어져요.

## 전체 시리즈 업데이트 ("전체 일정")

recurring event 리소스(RRULE이 있는 부모)를 업데이트하세요:

```typescript
// recurring event의 ID로 업데이트 (인스턴스 ID가 아님)
// 예외가 아닌 모든 항목에 변경이 전파됨
```

**중요:** PUT을 쓸 때는 모든 필드(특히 recurrence rule)를 포함해야 해요. 빠뜨린 필드는 초기화돼요.

**예외는 유지돼요:** 기존에 취소/수정된 인스턴스는 특별 상태를 유지해요.

## "이후 모든 일정" 업데이트 (시리즈 분할)

**단일 API 호출이 없어요.** 시리즈를 분할해야 해요:

### 1단계: 원본 시리즈 자르기

대상 인스턴스 이전에 끝나도록 원본 RRULE을 수정하세요:

- 대상 발생 전 날짜로 `UNTIL` 설정
- 원본 recurring event 업데이트

### 2단계: 새 시리즈 생성

새로운 recurring event를 만드세요:

- 대상 발생부터 시작
- 업데이트된 세부 정보 포함
- 원본과 같은 반복 주기(패턴을 바꾸지 않는 한)

### 예시

주간 회의, 다음 주부터 장소 변경:

1. 원본 업데이트: `UNTIL`을 이번 주 월요일로 설정
2. 새로 생성: 다음 주 월요일부터 시작, 새 장소 적용

### 주의: 예외 손실

분할 지점 이후의 예외는 **자동으로 보존되지 않아요.**

**예외를 보존하려면:**

1. 분할 전에 대상 날짜 이후의 모든 예외를 조회
2. 새 시리즈를 만든 후 수정 사항을 새 시리즈에 다시 적용
3. 취소/수정된 항목을 수동으로 이전

## PATCH vs PUT

| 메서드 | 동작                   | 사용 시점          |
| ------ | ---------------------- | ------------------ |
| PUT    | 전체 리소스 교체       | 종합적인 업데이트  |
| PATCH  | 지정된 필드만 업데이트 | 작은 변경(더 안전) |

**PUT 주의:** recurrence 필드를 항상 포함하세요. 안 그러면 시리즈가 단일 이벤트가 돼요.

**PATCH 참고:** quota 단위가 PUT의 1에 비해 3이에요.

### Atomicity를 위한 모범 사례

```text
// PATCH 대신:
1. events.get() - 최신 데이터 가져오기
2. events.update() - 수정 사항 + ETag로 PUT
// 호출 2번이지만 최신 데이터를 보장
```

## 에러 처리

### 404 Not Found

- 잘못된 eventId 또는 calendarId
- 이벤트가 생성된 적 없거나 영구 삭제됨
- 캘린더에 대한 접근 권한 없음
- **조치:** ID를 확인하세요. 무작정 재시도하지 말 것

### 410 Gone

- 이벤트가 삭제됨
- sync token 만료(목록 조회 시)
- **조치:** 영구 삭제된 것으로 처리하고 로컬 상태 정리

### 412 Precondition Failed

- ETag 사용 시 데이터가 오래됨
- **조치:** 최신 이벤트를 가져온 후 변경 사항 다시 적용

## 핵심 포인트

1. **단일 인스턴스 업데이트**는 예외를 만들어요 - 꼭 필요할 때만 사용
2. **시리즈 업데이트**는 PUT 시 전체 리소스 필요 (안전하게는 PATCH 사용)
3. **"이후 모든 일정"**은 분할이 필요해요 - 예외 처리를 계획하세요
4. **PUT 시 RRULE을 항상 보존** - recurring event에서 필수
5. **404/410을 우아하게 처리** - 다른 사람이 이벤트를 삭제했을 수 있어요
