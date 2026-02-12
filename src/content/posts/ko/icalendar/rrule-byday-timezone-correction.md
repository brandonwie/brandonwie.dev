---
title: "rrule BYDAY 타임존 보정"
description: >-
  rrule JavaScript 라이브러리가 BYDAY 요일을 이벤트 타임존이 아닌 UTC로 해석하는 문제와 해결 방법을 알아봅니다.
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - backend
  - rrule
  - timezone
  - icalendar
category: icalendar
draft: false
lang: ko
source_lang: en
source_slug: rrule-byday-timezone-correction
source_updated: "2026-01-26"
translation_date: "2026-02-12"
references:
  - url: "https://github.com/jkbrzt/rrule/issues/556"
    title: "GitHub Issue #556 - BYDAY 관련"
    type: official
  - url: "https://github.com/jkbrzt/rrule/issues/523"
    title: "GitHub Issue #523 - TZID 관련"
    type: official
  - url: "https://github.com/jkbrzt/rrule/issues/364"
    title: "GitHub Issue #364 - TZID 무시됨"
    type: official
  - url: "https://github.com/jkbrzt/rrule"
    title: rrule
    type: official
  - url: "https://datatracker.ietf.org/doc/html/rfc5545"
    title: RFC 5545 - iCalendar 명세
    type: verified
---

매주 금요일 08:00 KST에 반복되는 이벤트가 있었어요. rrule 라이브러리가 생성한
결과는 토요일이었습니다. 몇 시간 차이가 아니라 완전히 하루가 틀렸어요. 문제는
`rrule` JavaScript 라이브러리가 `BYDAY` 요일을 이벤트의 타임존이 아닌 UTC로
해석한다는 것입니다. 타임존이 UTC 기준으로 자정을 넘기면 라이브러리가 잘못된
날을 선택합니다.

## 핵심 문제

금요일 08:00 KST 이벤트가 확장될 때 일어나는 일입니다:

| 설정                            | rrule 해석                       | 결과                                            |
| ------------------------------- | -------------------------------- | ----------------------------------------------- |
| 금요일 08:00 KST (목 23:00 UTC) | `BYDAY=FR` = **UTC** 기준 금요일 | 금 23:00 UTC 생성 = KST **토요일** 08:00 (오류) |
| 예상                            | `BYDAY=FR` = **KST** 기준 금요일 | 목 23:00 UTC 생성 = KST **금요일** 08:00        |

rrule 라이브러리는 "금요일"을 보고 UTC 기준 금요일에 결과를 생성합니다.
하지만 금요일 23:00 UTC는 한국에서 토요일 08:00이에요. 금요일에 나타나야 할
이벤트가 토요일에 나타납니다.

## 라이브러리의 tzid 옵션이 도움이 안 되는 이유

rrule 라이브러리는 `tzid` 파라미터를 받습니다. 이걸로 문제가 해결될 거라
기대하겠죠. 안 됩니다. 라이브러리에 타임존 처리와 관련된 여러 문서화된 이슈가
있어요:

