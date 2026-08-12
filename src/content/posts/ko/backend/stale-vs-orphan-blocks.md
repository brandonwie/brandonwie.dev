---
title: 캘린더 동기화에서 Stale Record와 Orphan Record의 차이
description: Google Calendar API 동기화가 남기는 두 종류의 찌꺼기 행은 겉보기에 똑같지만 처리 방법은 정반대예요
date: 2026-02-05T00:00:00.000Z
updated: '2026-08-12'
tags:
  - backend
  - sync
  - google-calendar
category: backend
draft: false
lang: ko
source_lang: en
source_slug: stale-vs-orphan-blocks
source_updated: '2026-08-12'
translation_date: '2026-08-12'
references:
  - url: 'https://developers.google.com/calendar/api/guides/sync'
    title: Google Calendar API - Sync Events
    type: official
---

제가 작업한 캘린더 동기화에는 하나처럼 보이는 두 개의 버그가 있었어요.
삭제했어야 할 행을 남겨두고 있었고 -- Google에서는 사라졌는데 앱에는 계속
보이는 유령 이벤트요 -- 반대로 남겨뒀어야 할 행을 삭제하기도 했어요. 후자는
공유 캘린더에서 사용자 데이터 손실로 이어졌고요.

둘 다 겉으로는 "로컬 DB가 Google과 어긋난다"는 같은 모습이었어요. 그래서 하나의
정리 패스로 묶어서 처리했는데, 그게 실수였어요. 두 경우는 감지 로직이 정반대고,
순서를 잘못 잡으면 댕글링 참조가 남아요.

용어부터 정리할게요. 이런 동기화는 Google Calendar 이벤트 하나하나를 로컬에
행으로 저장하는데, 이 글에서는 이걸 **event record**라고 부를게요. 반복
이벤트는 시리즈 자체를 나타내는 record 하나와 각 발생을 나타내는 **instance
record**들로 저장되고, 각 instance record는 parent-link 컬럼으로 자기 시리즈를
가리켜요.

## 핵심 구분

동기화가 끝나면 로컬 DB에는 현실을 반영하지 않는 record가 쌓여요. 표면적으로는
비슷해 보이지만 처리 방법이 근본적으로 다른 두 부류예요.

| 개념              | 정의                                               | 트리거                 |
| ----------------- | -------------------------------------------------- | ---------------------- |
| **Stale record**  | Google 응답에 없는 모든 로컬 record                | Google에서 이벤트 삭제 |
| **Orphan record** | 응답에는 있지만 유효한 부모가 없는 instance record | 부모 시리즈 삭제/수정  |

핵심 차이는 **API 응답에서의 존재 여부**예요:

```text
Google API Response
├── Contains event
│   ├── Has parent → Link (normal case)
│   └── No parent → Orphan (needs cleanup)
└── Does NOT contain event → Stale (needs cleanup)
```

Stale record는 응답에 아예 없어요 -- Google에서 삭제된 이벤트라 로컬에도 있으면
안 되는 거죠. Orphan record는 응답에는 있지만 가리키는 시리즈 record가 로컬에
없어요.

## 순서가 중요해요

이 둘이 별개의 문제라는 걸 깨닫게 해준 버그예요. orphan 감지를 stale 정리보다
먼저 실행하고 있었는데, 스스로 만든 경쟁 상태였어요.

1. orphan 감지가 instance record를 시리즈 record에 연결
2. stale 정리가 그 시리즈 record 중 일부를 삭제
3. instance record의 parent-link 값이 이제 존재하지 않는 행을 가리킴
4. 이후 동기화가 깨진 참조를 풀지 못하고 실패

올바른 순서는 stale 정리 먼저, 그다음 orphan 감지예요. stale 정리가 응답에 없는
것들을 먼저 걷어내야, 남은 instance record의 부모가 유효한지 안전하게 물어볼 수
있어요.

## Stale Record 정리

Stale 정리는 전체 동기화에서만 실행돼요 -- syncToken이 없거나 410 GONE 이후
재동기화할 때요. Google 문서가 이 선을 분명히 긋고 있어요. 전체 동기화는 컬렉션
전체를 반환하고, 증분 응답은 변경된 것만 담아요. 그래서 전체 응답에서의 부재는
삭제를 뜻하지만, 증분 응답에서의 부재는 아무 의미도 없어요.

