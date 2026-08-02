---
title: 부분 접근 반복 일정
description: >-
  시리즈 중간부터 초대받은 사용자에게는 Google Calendar가 부모 일정을 걸러내요. "부모가 없으면 삭제된 시리즈"라고 가정한 orphan
  정리 로직은 살아 있는 일정을 지워버려요.
date: 2026-01-26T00:00:00.000Z
updated: '2026-08-02'
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
source_updated: '2026-08-02'
translation_date: '2026-03-04'
references:
  - url: 'https://developers.google.com/workspace/calendar/api/guides/recurringevents'
    title: Recurring events — Google Calendar API
    type: official
  - url: 'https://developers.google.com/workspace/calendar/api/concepts/sharing'
    title: Calendar sharing — Google Calendar
    type: official
---

제가 작업했던 캘린더 동기화의 orphan 정리 로직은 안전해 보이는 가정 위에 있었어요. 반복 일정 인스턴스에 부모가 없으면 시리즈가 사라진 것이고, 그 인스턴스는 쓰레기라는 가정이요. 대부분은 맞아요. 하지만 사용자에게 권한이 없어서 Google Calendar가 부모를 걸러낸 경우에는 틀려요. 그때 정리 로직은 사용자 캘린더에 멀쩡히 남아 있는 일정을 삭제해버려요.

---

## 시나리오

1일부터 10일까지 반복되는 일정이 있고, 사용자 A가 소유자예요. 5일째에 사용자 A가 남은 항목에 사용자 B를 초대해요. 사용자 B가 캘린더를 동기화하면 이렇게 돼요.

1. API가 5~10일 인스턴스를 반환해요
2. 부모 반복 일정은 **반환하지 않아요** — 사용자 B에게 접근 권한이 없으니까요
3. 반환된 각 인스턴스는 여전히 그 부모를 가리키는 `recurringEventId`를 갖고 있어요

두 가지 모두 문서에 나와 있어요. 인스턴스가 갖는 `recurringEventId`는 API 가이드에서 "이 인스턴스가 속한 부모 반복 일정의 ID"라고 설명해요. 그리고 호출자의 접근 권한 수준이 `events.list()`가 무엇을 반환하는지 자체를 바꿔요.

