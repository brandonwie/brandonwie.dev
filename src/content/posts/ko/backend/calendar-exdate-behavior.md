---
title: 'Calendar EXDATE 동작: Apple vs Google'
description: Apple Calendar과 Google Calendar이 반복 일정 삭제를 처리하는 방식의 차이
date: 2026-02-03T00:00:00.000Z
updated: 2026-02-03T00:00:00.000Z
tags:
  - backend
  - calendar
  - icalendar
  - rfc5545
category: backend
draft: false
lang: ko
source_lang: en
source_slug: calendar-exdate-behavior
source_updated: '2026-03-22'
translation_date: '2026-02-12'
references:
  - url: 'https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5.1'
    title: RFC 5545 - EXDATE Property
    type: official
  - url: 'https://github.com/jkbrzt/rrule/issues/548'
    title: rrule.js EXDATE with TZID limitation
    type: official
---

사용자가 삭제한 캘린더 이벤트가 계속 다시 나타난다는 보고가 있었어요.
Apple Calendar에서 반복 일정의 단일 항목을 삭제하고 있었는데, 앱에서는
삭제를 전혀 인식하지 못했어요. 아무 일도 없었던 것처럼 이벤트가
나타났어요.

원인은 이거였어요: Apple Calendar과 Google Calendar이 반복 일정의 "이
항목만 삭제"를 완전히 다른 방식으로 처리해요. sync 시스템이 Google
패턴만 처리하고 있어서, Apple 삭제가 보이지 않았던 거예요.

## 단일 항목을 삭제하는 두 가지 방법

사용자가 반복 일정에서 "이 항목만" 삭제하면, 캘린더 제공자는 어떤
방식으로든 그 삭제를 전달해야 해요. Apple과 Google은 정반대의 접근을
선택했고, 둘 다 RFC 5545에 따라 유효해요.

| 시나리오                | Parent에 EXDATE 있음 | Exception Event 존재 |
| ----------------------- | -------------------- | -------------------- |
| Apple "이 항목만" 삭제  | 예                   | **아니오**           |
| Google "이 항목만" 삭제 | 아니오               | 예 (`cancelled`)     |
| Apple "이 항목만" 수정  | 아니오               | 예 (`confirmed`)     |
| Google "이 항목만" 수정 | 아니오               | 예 (`confirmed`)     |

차이는 삭제에서만 나타나요. 수정은 두 플랫폼 모두 exception event를
생성해요.

## Apple Calendar 삭제

사용자가 Apple Calendar에서 "이 항목만" 삭제하면:

1. Apple이 parent event에 `EXDATE` 줄을 추가해요
2. Exception event는 생성되지 않아요
3. 유일한 신호가 EXDATE 줄이에요

```text
RRULE:FREQ=WEEKLY;BYDAY=TU
EXDATE;TZID=Asia/Seoul:20250819T090000
```

EXDATE 속성은 "이 항목은 존재하지 않는다"고 말해요. RFC 5545 Section
3.8.5.1에 정의되어 있고, 삭제된 항목을 표현하는 유효한 방법이에요. 별도의
event 객체는 생성되지 않아요.

## Google Calendar 삭제

사용자가 Google Calendar에서 "이 항목만" 삭제하면:

1. Google이 `status: "cancelled"`인 exception event를 생성해요
2. parent에 EXDATE가 추가되지 않아요
3. 신호가 cancelled exception event예요

```json
{
  "id": "parent_id_20250819T000000Z",
  "recurringEventId": "parent_id",
  "status": "cancelled"
}
```

대부분의 calendar sync 시스템이 처리하도록 만들어진 패턴이 이거예요 --
`status: "cancelled"`이고 parent를 가리키는 `recurringEventId`가 있는
이벤트를 감시하는 거예요.

## Google Calendar API Passthrough 문제

꼬박 하루의 디버깅이 필요했던 부분이 여기예요. Apple Calendar -> Google
Calendar -> 앱으로 sync할 때:

- Google이 Apple의 EXDATE를 **보존해요** (passthrough)
- Google이 EXDATE를 cancelled exception event로 **변환하지 않아요**
- 앱에서 Apple 삭제를 감지하려면 EXDATE를 파싱해야 해요

이 동작은 Google Calendar API에 문서화되어 있지 않아요. Google은 Apple의
EXDATE 줄에 대해 passthrough 역할을 해요. sync 시스템이 cancelled
exception event만 찾는다면, Apple 삭제가 조용히 사라져요.