```typescript
// Build the id set once (O(m)), then one O(1) membership check per record
const googleEventIds = new Set(googleEvents.map((e) => e.id));

const staleIds: string[] = [];
for (const record of existingRecords) {
  if (!googleEventIds.has(record.googleEventId)) {
    staleIds.push(record.id);
  }
}
```

Set이 이걸 쓸 만하게 만들어요. 로컬 record마다 응답 전체를 다시 훑으면
O(n·m)이라 10만 개 넘는 record에서는 너무 느려요. Set을 한 번만 만들어두면 전체
패스가 O(n + m)이 돼요.

Stale 정리는 모든 record 유형을 처리해요 -- 시리즈, 독립형 이벤트, instance
record 전부요. 전체 응답에 없으면 stale이에요.

## Orphan Record 감지

Orphan 감지는 증분이든 전체든 모든 동기화에서 실행돼요. 응답에 들어 있는 모든
instance record를 훑으면서 셋 중 하나를 결정해요. 시리즈가 로컬에 있으면 연결,
부모가 없고 CANCELLED면 삭제, 그 외에는 그대로 두기.

마지막 경우가 제가 틀렸던 부분이에요. 부모 없는 instance가 전부 orphan은
아니거든요. 부모 없이 CANCELLED인 instance는 진짜 orphan이에요 -- 그 발생이
취소됐고 시리즈도 사라진 거니까요. 하지만 부모 없이 취소되지 않은 instance는
부분 캘린더 접근일 수 있어요. 누군가 특정 발생 하나만 공유해서, 사용자가
시리즈는 못 보고 instance만 정당하게 보는 상황이죠. 이걸 삭제하면 데이터
손실이에요.

```typescript
// Only cancelled instances without a parent are true orphans
if (record.status === Status.Cancelled && !parentRecord) {
  orphansToDelete.push(record.id);
}
```

## 결정 테이블

| 시나리오                                      | 패스        | 액션               |
| --------------------------------------------- | ----------- | ------------------ |
| record가 응답에 없음                          | Stale 정리  | 하드 삭제          |
| instance가 응답에 있고, 부모 존재             | Orphan 감지 | 부모에 연결        |
| instance가 응답에 있고, 부모 없음, CANCELLED  | Orphan 감지 | 하드 삭제 (orphan) |
| instance가 응답에 있고, 부모 없음, 취소 안 됨 | Orphan 감지 | 유지 (부분 접근)   |

## 대규모 성능

record가 10만 개 넘는 계정에서는 세 가지가 중요했어요.

1. **최소 SELECT** -- 비교에 필요한 두 필드만 조회 (로컬 id와 Google 이벤트 id),
   record 전체를 가져오지 않기
2. **Set 기반 조회** -- 응답을 훑는 대신 record당 O(1) 멤버십 확인 한 번
3. **배치 DELETE** -- 한 문장이 DB 드라이버의 바인드 파라미터 한도를 넘지 않도록
   나눠서 삭제

```typescript
const BATCH_SIZE = 100;
for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
  await recordRepo.delete(staleIds.slice(i, i + BATCH_SIZE));
}
```

## 실전 가이드

Google이 완전한 이벤트 세트를 반환하는 전체 동기화(초기 동기화 또는 410 GONE
이후 재동기화)에서 stale 정리를 실행하세요. 부모 시리즈가 instance와 독립적으로
수정되거나 삭제될 수 있으니, 반복 이벤트를 다루는 모든 동기화에서는 orphan
감지를 실행하고요.

유효한 syncToken이 있는 증분 동기화에서는 stale 정리를 실행하지 마세요. 증분
응답에는 변경된 이벤트만 담기고 삭제는 응답 안에 명시적인 항목으로 오기 때문에,
부재 자체는 아무 신호도 아니에요. 시스템이 반복 이벤트를 아예 모델링하지 않으면
orphan 감지도 필요 없어요.

## 정리 로직을 응답에서 떼어낼 때

규칙 자체는 한 줄이에요. stale 정리는 전체 동기화에서만. 그런데 이걸 안고 살기가
생각보다 불편해요. 현재 응답으로 만든 메모리 맵에서 판단 근거를 읽는 정리 패스는
증분 동기화나 webhook 동기화에서는 제 일을 못 해요. 그 맵은 애초에 불완전하게
설계돼 있으니까요. 패스는 그대로 돌아요. 다만 처리할 게 없다고 판단하고, 했어야
할 일을 조용히 건너뛰어요.

