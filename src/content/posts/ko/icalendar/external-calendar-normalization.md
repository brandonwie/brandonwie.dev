---
title: 외부 캘린더 데이터 정규화
description: >-
  외부 캘린더 클라이언트는 비표준 RRULE과 타임존 데이터를 내보내서 rrule.js 파싱을 깨뜨려요. 경계에서 정규화 레이어로
  처리하는 방법과, offset 매핑 테이블이 숨기고 있던 DST 함정을 정리했어요.
date: 2026-01-26T00:00:00.000Z
updated: '2026-08-02'
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
source_updated: '2026-08-02'
translation_date: '2026-03-04'
references:
  - url: 'https://datatracker.ietf.org/doc/html/rfc5545'
    title: RFC 5545 — iCalendar Specification
    type: official
  - url: 'https://github.com/jkbrzt/rrule'
    title: rrule.js — README (parseString vs rrulestr)
    type: official
  - url: >-
      https://discourse.gnome.org/t/working-with-evolution-mail-and-web-calendar-using-rrule-fail-because-of-x-evolution-enddate-in-rrule/19710
    title: >-
      GNOME Discourse — Evolution maintainer on what X-EVOLUTION-ENDDATE is for
    type: authoritative
---

제가 작업하던 캘린더 sync의 에러 로그에 파싱 실패 세 가지가 올라왔어요.
`Invalid time zone: GMT+09:00`, Linux 사용자에게서 온
`unsupported RRULE parm: X-EVOLUTION-ENDDATE`, 그리고 삭제된 항목이 있는 Google
Calendar 이벤트에서 온 `Unsupported RFC prop EXDATE`. 외부 캘린더 클라이언트는 셋 다
다른데, 결국 같은 rrule.js 파서로 들어가고 그 파서는 깔끔한 RFC 5545 입력을 기대해요.

현실 세계는 깔끔한 RFC 5545를 내놓지 않아요. Apple Calendar, GNOME Evolution,
TripIt, 항공사 예약 앱 — 각자 iCalendar 표준을 자기 방식으로 해석해요. 백엔드에서
recurrence rule을 파싱한다면 원본 데이터와 파서 사이에 정규화 레이어가 필요해요.

---

## 자주 발생하는 문제

| 에러                                          | 출처                               | 영향   |
| --------------------------------------------- | ---------------------------------- | ------ |
| `Invalid time zone: GMT+XX:XX`                | Apple Calendar, TripIt, 항공사 앱  | 치명적 |
| `unsupported RRULE parm: X-EVOLUTION-ENDDATE` | GNOME Evolution(Linux)             | 경고   |
| `Unsupported RFC prop EXDATE`                 | 삭제된 항목이 있는 Google Calendar | 치명적 |

"치명적"은 파싱이 아예 실패한다는 뜻이에요. occurrence가 하나도 생성되지 않고,
사용자 캘린더에서 이벤트가 사라져요. "경고"는 파서가 불평하지만 라이브러리 버전과
설정에 따라 결과를 내놓을 수도 있다는 뜻이고요.

특이한 edge case가 아니에요. Apple Calendar는 모든 iPhone의 기본 앱이고, GNOME
Evolution은 대부분의 Linux 배포판에 들어 있어요. EXDATE는 사용자가 반복 일정에서
하나만 삭제할 때 Google Calendar 자신이 만들어내고요.

---

## 타임존 정규화

Apple Calendar와 여행 앱은 IANA 타임존 이름 대신 `GMT+XX:XX` 형식을 자주 써요.
rrule 라이브러리는 이 형식을 인식하지 못해요.

GMT offset을 IANA 이름으로 매핑하는 lookup table이 해결책이에요:

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

한 가지 미묘한 지점이 있어요. 하나의 GMT offset이 여러 IANA 타임존에 대응돼요.
`GMT+09:00`은 `Asia/Tokyo`일 수도, `Asia/Seoul`일 수도, `Asia/Jayapura`일 수도
있어요. 테이블은 offset마다 대표 하나를 골라요.

저는 이걸 "offset은 같고 도시 이름만 다른" 무해한 선택이라고 설명해 왔는데, 아니에요.
위 테이블이 정확히 어디서 어긋나는지 보여줘요. `GMT+01:00` 입력은 절대 움직이지 않는
고정 offset이에요. 그런데 `Europe/Paris`는 움직여요. Node 24의
`Intl.DateTimeFormat`에 `longOffset`을 물어보면 1월엔 `GMT+01:00`, 7월엔
`GMT+02:00`을 돌려줘요. 고정 offset을 DST를 지키는 도시에 매핑하면, 원본 데이터에는
없던 한 시간 점프가 DST 경계에서 생기는 rule을 파서에 넘기는 셈이에요. 일본은 DST를
쓰지 않아서 `Asia/Tokyo`는 안전하지만, `Europe/Paris`, `Europe/Helsinki`,
`America/New_York`, `America/Los_Angeles`는 전부 움직여요.

