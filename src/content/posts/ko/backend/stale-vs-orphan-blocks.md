---
title: 캘린더 동기화에서 Stale Record와 Orphan Record의 차이
description: Google Calendar API 동기화가 남기는 두 종류의 찌꺼기 행은 겉보기에 똑같지만 처리 방법은 정반대예요
date: 2026-02-05T00:00:00.000Z
updated: '2026-08-02'
tags:
  - backend
  - sync
  - google-calendar
category: backend
draft: false
lang: ko
source_lang: en
source_slug: stale-vs-orphan-blocks
source_updated: '2026-08-02'
translation_date: '2026-02-12'
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

## 정리하면

"정리해야 할 행"은 하나의 범주가 아니에요. Stale record는 API 응답에 없는
것 -- 원본에서 삭제된 거예요. Orphan record는 응답에는 있지만 부모가 없는
것 -- 구조적으로 깨진 거고요. 둘을 따로, 올바른 순서로(stale 먼저, orphan
나중에) 처리하고, 부모 없이 취소되지 않은 instance는 깨진 게 아니라 의도된
상태라는 부분 접근 케이스를 존중하세요.
