---
title: "Google Calendar 동기화 전략"
description: "Full sync와 incremental sync는 비슷해 보이지만, 응답에 없다는 사실이 정반대를 의미해요."
date: 2026-01-23T00:00:00.000Z
updated: 2026-08-02T00:00:00.000Z
tags:
  - backend
  - google-api
  - sync
  - calendar
category: google
draft: false
lang: ko
source_lang: en
source_slug: google-calendar-sync-strategies
source_updated: "2026-08-02"
translation_date: "2026-03-04"
references:
  - url: "https://developers.google.com/workspace/calendar/api/guides/sync"
    title: Synchronize resources efficiently — Google Calendar
    type: official
  - url: "https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list"
    title: CalendarList — list (Google Calendar API v3)
    type: official
---

사용자의 Google 캘린더를 내 DB로 미러링하는 건 하나의 문제처럼 보여요. 사실은
두 개고, 둘은 가장 중요한 질문에서 서로 반대 답을 내놔요. 저장해 둔 캘린더가
응답에 없을 때, 그건 무슨 뜻일까요?

## 나머지 결정이 전부 따라 나오는 규칙

Google Calendar 웹 UI가 보여주는 것을 그대로 보여줘요. 그 이상도, 이하도
아니에요.

사용자는 동기화 파이프라인을 기준으로 생각하지 않아요. 옆 탭에 이미 열려 있는
Google UI를 기준으로 생각하죠. "Google에는 있는데 앱에는 없다"는 설계 차이로
받아들여지지 않아요. 그냥 버그예요. 이걸 요구사항으로 받아들이고 나니 아래
결정들 대부분이 판단의 문제가 아니게 됐어요.

## 하나의 API, 두 가지 모드

### Full sync — 토큰 없음

첫 동기화 때, 그리고 토큰이 죽은 뒤에 다시 실행해요.

```typescript
const params = {
  showDeleted: true, // 삭제된 항목도 받아서 로컬에서도 지우기 위해
  showHidden: true, // 숨겨진 캘린더 — 숨겨진 primary 포함
  maxResults: 250, // API 상한선. 기본값은 100밖에 안 돼요
};
```

Full sync는 계정의 모든 캘린더를 반환해요. 응답이 완전하니까 그대로 신뢰해도
돼요. 내 DB에 있는데 응답에 *없는* 캘린더는 정말로 사라진 거예요.

### Incremental sync — 저장된 토큰 사용

```typescript
const params = {
  syncToken: storedToken,
  maxResults: 250,
};
```

토큰이 발급된 이후에 변경된 것만 반환해요. 여기서 두 가지가 따라 나오는데, 두
번째가 이 글을 쓰는 이유예요.

첫째, 삭제는 여전히 응답에 들어와요. `calendarList.list` 레퍼런스가 명시하고
있어요. `syncToken`을 넘기면 "all entries deleted and hidden since the previous
list request will always be in the result set and it is not allowed to set
`showDeleted` neither `showHidden` to False". 그래서 incremental 모드에서는 이
플래그들을 아예 보내지 않아요. 이미 강제로 켜져 있으니까요.

둘째, 응답에 없다는 건 삭제가 아니라 *변경 없음*이에요. sync 가이드는 반대편에서
같은 얘기를 해요. "the result will always contain deleted entries, so that the
clients get the chance to remove them from storage". 삭제라면 명시적으로 보고됐을
테니, 응답에 없는 캘린더는 아무도 건드리지 않은 캘린더예요.

여기가 함정 전부예요. 응답에 없는 로컬 row를 지우는 정합성 로직은 full sync
기준으로는 맞고, incremental sync 기준으로는 재앙이에요. 그 시간에 사용자가 우연히
수정하지 않은 캘린더를 전부 날려버리거든요.

## API 파라미터

| 파라미터      | Full sync | Incremental | 비고                            |
| ------------- | --------- | ----------- | ------------------------------- |
| `syncToken`   | 생략      | 필수        | 이전 동기화가 돌려준 토큰       |
| `showDeleted` | `true`    | 보내지 않음 | 토큰이 있으면 강제로 켜져요     |
| `showHidden`  | `true`    | 보내지 않음 | 토큰이 있으면 강제로 켜져요     |
| `maxResults`  | `250`     | `250`       | 기본값 100, 상한 250            |

이벤트 쪽에서는 세 파라미터가 예상보다 중요했어요.

| 파라미터                | 값      | 이유                                        |
| ----------------------- | ------- | ------------------------------------------- |
| `showHiddenInvitations` | `false` | 거절한 초대는 UI처럼 숨긴 채로 둬요         |
| `showDeleted`           | `true`  | 삭제가 로컬 저장소까지 전달돼야 해요        |
| `singleEvents`          | `false` | 인스턴스로 펼치지 않고 recurrence 구조 유지 |

`showHiddenInvitations: false`도 결국 sync parity 규칙이에요. 사용자가 거절한
일정은 Google 캘린더 화면에 없으니까, 내 쪽에도 없어야 하죠.

## 응답을 어떻게 해석할지