고정 offset에 충실한 매핑을 원한다면 `Etc/GMT±N` 존이 더 가까워요. 이 존들은 절대
이동하지 않거든요. 다만 부호를 조심하세요. POSIX 관례 때문에 offset과 부호가
반대예요. 같은 `Intl` 확인에서 `Etc/GMT-9`는 UTC보다 아홉 시간 *앞*,
`Etc/GMT+9`는 아홉 시간 *뒤*로 나와요. 그러니까 `GMT+09:00` 입력은 `Etc/GMT-9`로
매핑되는데, 볼 때마다 틀린 것처럼 읽혀요. IANA 타임존 theory 문서에서는 이 부호 반전
설명을 찾지 못했고, 런타임에 직접 물어봐서 확인했어요.

테이블에 없는 offset에서 `Etc/UTC`로 fallback하는 건 크래시를 막아줘요. 그 이벤트의
결과는 틀리지만, sync 전체를 막는 치명적 에러보다는 틀린 게 나아요.

---

## RRULE 정제

대부분의 Linux 배포판에 들어가는 캘린더 앱인 GNOME Evolution은 RRULE property에
독점 파라미터 `X-EVOLUTION-ENDDATE`를 붙여요. 원본 줄은 이렇게 생겼어요:

```text
RRULE;X-EVOLUTION-ENDDATE=20241223T140000Z:FREQ=WEEKLY;COUNT=51;BYDAY=MO
```

RFC 5545는 `X-` 접두사가 붙은 vendor 파라미터를 허용해요. 그러니 여기서 규격을
벗어난 쪽은 Evolution이 아니라 엄격한 rrule 라이브러리예요. 어느 쪽이든 에러는 나니까,
파싱 전에 파라미터를 제거하는 regex가 해결책이에요:

```typescript
function sanitizeRRule(rrule: string): string {
  // GNOME Evolution의 독점 파라미터 제거
  return rrule.replace(/;X-EVOLUTION-ENDDATE=\d{8}T\d{6}Z/g, "");
}
```

제거해도 안전한 이유는 이 값이 SoT가 아니라 캐시이기 때문이에요. Evolution
메인테이너는 GNOME 포럼에서 이걸 미리 계산해 둔 시리즈 종료 날짜라고 설명해요.
"X와 Y 사이의 이벤트를 달라"는 쿼리가 rule을 다시 전개하지 않고 상수 시간에 판단할 수
있도록 저장해 두는 값이고, 파라미터가 없으면 필요할 때 다시 계산한다고 해요.

이 캐시된 날짜가 무엇이 *아닌지*도 짚어둘 만해요. `UNTIL`의 복사본이 아니에요. 위
예시는 `COUNT=51`로 끝나고 `UNTIL`이 아예 없어요. Evolution은 어느 쪽이든 종료
날짜를 계산해서 캐시하기 때문에, 표준 필드를 찾아본다고 복원되지 않아요.

---

## EXDATE 추출

rrule 라이브러리의 `RRule.parseString()`은 RRULE 줄만 처리해요. EXDATE 줄이 섞인
문자열을 넘기면 실패하거나 잘못된 출력을 내놔요(자세한 내용은
[EXDATE 파싱 글](/ko/posts/rrule-exdate-parsing)에 정리했어요).

파싱 전에 걸러내는 게 해결책이에요:

```typescript
function extractRRulesOnly(recurrenceArray: string[]): string[] {
  // EXDATE 줄은 걸러내고 RRULE 줄만 유지
  return recurrenceArray.filter((line) => line.startsWith("RRULE:"));
}

// 사용법 - recurrence 데이터를 파싱하는 모든 호출 지점에서
const rruleLines = extractRRulesOnly(event.recurrence);
const rruleSet = rrulestr(rruleLines.join("\n"));
```

`rrulestr()`이나 `RRule.parseString()`을 호출하는 모든 지점에 이 필터가 필요해요.
한 곳이라도 빠뜨리면, 삭제된 반복 일정 항목이 있는 사용자가 정확히 그 호출 지점에서만
파싱 실패를 만나요. 그래서 찾기 성가신 버그예요. 같은 이벤트가 화면 네 곳에서는 멀쩡히
보이다가 다섯 번째에서 터지거든요.

---

## 어디에 적용해야 하나

외부 RRULE 데이터가 파싱 파이프라인에 들어오는 모든 지점에서 정규화가 돌아야 해요.
그리고 어느 정도 규모가 있는 서비스라면 그 지점은 기능 목록만 보고 짐작하는 것보다
많아요. recurrence 전개 레이어에 필요하고, 캘린더 데이터를 써 넣는 sync 레이어에도
필요해요. 시리즈 종료 날짜를 구하거나 반복 일정이 요청 구간과 겹치는지 판단하려고
rule을 다시 만드는 쿼리 헬퍼도 마찬가지고요.

핵심 원칙은 이거예요. 핵심 로직 안이 아니라 경계에서 정규화하세요. 세 유틸리티를 한
모듈에 두고, 필요한 자리마다 한 줄짜리 필터를 다시 구현하는 대신 모든 호출 지점이
거기서 import하게 하세요. 새로운 외부 캘린더 형식이 나타나면 파일 하나만 고쳐도
모든 파서에 반영돼요.