고치는 방법은 응답 대신 DB에 묻는 거예요. 맵에서 찾지 말고 부모 record를 직접
조회하는 거죠. 이러면 응답이 아무리 부분적이어도 판단이 정확하고, 정리를 모든
동기화에서 돌려도 안전해져요.

여기에 경고 딱지를 붙이고 싶어요. 이 수정은 삭제 쪽만 응답 완전성에서 떼어내고
삽입 쪽은 그대로 두거든요. 행이 다시 쓰이려면 여전히 응답에 들어 있어야 해요. 두
쪽이 서로 다른 조건으로 발동하기 시작하면, 아무도 건드리지 않은 행이 사라져요.

| 누구의 행              | 삭제 발동 | 응답에 포함    | 다시 삽입 | 결과                      |
| ---------------------- | --------- | -------------- | --------- | ------------------------- |
| 직접 수정한 사람       | 예        | 예 (본인 변경) | 예        | 행은 남고 일부 필드 유실  |
| 아무것도 안 바꾼 참가자 | 예       | 아니오 (변경 없음) | 아니오 | 행 사라짐                 |
| 이벤트에서 빠진 참가자 | 예        | 아니오 (제외됨) | 아니오   | 행 사라짐                 |

이벤트를 직접 수정한 사람은 자기 행이 응답에 실려요. 그래서 삭제 직후에 삽입이
따라붙어요. 피해는 삽입 경로가 빠뜨린 컬럼 정도로 그치고요. 반면 아무것도 안 바꾼
참가자는 증분 응답에 행이 아예 안 실려요. 삭제는 이제 DB를 보고 판단하니까
그대로 발동하는데, 그 행을 되돌려놓을 게 아무것도 없어요.

양쪽이 똑같이 불완전하면 아무 일도 안 일어나요. 아무 일도 안 일어나면 적어도
안전하죠. 데이터를 날리는 건 한쪽만 완전해질 때예요. 정리 패스를 두고 "응답이
완전하든 아니든 안전하게 돌릴 수 있다"고 말하는 건 언제 돌려도 되는지를 말하는
거지, 돌았을 때 무슨 일을 하는지를 말하는 게 아니에요. 항상 돌 수 있는 패스는
항상 지울 수도 있어요.

이걸 알아채기 어렵게 만든 건 하드 삭제예요. tombstone도 없고 소프트 삭제된 행도
없으니, 사용자가 이벤트가 사라졌다고 말해도 짚어볼 흔적이 남지 않아요.

단서는 피해 정도가 사람마다 갈린다는 점이에요. 같은 코드 경로를 탄 두 사람 중 한
명은 필드 몇 개만 잃고 다른 한 명은 행 전체를 잃는다면, 버그가 두 개라기보다
한쪽 요청만 충족하는 단계가 하나 있다고 보는 게 맞아요.

어디까지 확인한 건지는 분명히 해둘게요. 삭제 경로와 삽입 경로를 읽고 세운
가설이지, 끝까지 재현해본 건 아니에요. 반증은 간단해요. 사라진 행이 삭제되던
시점에 동기화 응답 안에 있었나? 있었다면 이 설명은 틀렸고, 삽입을 막는 다른
원인이 있는 거예요.

## 정리하면

"정리해야 할 행"은 하나의 범주가 아니에요. Stale record는 API 응답에 없는
것 -- 원본에서 삭제된 거예요. Orphan record는 응답에는 있지만 부모가 없는
것 -- 구조적으로 깨진 거고요. 둘을 따로, 올바른 순서로(stale 먼저, orphan
나중에) 처리하고, 부모 없이 취소되지 않은 instance는 깨진 게 아니라 의도된
상태라는 부분 접근 케이스를 존중하세요.

그리고 나중에 삭제/삽입 짝 중 한쪽의 발동 조건을 바꾸게 되면, 다른 쪽도 같이
바꿔야 해요. 응답에 더 이상 기대지 않는 정리는 아무도 되돌려놓지 않을 행까지
태연히 지워버리거든요.