분기에 번호를 붙이는 대신 이름을 붙이는 게 도움이 됐어요. 번호는 감추지만 이름은
비대칭성을 드러내거든요.

| 동작           | 트리거                    | Full sync         | Incremental        |
| -------------- | ------------------------- | ----------------- | ------------------ |
| 명시적 삭제    | 응답에 `deleted: true`    | 로컬에서 삭제     | 로컬에서 삭제      |
| 응답에 있음    | 항목이 반환됨             | 생성 또는 업데이트 | 생성 또는 업데이트 |
| 응답에 없음    | 항목이 반환되지 않음      | orphan → 삭제     | **스킵** — 변경 없음 |

두 모드가 다른 건 마지막 행뿐이고, 데이터 유실은 정확히 그 칸에서 일어나요.

## Primary 캘린더 보호하기

Google은 계정마다 primary 캘린더가 정확히 하나 있고 삭제할 수 없다고 보장해요. 이
보장이 유용한 이유는, 보장이 깨진 상황을 신호로 쓸 수 있기 때문이에요.

응답이 primary 캘린더가 삭제됐다고 말한다면 그건 모순된 데이터예요. API가 스스로
불가능하다고 한 일을 보고하는 셈이죠. 그대로 처리하면 사용자의 메인 캘린더가
날아가니까, 진행하지 말고 크게 실패하는 게 맞아요. 예외를 던지고, 알림을 보내고(제
경우엔 Sentry), 트랜잭션을 롤백해서 어중간한 상태가 남지 않게 해요.

응답에 없는 경우는 성격이 달라서 더 부드럽게 대응해요. *full* sync 응답에
primary가 없는데 DB에는 있다면, orphan 로직은 그걸 지우려 들어요. 여기서는 삭제를
건너뛰고, 이상 상황이 보이도록 error 레벨로 로깅하고, 나머지 동기화는 끝까지
진행해요. 나머지 99%를 맞춰 놓고 이상 하나를 사람에게 넘기는 동기화가, 중단되는
동기화보다 낫고, 삭제해 버리는 동기화보다는 훨씬 나아요.

## "Primary"라는 말의 두 가지 뜻

Google의 primary 캘린더는 계정 이메일 주소에 묶인 캘린더고, 사용자가 고를 수
없어요. 그런데 제품이 사용자에게 기본 캘린더를 직접 고르게 한다면 — 새 항목이
들어가는 그 캘린더 말이에요 — 서로 관계없는 두 개의 "primary"가 한 단어를 나눠
쓰게 돼요.

저는 둘을 별도 필드로 저장해요. 하나는 Google이 보고한 값을 그대로 미러링하고,
다른 하나는 사용자가 설정하며 Google 입장에서는 아무 의미도 없어요. 둘을 합치면
삭제 경로가 위험해져요. "사용자의 기본 캘린더가 삭제됨"은 흔한 일이고 "Google
primary가 삭제됨"은 불가능한 일인데, 필드 하나로는 이 둘을 구분할 수 없거든요.

이렇게 분리해 두면 재할당도 다루기 쉬워져요. 사용자가 기본으로 지정한 캘린더가
사라지면, 먼저 그게 Google primary이기도 한지 확인하고(그렇다면 불가능한
상황이니 예외), 아니라면 Google primary를 그 자리에 올려요. 응답에 없으면 DB에
저장된 값으로 폴백하고요. 대체할 캘린더가 아예 없다면, 사용자를 기본값 없는
상태로 두는 대신 에러로 드러내는 편이 나아요.

## 토큰이 죽었을 때

```typescript
if (error.code === 410) {
  // 저장된 sync token을 버리고, 토큰 없이 같은 호출을 다시 실행해요.
  // 즉 full sync로요.
}
```

레퍼런스가 계약을 명확히 적어 놨어요. "If the `syncToken` expires, the server
will respond with a 410 GONE response code and the client should clear its
storage and perform a full synchronization without any `syncToken`".

같은 가이드가 "Full sync required by server" 항목에서 원인도 짚어 줘요.
"Sometimes sync tokens are invalidated by the server, for various reasons
including token expiration or changes in related ACLs". 여기서 기억해 둘 건 ACL
변경이에요. sync 중인 calendar의 권한을 바꾸는 것만으로도 토큰이 무효화될 수
있거든요. 그러니 410은 놀랄 예외 경로가 아니라 처음부터
있어야 하는 정상 분기예요. 그리고 그때 실행되는 full sync가, orphan 감지를 돌려도
되는 유일한 지점이에요.

## 핵심 정리

Sync parity는 있으면 좋은 게 아니라 요구사항이에요. Google UI에 맞추면 애매한
것들이 대부분 저절로 풀려요.

Full sync와 incremental sync는 "응답에 없음"에 대해서만 서로 다르게 말해요.
Orphan 감지는 모드에 따라 켜고 꺼야 해요.

"Primary 캘린더가 삭제됨"은 지시가 아니라 오염된 입력으로 다루세요.

410은 필요해지기 전에 미리 처리해 두세요. 문서화된 리셋 버튼이고, 410을 예상하지
않은 코드는 에러 대신 조용히 동기화를 멈춰버려요.