> "free/busy 권한이 있는 사용자가 events.list()를 조회하면, singleEvent가 true인 것처럼 동작해요." — [Recurring events, Google Calendar API](https://developers.google.com/workspace/calendar/api/guides/recurringevents)

같은 문서에 그 모드가 뭘 의미하는지도 적혀 있어요. `singleEvents` 동작에서는 개별 인스턴스가 전부 결과에 나타나고, 그 아래에 있는 반복 일정 본체는 나타나지 않아요.

그래서 동기화하는 쪽에서 보면 `recurringEventId`는 dangling pointer예요. Google 쪽에 부모가 없는 게 아니라, 이 사용자만 볼 수 없는 거예요. API는 에러도 주지 않고 "부분 접근" 플래그도 세우지 않아요. 부모만 조용히 빼고, 아무 일도 없다는 듯 인스턴스를 넘겨줘요.

---

## 버그

아래 코드는 작은 예시 모델을 써요. `parentId`, `recurrence` 규칙, 비즈니스 `status`, 그리고 원본 `googleEvent` 페이로드를 가진 `event` 레코드예요. 각자의 스키마에서 부르는 이름으로 바꿔서 읽으면 돼요.

orphan 감지 로직은 단순했고, 맞아 보였어요.

```typescript
// 버그: 부모가 없다는 사실을 시리즈가 사라졌다는 증거로 취급
if (!parent) {
  orphans.push(event); // 활성 일정이 삭제 대상으로
}
```

로컬 DB에 부모 레코드가 없는 반복 인스턴스는 orphan으로 보고 지웠어요. 흔한 경우 — 시리즈가 삭제됐는데 인스턴스만 남은 상황 — 에는 이게 맞는 동작이에요.

부분 접근 사용자에게는 파괴적이었어요. 사용자 B의 5~10일 일정은 부모 레코드가 없는데, 애초에 부모를 동기화할 수 없었기 때문이에요. 정리 작업이 한 번 돌면서 전부 지워버렸어요.

---

## 수정: 삭제 전에 상태 확인하기

orphan과 부분 접근 인스턴스는 관측 가능한 차이가 하나 있어요. 바로 상태예요. 부모가 없는 취소된 인스턴스는 orphan이에요. 부모가 없는 활성 인스턴스는 부분 접근일 가능성이 훨씬 높아요.

여기서 두 종류의 "사라짐"을 구분해두면 좋아요. 하나는 비즈니스 상태예요. 주최자나 사용자가 그 항목을 취소한 거죠. 다른 하나는 레코드 자체의 저장 수명주기, 즉 이 행이 정리 대상이라고 표시하는 soft-delete 타임스탬프예요. 취소된 항목도 대개 행은 그대로 필요해요. 취소됐다는 사실 자체가 계속 동기화돼야 하니까요. 삭제 로직은 행이 있는지로 의도를 추측하지 말고 비즈니스 상태를 읽어야 해요.

```typescript
// 부모 없는 행을 orphan이라 부르기 전에 비즈니스 상태를 확인
if (!parent) {
  if (event.status === 'cancelled') {
    // 취소됐고 부모도 없음: 진짜 orphan
    orphans.push(event);
  } else {
    // 활성인데 부모 없음: 부분 접근일 가능성, 독립 일정으로 보존
    keepAsStandalone(event);
    logger.warn('partial access instance preserved', { eventId: event.id });
  }
}
```

수정은 조건 하나예요. 부모 없는 인스턴스를 전부 지우는 대신 아직 활성인지 확인하고, 활성이면 보존하고 로그를 남겨요. 그러면 이 상황이 얼마나 자주 생기는지가 추측이 아니라 숫자가 돼요.

---

## "Effective Parent" 패턴 이해하기

부분 접근은 데이터에 특정한 모양을 만들어요. 사용자는 진짜 시리즈 마스터를 볼 수 없지만, 자기 접근 범위 안에서는 여전히 작은 계층 구조를 가진 반복 시리즈를 갖고 있어요.

용어 두 개만 정리할게요. **시리즈 마스터**는 recurrence 규칙을 갖고 있는 레코드예요. **예외 인스턴스**는 따로 수정된 단일 항목이고, 자기 recurrence 규칙 없이 마스터를 가리켜요.

```text
진짜 시리즈 마스터 (1-10일)   <-- 권한 없음: 필터링됨
  | 부모 링크 없음
보이는 마스터 (5-10일)        <-- 부모 없음, 하지만 recurrence 규칙 있음
  | 부모 = 보이는 마스터
예외 인스턴스 (7일)           <-- 따로 수정된 단일 항목
```

이 "보이는 마스터"가 제가 effective parent라고 생각하는 존재예요. 시리즈의 원래 마스터는 아니지만, 사용자의 접근 범위 안에서는 마스터처럼 동작해요. 7일의 예외 인스턴스도 보이지 않는 진짜 마스터가 아니라 이쪽을 정확히 가리켜요.

이 패턴이 중요한 이유는 대부분의 반복 일정 연산이 그대로 동작하기 때문이에요. effective parent가 recurrence 규칙과 기본 일정 데이터를 갖고 있고, 자식들이 그것을 가리키니까요.

### 동작하는 연산

| 연산            | 상태 | 이유                                            |
| --------------- | ---- | ----------------------------------------------- |
| "이 일정만"     | 동작 | 보이는 마스터 아래에 예외 인스턴스를 생성해요   |
| "모든 일정"     | 동작 | 보이는 마스터와 예외 인스턴스들을 업데이트해요  |
| recurrence 제거 | 동작 | 보이는 마스터를 단일 일정으로 변환해요          |
| 삭제            | 동작 | 아래의 예외 인스턴스들을 정리해요               |

### 차단해야 하는 연산

| 연산             | 상태 | 이유                                  |
| ---------------- | ---- | ------------------------------------- |
| "이후 모든 일정" | 깨짐 | 진짜 마스터의 원래 시작 시각이 필요해요 |

"이후 모든 일정"은 선택한 항목을 기준으로 시리즈를 쪼개는 연산이라, 진짜 마스터가 갖고 있는 원래 시작 날짜가 필요해요. 사용자는 그 레코드를 읽을 수 없으니 분할 지점이 어긋나고, 결과는 조용히 틀려요.

정직한 선택지는 막는 거예요.

```typescript
if (isPartialAccessMaster(event)) {
  throw new ConflictError(
    'This-and-following is not supported for a series you were added to partway through. ' +
      'Use "this occurrence" or "all occurrences" instead.'
  );
}
```

명확한 에러 메시지가 조용한 데이터 손상보다 나아요.

---

## 두 가지 모양 감지하기

위의 두 분기 모두 이 레코드들을 일관되게 알아봐야 해요. 호출하는 곳마다 직접 조건을 쓰는 대신 각각 predicate 하나씩 두는 편이 나아요.

```typescript
type SyncedEvent = {
  id: string;
  parentId: string | null;
  recurrence: string[] | null; // RRULE 라인; 인스턴스에서는 null
  status: 'confirmed' | 'cancelled';
  googleEvent?: { recurringEventId?: string | null } | null;
};

function isExceptionInstance(event: SyncedEvent): boolean {
  // 자기 recurrence 규칙이 없고, 동기화된 마스터에 매달려 있음
  if (event.recurrence !== null || event.parentId === null) return false;
  return Boolean(event.googleEvent?.recurringEventId);
}

function isPartialAccessMaster(event: SyncedEvent): boolean {
  // 부모 레코드가 없는데, 자기 recurrence 규칙은 갖고 있음
  if (event.parentId !== null || !event.recurrence) return false;
  // 그리고 도착한 적 없는 부모를 여전히 참조하고 있음
  return Boolean(event.googleEvent?.recurringEventId);
}
```

솔깃하지만 권하기보다는 주의를 붙이고 싶은 신호가 하나 더 있어요. 제가 다뤘던 데이터에서는 부분 접근 시리즈의 `recurringEventId`가 `_R` 뒤에 UTC 타임스탬프가 붙은 형태로 끝났고, `/_R\d{8}T\d{6}Z$/` 같은 정규식이 제가 본 모든 경우에 맞았어요. 하지만 Google Calendar API 레퍼런스 어디에서도 그 형식이 문서화된 걸 찾지 못했어요. 문서화되지 않은 ID 형식은 changelog 한 줄 없이 바뀌기 딱 좋은 종류예요.

믿고 쓸 만한 건 구조적인 판별이에요. 부모 레코드가 없고, recurrence 규칙이 있고, 끝내 해석되지 않은 `recurringEventId`가 있다는 조합이요. ID 모양이 쓸모 있다면 무엇을 로깅할지 정하는 데 쓰고, 무엇을 삭제할지 정하는 데는 쓰지 마세요.

---

## 정리

Google Calendar의 권한 필터링은 조용해요. 사용자가 반복 시리즈에 제한적으로 접근할 때, API는 볼 수 없는 항목을 빼고 주면서 뭔가 빠졌다는 신호를 전혀 남기지 않아요. 동기화 로직이 "부모 없음"을 "orphan"과 같다고 보면, 그런 사용자의 정당한 일정을 삭제하게 돼요.

수정은 상태 확인 한 줄이지만, 그 뒤의 원칙은 더 넓어요. **데이터가 없다는 것이 삭제됐다는 증거는 아니에요.** 무언가를 지우기 전에 비즈니스 상태를 확인하세요. 애매한 경우는 로그로 남겨서 측정 가능하게 만드세요. 그리고 사용자가 접근할 수 없는 데이터를 필요로 하는 연산은, 조용히 틀린 결과를 내게 두지 말고 막으세요.

이 버그에서 얻은 다섯 가지 교훈이에요.

1. **부모가 없다는 게 orphan이라는 증거는 아니에요** — 레코드의 비즈니스 상태를 먼저 확인하세요
2. **권한 필터링은 조용해요** — 에러도 플래그도 없이, 기대보다 행이 적을 뿐이에요
3. **취소된 항목과 정리 대상 행은 다른 상태예요** — 하나는 비즈니스 상태, 다른 하나는 저장 수명주기고, 삭제 로직은 전자를 읽어야 해요
4. **이유를 코드에 남기세요** — 상태 확인이 왜 있는지 적은 주석이, 다음 사람이 그걸 "정리"하다가 버그로 되돌리는 걸 막아줘요
5. **감지 로직을 중앙화하세요** — 예외 인스턴스용 predicate 하나, 부분 접근 마스터용 predicate 하나를 어디서나 쓰세요
