---
title: 'RRULE EXDATE 타임존 파싱 문제'
description: >-
  rrule JavaScript 라이브러리에서 EXDATE가 RRULE보다 먼저 오거나 TZID 파라미터가 있으면 파싱이 제대로 안 됩니다. 해결 방법을 알아봅니다.
date: 2026-01-23T00:00:00.000Z
updated: '2026-01-28'
tags:
  - backend
category: icalendar
draft: false
lang: ko
source_lang: en
source_slug: rrule-exdate-parsing
source_updated: 2026-01-23T00:00:00.000Z
translation_date: '2026-01-28'
references:
  - url: 'https://github.com/jkbrzt/rrule/issues/556'
    title: 'GitHub Issue #556 - BYDAY 관련'
    type: official
  - url: 'https://github.com/jkbrzt/rrule/issues/523'
    title: 'GitHub Issue #523 - TZID 관련'
    type: official
  - url: 'https://github.com/jkbrzt/rrule/issues/364'
    title: 'GitHub Issue #364 - TZID 무시됨'
    type: official
  - url: 'https://datatracker.ietf.org/doc/html/rfc5545'
    title: RFC 5545 - iCalendar 명세
    type: official
---

# RRULE EXDATE 타임존 파싱 문제

## 문제 상황

`rrule` JavaScript 라이브러리의 `rrulestr()` 함수가 다음 상황에서 제대로 동작하지 않습니다:

1. EXDATE가 recurrence 배열에서 RRULE보다 먼저 올 때
2. EXDATE에 TZID 파라미터가 있을 때 (타임존 지정된 제외 날짜)

**증상:** 정상적인 RRULE 반복 일정 대신, **현재 시간**에 인스턴스가 생성됩니다.

## 원인

Google Calendar는 recurrence를 혼합된 내용의 배열로 저장합니다:

```javascript
[
  "EXDATE;TZID=Asia/Seoul:20251219T180000,20251226T180000",
  "RRULE:FREQ=WEEKLY;BYDAY=FR"
]
```

`rrulestr()`가 이걸 파싱하려고 하면:

- RRULE이 먼저 오고 EXDATE가 뒤에 오길 기대함
- EXDATE의 TZID 파라미터를 제대로 처리 못함
- 결국 현재 타임스탬프로 폴백해서 반복 일정을 생성함

## 해결 방법

RRULE과 EXDATE를 따로 파싱한 다음 `RRuleSet`으로 합칩니다:

```typescript
import { RRuleSet, rrulestr } from 'rrule';

// 1. RRULE 라인만 추출 (EXDATE, RDATE 제외)
const rruleLines = extractRRulesOnly(block.recurrence);
const rruleString = rruleLines.join('\n');

// 2. RRULE만 파싱
const baseRule = rrulestr(rruleString, { dtstart: parentStart });

// 3. EXDATE 따로 파싱 (TZID 제대로 처리)
const exdates = parseExdates(block.recurrence, timeZone);

// 4. RRuleSet에 합치기
const ruleSet = new RRuleSet();
ruleSet.rrule(baseRule);
for (const exdate of exdates) {
  ruleSet.exdate(exdate);
}

// 5. 반복 일정 생성
const occurrences = ruleSet.between(periodStart, periodEnd, true);
```

## 핵심 함수

### extractRRulesOnly

recurrence 배열에서 RRULE 라인만 필터링합니다:

```typescript
export function extractRRulesOnly(recurrence: string[] | null): string[] {
  if (!recurrence || recurrence.length === 0) return [];

  return recurrence
    .filter((line) => line.startsWith('RRULE:') || line.startsWith('RRULE;'))
    .map(sanitizeRRule);
}
```

### parseExdates

타임존을 제대로 처리하면서 EXDATE 라인을 파싱합니다:

```typescript
export function parseExdates(recurrence: string[] | null, blockTimeZone: string): Date[] {
  // 지원하는 형식:
  // - EXDATE:20251219T090000Z (UTC)
  // - EXDATE;VALUE=DATE:20251219 (날짜만)
  // - EXDATE;TZID=Asia/Seoul:20251219T180000 (타임존 포함)
  // - EXDATE;TZID=Asia/Seoul:20251219T180000,20251226T180000 (여러 개)

  // UTC Date 객체 배열 반환
}
```

## rrulestr의 forceset 옵션은 왜 안 되나

`rrulestr(fullString, { forceset: true })`를 쓰면 될 것 같지만:

1. EXDATE의 TZID를 여전히 파싱 못함
2. 문자열 내 라인 순서가 중요함
3. 라이브러리 자체에 타임존 처리 관련 문서화된 이슈들이 있음

## 참고 자료

- [rrule GitHub Issue #556](https://github.com/jkbrzt/rrule/issues/556) - BYDAY가 잘못된 날짜 반환
- [rrule GitHub Issue #523](https://github.com/jkbrzt/rrule/issues/523) - tzid로 인한 잘못된 날짜
- [rrule GitHub Issue #364](https://github.com/jkbrzt/rrule/issues/364) - TZID 무시됨
- [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) - iCalendar 명세