1. **BYDAY가 잘못된 날짜를 반환** -- 타임존 변환 시
   ([GitHub #556](https://github.com/jkbrzt/rrule/issues/556))
2. **tzid 전달 시 잘못된 날짜 출력**
   ([GitHub #523](https://github.com/jkbrzt/rrule/issues/523))
3. **"유사 UTC" 날짜** -- 라이브러리가 UTC처럼 보이는(Z 접미사가 붙은 ISO 문자열)
   날짜를 반환하지만 실제로는 TZID 타임존으로 해석해야 하는 값
4. **일부 연산에서 TZID 무시**
   ([GitHub #364](https://github.com/jkbrzt/rrule/issues/364))

이 이슈들을 발견하기 전에 `tzid`를 동작시키려고 시간을 썼어요. API 표면상으로는
동작할 것 같아 보입니다. 안 됩니다. 수정은 생성 중이 아닌 생성 후에 해야 합니다.

## 해결법: 생성 후 보정

라이브러리의 고장난 타임존 지원과 싸우지 않고, UTC로 결과를 생성한 뒤
보정합니다:

```text
1. BYDAY 규칙에 대해 rrule 기간을 +/-1일 확장 (타임존 경계 결과 포착)
2. UTC dtstart로 결과 생성 (tzid 없이)
3. 일 오프셋 계산: blockTimezone.date() - UTC.date()
4. 모든 결과를 일 오프셋의 역방향으로 이동
5. 필터링:
   a. 이벤트 타임존의 요일이 BYDAY 값과 일치
   b. 결과 날짜가 요청 기간 내
```

1단계의 기간 확장은 안전 마진이에요. 자정 경계 근처의 이벤트가 보정 후 쿼리
윈도우 밖으로 벗어날 수 있으므로, 양쪽으로 하루씩 더 요청해서 데이터 손실을
방지합니다.

## 일 오프셋 계산

핵심 부분이에요. 일 오프셋은 로컬 날짜와 UTC 날짜가 며칠 차이나는지 알려줍니다:

```typescript
// 예시: 금요일 08:00 KST = 목요일 23:00 UTC
const dtstartInBlockTz = DateUtil.tz(parentStart, timeZone); // 1월 16일 (KST 금요일)
const dtstartInUTC = DateUtil.utc(parentStart); // 1월 15일 (UTC 목요일)

// 월 경계를 올바르게 처리하기 위해 날짜 문자열 비교 사용
// (예: 1월 31일 UTC → 2월 1일 KST는 -30이 아닌 +1)
const localDateStr = dtstartInBlockTz.format("YYYY-MM-DD");
const utcDateStr = dtstartInUTC.format("YYYY-MM-DD");
const dayOffset = DateUtil.utc(localDateStr).diff(
  DateUtil.utc(utcDateStr),
  "day",
); // 1

// 보정을 위해 결과를 뒤로 이동
// rrule 생성: 금 23:00 UTC (KST 토요일) - 오류
// 이동 후: 목 23:00 UTC (KST 금요일) - 정확
```

## 월 경계 함정

처음에는 `.date()` 값을 직접 빼서 일 오프셋을 계산했어요. 대부분의 경우에는
동작합니다. 그런데 1월 31일 UTC가 2월 1일 KST가 되니 오프셋이 `+1`이 아닌
`-30`으로 나왔어요.

수정법은 숫자 일자 값 대신 포맷된 날짜 문자열을 비교하는 것입니다. 두 날짜를
`YYYY-MM-DD` 문자열로 변환하고, UTC 날짜로 다시 파싱한 뒤 diff를 구합니다.
이렇게 하면 월과 연도 경계를 올바르게 처리합니다.

## BYDAY Regex (RFC 5545 호환)

어떤 규칙에 보정이 필요한지 감지하기 위해 rrule 문자열에서 BYDAY 값을
파싱합니다:

```typescript
// RFC 5545의 모든 유효한 BYDAY 형식 캡처:
// - 단순: MO, TU, WE, TH, FR, SA, SU
// - 서수 포함: 1MO (첫 번째 월요일), -1FR (마지막 금요일), +2TU (두 번째 화요일)
const byDayMatch = rruleString.toUpperCase().match(/BYDAY=([A-Z0-9,+-]+)/);

// 숫자 접두사를 제거해서 요일 코드 추출
const dayCode = day.replace(/^[+-]?\d+/, ""); // "1MO" → "MO", "-1FR" → "FR"
```

`BYDAY`가 있는 규칙만 보정이 필요합니다. `FREQ=DAILY`와 `BYMONTHDAY` 규칙은
요일 해석 버그가 없습니다.

## 이런 경우에 사용하세요

- 이벤트의 타임존이 UTC와 다른 `BYDAY` 규칙의 반복 이벤트를 확장할 때 (특히
  KST, JST, IST처럼 자정을 넘기는 UTC+N 타임존)
- `dtstart`의 로컬 시간이 UTC와 다른 날짜에 해당하는 rrule 확장
- 사용자의 타임존에서 요일별로 이벤트를 집계하는 분석 또는 캘린더 기능

## 이런 경우에는 사용하지 마세요

- **UTC 타임존 이벤트** -- 자정 경계 오프셋이 없으므로 표준 rrule 확장이
  보정 없이 올바르게 동작합니다.
- **BYDAY가 아닌 규칙** (예: `FREQ=DAILY`, `BYMONTHDAY`) -- 요일 해석 버그가
  없어요. 일 오프셋 보정은 BYDAY에만 해당됩니다.
- **다른 rrule 라이브러리** -- 이 우회법은 `jkbrzt/rrule` JavaScript
  라이브러리에만 해당됩니다. Python의 `dateutil.rrule` 등은 타임존을 올바르게
  처리할 수 있어요.

## 핵심 정리

BYDAY 규칙에 대해 rrule 라이브러리의 `tzid` 옵션을 믿지 마세요. 순수 UTC로
결과를 생성하고, 날짜 문자열 비교(숫자 빼기가 아닌)로 UTC와 이벤트 타임존 간의
일 오프셋을 계산하고, 결과를 이동시키고, 요일 일치와 날짜 범위로 이중 필터링을
적용하세요. 월 경계 함정이 가장 위험한 엣지 케이스이므로 오프셋 계산에는 항상
문자열 기반 날짜 비교를 사용하세요.

## 참고 자료

- [rrule GitHub 저장소](https://github.com/jkbrzt/rrule)
- [RFC 5545 - iCalendar 명세](https://datatracker.ietf.org/doc/html/rfc5545)