## rrule.js의 한계

EXDATE 패턴을 발견한 후에도 또 다른 놀라움이 있었어요. `rrule.js`
라이브러리는 TZID 파라미터가 있는 EXDATE를 파싱할 수 없어요:

```text
// This FAILS in rrule.js:
EXDATE;TZID=Asia/Seoul:20250819T090000

// rrule.js expects:
EXDATE:20250819T000000Z
```

EXDATE를 조용히 무시해서, 제외된 날짜가 recurrence 확장에 여전히
나타나요. 유일한 단서는 예상 항목 수와 실제 항목 수를 비교했을 때
숫자가 맞지 않는 거였어요.

## 해결책: EXDATE를 별도로 파싱

해결 방법은 recurrence 데이터에서 EXDATE 줄을 추출하고, 수동으로
파싱하고(TZID 파라미터 처리), `RRuleSet`에 추가하는 거예요:

```typescript
import { RRuleSet, rrulestr } from "rrule";

function createRuleSetWithExdates(
  recurrence: string[],
  dtstart: Date,
  timeZone: string,
): RRuleSet {
  // Extract RRULE lines only
  const rruleLines = recurrence.filter((line) => line.startsWith("RRULE:"));

  // Parse RRULE
  const baseRule = rrulestr(rruleLines.join("\n"), { dtstart });

  // Parse EXDATE separately (handles TZID)
  const exdates = parseExdates(recurrence, timeZone);

  // Combine into RRuleSet
  const ruleSet = new RRuleSet();
  ruleSet.rrule(baseRule);
  for (const exdate of exdates) {
    ruleSet.exdate(exdate);
  }

  return ruleSet;
}
```

핵심은 분리예요: `rrule.js`가 RRULE 파싱을 처리하게 하고(이건 잘 해요),
EXDATE 파싱은 직접 처리하세요. `parseExdates` 함수는
`EXDATE;TZID=Asia/Seoul:20250819T090000` 같은 줄에서 날짜 문자열을
추출하고, timezone을 사용해서 변환하고, `RRuleSet.exdate()`가 받아들이는
`Date` 객체를 반환해요.

## Calendar Sync를 위한 실용 체크리스트

1. **Exception event가 존재한다고 가정하지 마세요** -- Apple 삭제는
   exception event를 생성하지 않아요. 유일한 신호는 parent의 EXDATE예요.
2. **항상 EXDATE를 파싱하세요** -- Google Calendar API를 통해 sync할 때
   Apple 스타일 삭제를 감지하는 유일한 방법이에요.
3. **rrule.js 한계를 처리하세요** -- EXDATE를 RRULE과 별도로 파싱하세요.
   TZID가 있는 EXDATE 줄을 `rrulestr()`에 넘기지 마세요.
4. **Google은 passthrough예요** -- Apple EXDATE가 보존되지, 변환되지
   않아요. 앱에서 두 삭제 모델을 동시에 처리해야 해요.

## 이 지식을 사용할 때

Apple Calendar이 소스인 사용자가 있을 수 있는 Google Calendar API에서
데이터를 수집하는 calendar sync 시스템을 구축할 때 중요해요. 캘린더
제공자 간에 단일 항목 삭제를 준수해야 하는 recurrence 확장을 구현할 때,
또는 Google을 통해 sync되는 반복 일정 시리즈에서 "누락된 항목"을
디버깅할 때도 적용돼요.

## 적용되지 않는 경우

- **Google 전용 캘린더 시스템** -- 모든 사용자가 Google Calendar에
  있다면, 삭제는 항상 cancelled exception event를 생성해요. EXDATE 파싱은
  가치가 없어요.
- **비반복 일정** -- EXDATE는 반복 일정 시리즈에만 적용돼요. 단일
  이벤트는 표준 삭제를 사용해요.
- **Outlook/Exchange 캘린더** -- Outlook은 자체적인 exception 처리
  모델이 있어요(Exchange API의 modified/deleted occurrences). 이
  Apple-vs-Google 지식은 직접 이전되지 않아요.

## 참고자료

- **EXDATE**: [RFC 5545 Section 3.8.5.1](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5.1) --
  Exception dates
- **RECURRENCE-ID**: [RFC 5545 Section 3.8.4.4](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.4.4) --
  Exception instance link
- **rrule.js TZID issue**: [GitHub Issue #548](https://github.com/jkbrzt/rrule/issues/548)
