---
title: RRULE EXDATE 타임존 파싱 문제
description: >-
  rrule JavaScript 라이브러리에서 EXDATE가 RRULE보다 먼저 오거나 TZID 파라미터가 있으면 파싱이 제대로 안 됩니다.
  해결 방법을 알아봅니다.
date: 2026-01-23T00:00:00.000Z
updated: '2026-08-02'
tags:
  - backend
category: icalendar
draft: false
lang: ko
source_lang: en
source_slug: rrule-exdate-parsing
source_updated: '2026-08-02'
translation_date: '2026-02-12'
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

반복 이벤트가 예정된 날짜 대신 현재 타임스탬프에 결과를 생성하고 있었어요. 몇
시간 밀린 게 아니라 완전히 틀렸습니다. 제외 날짜가 있는 반복 이벤트는 전부
그랬어요. `rrule` 라이브러리가 조용히 실패하고 있었고, 원인을 알아내는 데 시간이
걸렸습니다.

## 조용한 실패

`rrule` JavaScript 라이브러리의 `rrulestr()` 함수가 두 가지 조건에서 고장납니다:

1. EXDATE가 recurrence 배열에서 RRULE보다 먼저 올 때
2. EXDATE에 TZID 파라미터가 있을 때 (타임존 지정 제외 날짜)

어느 조건이든 해당하면, 라이브러리가 에러를 던지지 않아요. 빈 배열을 반환하지도
않습니다. 조용히 **현재 타임스탬프**에 결과를 생성합니다. 날짜를 자세히 확인해서
모든 결과가 지금 시각이라는 걸 깨달을 때까지는 출력이 정상으로 보여요.

## 왜 이런 일이 발생하나

Google Calendar은 recurrence를 혼합된 내용의 배열로 저장합니다:

```javascript
[
  "EXDATE;TZID=Asia/Seoul:20251219T180000,20251226T180000",
  "RRULE:FREQ=WEEKLY;BYDAY=FR",
];
```

순서를 보세요: EXDATE가 먼저, RRULE이 나중. `rrulestr()`가 이걸 파싱하려고 하면:

- RRULE이 먼저 오고 EXDATE가 뒤에 오길 기대
- EXDATE의 TZID 파라미터를 제대로 처리 못함
- 현재 타임스탬프로 폴백해서 결과 생성

순서 민감성은 어디에도 문서화되어 있지 않아요. Google Calendar API가 EXDATE를
RRULE보다 먼저 반환한 후 시행착오로 발견했습니다.

## 잘못된 방향: forceset

`rrulestr(fullString, { forceset: true })`로 해결될 거라 생각할 수 있어요.
`forceset` 옵션은 RRULE+EXDATE 조합을 처리하기 위해 존재하니까요. 하지만 여전히
실패합니다:

1. EXDATE의 TZID를 여전히 파싱 못함
2. 문자열 내 라인 순서가 여전히 중요
3. 라이브러리 자체에 타임존 처리 관련 문서화된 이슈가 있음

라이브러리의 내장 EXDATE 처리가 타임존 지정 제외 날짜에 대해 고장났다는 걸
받아들이기 전에 이 잘못된 방향에 상당한 디버깅 시간을 썼어요.

## 해결법: 따로 파싱하고 수동으로 합치기

수정은 간단합니다: `rrulestr()`에게 EXDATE 라인을 보여주지 않는 거예요. RRULE과
EXDATE를 따로 파싱한 다음 `RRuleSet`으로 합칩니다:

```typescript
import { RRuleSet, rrulestr } from "rrule";

// 1. RRULE 라인만 추출 (EXDATE, RDATE 제외)
const rruleLines = extractRRulesOnly(event.recurrence);
const rruleString = rruleLines.join("\n");

// 2. RRULE만 파싱
const baseRule = rrulestr(rruleString, { dtstart: parentStart });

// 3. EXDATE 따로 파싱 (TZID 제대로 처리)
const exdates = parseExdates(event.recurrence, event.timeZone);

// 4. RRuleSet에 합치기
const ruleSet = new RRuleSet();
ruleSet.rrule(baseRule);
for (const exdate of exdates) {
  ruleSet.exdate(exdate);
}

// 5. 반복 일정 생성
const occurrences = ruleSet.between(periodStart, periodEnd, true);
```

핵심 통찰: `rrulestr()`는 RRULE 라인만 보면 잘 동작합니다. EXDATE 라인이 있을 때
실패하는 거예요. EXDATE를 필터링하고 직접 처리하면 버그를 완전히 우회합니다.

## 헬퍼 함수

### extractRRulesOnly

recurrence 배열에서 RRULE 라인만 유지하는 함수입니다:

```typescript
export function extractRRulesOnly(recurrence: string[] | null): string[] {
  if (!recurrence || recurrence.length === 0) return [];

  return recurrence
    .filter((line) => line.startsWith("RRULE:") || line.startsWith("RRULE;"))
    .map(sanitizeRRule);
}
```

### parseExdates

Google Calendar이 생성하는 네 가지 EXDATE 형식을 모두 처리하는 함수입니다:

