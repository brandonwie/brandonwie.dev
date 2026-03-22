---
title: 외부 캘린더 데이터 정규화
description: >-
  Apple Calendar, GNOME Evolution, 여행 앱 등의 외부 캘린더 데이터는 비표준 형식을 포함하는 경우가 많아서 파싱이
  깨져요. 정규화 레이어로 이 edge case를 처리하는 방법이에요.
date: 2026-01-26T00:00:00.000Z
updated: '2026-03-22'
tags:
  - backend
  - google-calendar
  - rrule
  - parsing
category: icalendar
draft: false
lang: ko
source_lang: en
source_slug: external-calendar-normalization
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: 'https://datatracker.ietf.org/doc/html/rfc5545'
    title: RFC 5545 — iCalendar Specification
    type: official
---

## 자주 발생하는 문제

| 에러                                          | 출처                               | 영향   |
| --------------------------------------------- | ---------------------------------- | ------ |
| `Invalid time zone: GMT+XX:XX`                | Apple Calendar, TripIt, 항공사 앱  | 치명적 |
| `unsupported RRULE parm: X-EVOLUTION-ENDDATE` | GNOME Evolution(Linux)             | 경고   |
| `Unsupported RFC prop EXDATE`                 | 삭제된 항목이 있는 Google Calendar | 치명적 |

## 정규화 유틸리티

### 타임존 정규화

GMT offset을 IANA 타임존 이름으로 변환해요:

```typescript
const OFFSET_TO_IANA: Record<string, string> = {
  "+00:00": "Etc/UTC",
  "+01:00": "Europe/Paris",
  "+02:00": "Europe/Helsinki",
  "+09:00": "Asia/Tokyo",
  "-05:00": "America/New_York",
  "-08:00": "America/Los_Angeles",
  // ... 모든 UTC 변형을 커버하는 38개 offset
};

function normalizeTimezone(tz: string): string {
  // Apple Calendar의 GMT+XX:XX 형식 처리
  const gmtMatch = tz.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (gmtMatch) {
    const offset = `${gmtMatch[1]}${gmtMatch[2]}:${gmtMatch[3]}`;
    return OFFSET_TO_IANA[offset] ?? "Etc/UTC";
  }
  return tz;
}
```

### RRULE 정제

독점 확장을 제거해요:

```typescript
function sanitizeRRule(rrule: string): string {
  // GNOME Evolution의 독점 파라미터 제거
  return rrule.replace(/;X-EVOLUTION-ENDDATE=\d{8}T\d{6}Z/g, "");
}
```

### EXDATE 추출

rrule.js의 `RRule.parseString()`은 RRULE 줄만 처리해요. 파싱 전에 EXDATE를 분리하세요:

```typescript
function extractRRulesOnly(recurrenceArray: string[]): string[] {
  // EXDATE 줄은 걸러내고 RRULE 줄만 유지
  return recurrenceArray.filter((line) => line.startsWith("RRULE:"));
}

// 사용법 - 코드베이스에서 6곳 이상
const rruleLines = extractRRulesOnly(block.recurrence);
const rruleSet = rrulestr(rruleLines.join("\n"));
```

## 적용 지점

모든 RRULE 파싱 위치에서 정규화를 적용하세요:

| 파일                             | 함수              | 정규화              |
| -------------------------------- | ----------------- | ------------------- |
| `calendar-normalization.util.ts` | 유틸리티 함수     | 세 가지 모두        |
| `block-recurrence.service.ts`    | 6곳               | `extractRRulesOnly` |
| `block-calendar.service.ts`      | 1곳               | `extractRRulesOnly` |
| `functions.ts`                   | `getUntil()`      | `extractRRulesOnly` |
| `block-query.util.ts`            | `rrulestr()` 사용 | `sanitizeRRule`만   |

## 라이브러리 제한 사항

### rrule.js

- `RRule.parseString()` - RRULE 줄에 대한 엄격한 RFC 5545
- `rrulestr()` - 전체 iCal 지원이지만 API가 다름

용도에 따라 선택하세요:

```typescript
// 단순 RRULE 파싱
const rule = RRule.parseString("FREQ=WEEKLY;BYDAY=MO");

// EXDATE, RDATE를 포함한 전체 RFC 5545
const rruleSet = rrulestr(
  "RRULE:FREQ=WEEKLY;BYDAY=MO\nEXDATE:20240101T090000Z",
);
```

## 데이터 흐름

```text
Google Calendar API → 우리 데이터베이스 → RRULE 파싱

핵심 인사이트: EXDATE는 Google API에서 옵니다.
Google이 제공하는 것을 저장하는 거지, 우리가 생성하는 게 아니에요.
Google이 exception 날짜의 SoT(단일 진실 원천)예요.
```

## 핵심 교훈

1. **외부 캘린더 데이터는 지저분해요** - Apple, GNOME, 여행 앱 모두 다 달라요
2. **경계에서 정규화** - 핵심 로직에 도달하기 전에 데이터를 정제하세요
3. **원본 데이터 보존** - Google이 제공한 것을 저장하고, 계산용으로 정규화
4. **유틸리티를 중앙화** - 모든 정규화 함수를 한 곳에서 관리
5. **실제 데이터로 테스트** - 유닛 테스트에 실제 문제 이벤트를 사용하세요