경계해야 할 실패 모양은 그 반대예요. 필터를 세 호출 지점에 인라인해 두고 네 번째를
잊는 거죠. 네 번째 경로는 그 quirk를 만드는 클라이언트를 쓰는 사용자에게만 깨지니까
아무것도 잡아주지 않아요. `rrulestr(`과 `RRule.parseString(`을 grep해서 각 결과가
정규화 모듈 아래에 있는지 확인하는 건 저렴한 감사예요. 호출 지점이 새로 생길 때마다
반복할 만해요.

---

## 파서 선택

rrule 2.8.1 기준으로 라이브러리는 능력이 다른 두 파싱 API를 제공해요:

```typescript
// 단순 RRULE 파싱
const rule = RRule.parseString("FREQ=WEEKLY;BYDAY=MO");

// EXDATE, RDATE를 포함한 전체 RFC 5545
const rruleSet = rrulestr(
  "RRULE:FREQ=WEEKLY;BYDAY=MO\nEXDATE:20240101T090000Z",
);
```

README는 `RRule.parseString()`을 "RFC 문자열만 파싱해서 `options`를 반환"한다고
설명하면서 rule 값 하나만 넘기는 예시를 보여줘요. `rrulestr()`은 RFC 유사 문법을
위한 파서로 여러 줄 문자열을 받는다고 설명하고, 예시에 `DTSTART`, `RDATE`,
`EXRULE`, `EXDATE`가 함께 들어가요. README가 이 제약을 규칙으로 명시하지는 않으니,
보장이라기보다 예시가 보여주는 동작으로 받아들이는 게 좋아요. 제가 실제로 부딪힌
동작이고, 위 EXDATE 필터가 존재하는 이유이기도 해요.

EXDATE 지원이 필요한지로 선택하세요. 필요하다면 `RRuleSet`으로 따로 파싱하는 방식을
쓰세요.

---

## 기억해 둘 데이터 흐름

```text
Google Calendar API -> 데이터베이스 -> RRULE 파싱
```

핵심 인사이트: EXDATE는 Google API에서 와요. Google이 제공하는 것을 저장하는 거지,
직접 생성하는 게 아니에요. exception 날짜의 SoT는 Google이고, 우리가 할 일은 받은
것을 깨뜨리지 않고 파싱하는 것이지 재생성하거나 수정하는 게 아니에요.

그래서 정규화 레이어는 방어적이어야 해요. 들어본 적도 없는 앱의 캘린더를 사용자가
구독하면서 새로운 외부 형식이 예고 없이 나타나요. 정규화 코드는 알 수 없는 형식을
우아하게 처리해야 해요. 경고를 로깅하고, 안전한 기본값으로 fallback하되, sync를 절대
크래시시키지 않는 방향으로요.

---

## 핵심 교훈

외부 캘린더 데이터는 지저분하고, 앞으로도 계속 지저분할 거예요. Apple, GNOME, 여행 앱,
심지어 Google 자신도 rrule 라이브러리가 기대하는 것과 다른 데이터를 만들어내요.
더 나은 파서를 찾는 게 해법이 아니라, 어떤 파서에도 닿기 전에 데이터를 정규화하는 게
해법이에요.

프로덕션에서 살아남은 여섯 가지 원칙이에요. 마지막 하나는 먼저 틀리고 나서야 알았어요:

1. **외부 캘린더 데이터는 지저분해요** - 클라이언트마다 자기 quirk가 있다고 가정하세요
2. **경계에서 정규화** - 핵심 로직에 도달하기 전에 데이터를 정제하세요
3. **원본 데이터 보존** - Google이 제공한 것을 저장하고, 계산용으로만 정규화하세요
4. **유틸리티를 중앙화** - 정규화 함수를 한 파일에 두고 어디서나 import하세요
5. **실제 데이터로 테스트** - 유닛 테스트에 프로덕션의 실제 문제 이벤트를 쓰세요
6. **"동등한" 매핑이 무엇을 버리는지 확인** - 위 GMT offset 테이블은 DST를 조용히 되살려요

에러 로그에 새 파싱 실패가 뜰 때마다, 그건 미처 고려하지 못한 외부 캘린더
클라이언트가 있다는 신호예요. 그 형식을 정규화 레이어에 추가하고, 실제로 문제를 만든
데이터로 테스트 케이스를 추가하고, 넘어가세요. 정규화 레이어는 시간이 지나며 자라고,
그건 의도된 설계예요.

---

## 참고 자료

- [RFC 5545 - iCalendar Specification](https://datatracker.ietf.org/doc/html/rfc5545)
- [rrule.js README - `parseString`과 `rrulestr`](https://github.com/jkbrzt/rrule)
- [GNOME Discourse - Evolution 메인테이너가 설명하는 `X-EVOLUTION-ENDDATE`](https://discourse.gnome.org/t/working-with-evolution-mail-and-web-calendar-using-rrule-fail-because-of-x-evolution-enddate-in-rrule/19710)