| 형식 | 예시 | 파싱 전략 |
| --- | --- | --- |
| UTC | `EXDATE:20251219T090000Z` | 그대로 UTC로 파싱 |
| 날짜만 | `EXDATE;VALUE=DATE:20251219` | 이벤트 타임존의 자정으로 처리 |
| TZID 단일 | `EXDATE;TZID=Asia/Seoul:20251219T180000` | 지정된 타임존으로 파싱 후 UTC 변환 |
| TZID 다중 | `EXDATE;TZID=Asia/Seoul:20251219T180000,20251226T180000` | 콤마로 분리해 각각 타임존으로 파싱 |

EXDATE 라인은 모두 같은 모양이에요. 파라미터, 콜론, 그리고 콤마로 구분된 값 하나
이상. 그래서 첫 콜론에서 자르고, 파라미터 쪽에서 `TZID`를 꺼낸 다음, 값마다
분기하면 됩니다. 타임존 변환은 Luxon에 맡긴 최소 구현은 이런 모양이에요:

```typescript
import { DateTime } from "luxon";

export function parseExdates(
  recurrence: string[] | null,
  defaultTimeZone: string,
): Date[] {
  if (!recurrence) return [];

  const exdates: Date[] = [];

  for (const line of recurrence) {
    if (!line.startsWith("EXDATE")) continue;

    const colon = line.indexOf(":");
    const params = line.slice(0, colon); // EXDATE;TZID=Asia/Seoul
    const values = line.slice(colon + 1); // 20251219T180000,20251226T180000
    const zone = /TZID=([^;:]+)/.exec(params)?.[1] ?? defaultTimeZone;

    for (const value of values.split(",")) {
      const raw = value.trim();
      if (!raw) continue;

      if (raw.endsWith("Z")) {
        // 20251219T090000Z -- 이미 UTC
        exdates.push(
          DateTime.fromFormat(raw, "yyyyMMdd'T'HHmmss'Z'", {
            zone: "utc",
          }).toJSDate(),
        );
      } else if (!raw.includes("T")) {
        // 20251219 -- VALUE=DATE, 이벤트 타임존의 자정
        exdates.push(DateTime.fromFormat(raw, "yyyyMMdd", { zone }).toJSDate());
      } else {
        // 20251219T180000 -- TZID 타임존 기준 로컬 시간
        exdates.push(
          DateTime.fromFormat(raw, "yyyyMMdd'T'HHmmss", { zone }).toJSDate(),
        );
      }
    }
  }

  return exdates;
}
```

분기는 세 개지만 형식은 네 가지를 다 덮어요. TZID 다중은 콤마로 나뉜 값마다 TZID
분기가 한 번씩 도는 것뿐이니까요.

UTC 형식(`...Z`)은 라이브러리가 기본적으로 처리하지만 TZID 형식은 안 됩니다.
직접 파싱하면 네 가지 모두를 처리하고 `RRuleSet.exdate()`가 받을 수 있는 UTC
Date 객체를 반환할 수 있어요.

## 이런 경우에 사용하세요

- EXDATE에 TZID 파라미터가 포함된 Google Calendar 반복 이벤트를 파싱할 때
- `rrulestr()`가 예상 날짜 대신 현재 타임스탬프에 결과를 생성하는 모든 시나리오
- 네 가지 EXDATE 형식(UTC, 날짜만, TZID 단일, TZID 다중)을 모두 처리해야 하는
  캘린더 통합

## 이런 경우에는 사용하지 마세요

- **EXDATE 라인이 없는 경우** -- RRULE만 있는 입력에는 표준 `rrulestr()`가
  정상 동작합니다.
- **UTC 전용 EXDATE** -- RRULE이 먼저 오면 라이브러리가 `EXDATE:...Z`를 올바르게
  처리합니다.
- **다른 rrule 라이브러리** -- 이 우회법은 `jkbrzt/rrule` JavaScript
  라이브러리에만 해당됩니다. Python의 `dateutil` 등은 EXDATE+TZID를 올바르게
  처리할 수 있어요.
- **RDATE 처리** -- 이 솔루션은 RDATE 라인을 필터링합니다. RDATE 지원이
  필요하면 추가 파싱이 필요합니다.

## 핵심 정리

`rrulestr()`가 예상 스케줄 대신 현재 시간에 결과를 생성하면, 가장 유력한 원인은
TZID 파라미터가 있는 EXDATE입니다. 수정법은 EXDATE 라인을 절대 `rrulestr()`에
전달하지 않는 것이에요. RRULE 라인을 따로 추출하고, Google Calendar의 네 가지
형식을 모두 처리하는 커스텀 함수로 EXDATE를 파싱하고, `RRuleSet`으로 합치세요.
라이브러리가 EXDATE/TZID 처리를 수정할 때까지 이것이 유일하게 신뢰할 수 있는
접근법입니다.

## 참고 자료

- [rrule GitHub Issue #556](https://github.com/jkbrzt/rrule/issues/556) - BYDAY가 잘못된 날짜 반환
- [rrule GitHub Issue #523](https://github.com/jkbrzt/rrule/issues/523) - tzid로 인한 잘못된 날짜
- [rrule GitHub Issue #364](https://github.com/jkbrzt/rrule/issues/364) - TZID 무시됨
- [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) - iCalendar 명세
