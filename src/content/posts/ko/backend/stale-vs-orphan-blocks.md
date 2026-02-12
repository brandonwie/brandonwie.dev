---
title: "캘린더 동기화에서 Stale Block과 Orphan Block의 차이"
description: "Google Calendar API 동기화 시 발생하는 두 가지 정리 시나리오와 각각의 처리 전략"
date: 2026-02-05T00:00:00.000Z
updated: 2026-02-05T00:00:00.000Z
tags:
  - backend
  - sync
  - google-calendar
category: backend
draft: false
lang: ko
source_lang: en
source_slug: stale-vs-orphan-blocks
source_updated: "2026-02-05"
translation_date: "2026-02-12"
references:
  - url: "https://developers.google.com/calendar/api/guides/sync"
    title: Google Calendar API - Sync Events
    type: official
---

사용자 캘린더에 유령 이벤트가 나타나고 있었어요 -- Google에서 삭제된 이벤트가
앱에는 여전히 표시되고 있었죠. 동시에 반복 이벤트 인스턴스가 더 이상 존재하지
않는 부모 이벤트를 참조하면서 동기화가 완전히 깨졌어요. 두 문제 모두 "오래된
데이터"처럼 보였지만, 완전히 다른 수정이 필요했어요.

Google Calendar API에서 캘린더 데이터를 동기화하면, 로컬 데이터베이스에
현실을 반영하지 않는 블록이 쌓여요. Google에서 삭제된 이벤트가 로컬에 남아
있고, 반복 이벤트 인스턴스가 더 이상 존재하지 않는 부모를 참조해요. 이 두
가지 정리 시나리오를 구분하지 않고 올바른 순서로 처리하지 않으면, 동기화가
댕글링 참조, 유령 이벤트, 데이터 손상을 만들어요.

## 핵심 구분

두 문제는 표면적으로 비슷해요 -- 둘 다 "삭제해야 할 블록"을 만들어요.
하지만 감지 로직이 근본적으로 달라요.

| 개념             | 정의                                                | 트리거                 |
| ---------------- | --------------------------------------------------- | ---------------------- |
| **Stale Block**  | Google 응답에 없는 모든 캘린더 블록                 | Google에서 이벤트 삭제 |
| **Orphan Block** | 유효한 부모 없이 응답에 있는 T 블록 (반복 인스턴스) | 부모 삭제/수정         |

핵심 차이는 **API 응답에서의 존재 여부**예요:

```text
Google API Response
├── Contains event
│   ├── Has parent → Link (normal case)
│   └── No parent → Orphan (needs cleanup)
└── Does NOT contain event → Stale (needs cleanup)
```

처음에 둘을 동일하게 처리했는데, 누락된 삭제와 오탐이 발생했어요. Stale
블록은 응답에 없어요. Orphan 블록은 응답에 있지만 부모가 없어요. 이 구분이
모든 것을 결정해요.

## 어려웠던 점들

여러 엣지 케이스가 예상보다 어렵게 만들었어요.

orphan 감지를 stale 정리보다 먼저 실행하면 작업 순서 버그가 발생했어요. T
블록이 부모에 연결된 후, stale 정리가 그 부모를 삭제해서 댕글링 `originalId`
참조가 생기고 이후 동기화가 깨졌어요.

부분 접근 엣지 케이스도 있었어요. 부모 없이 취소된 T 블록은 orphan이에요.
하지만 부모 없이 취소되지 않은 T 블록은 부분 캘린더 접근을 나타낼 수 있어요
-- 사용자가 인스턴스는 볼 수 있지만 시리즈는 못 보는 경우죠. 이것을
삭제하면 공유 캘린더에서 데이터 손실이 발생했어요.

대규모(100k+ 블록)에서는 기존 블록과 Google 응답 간의 단순 O(n\*m) 비교가
너무 느렸어요. Set 기반 O(1) 조회와 배치 삭제로 전환해서 성능 문제를
해결했어요.

## Stale Block 정리

Stale 정리는 전체 동기화에서만 실행돼요 (syncToken이 없거나 410 에러 후
재동기화). 전체 동기화에서 Google은 현재 모든 이벤트를 반환하므로, 부재는
이벤트가 삭제되었다는 의미예요.

```typescript
// O(n) comparison using Set-based lookup
const googleGcalIds = new Set(googleEvents.map((e) => e.id));

for (const block of existingBlocks) {
  if (!googleGcalIds.has(block.gcalId)) {
    staleBlockIds.push(block.id);
  }
}
```

Stale 정리는 모든 블록 유형을 처리해요 -- 부모, 독립형, T 블록 모두. T
블록이 응답에 없으면, Google에서 삭제된 거예요.

## Orphan Block 감지

Orphan 감지는 모든 동기화(증분 및 전체)에서 실행돼요. T 블록(반복 인스턴스)이
Google에서 반환될 수 있지만, 부모 블록이 더 이상 존재하지 않거나 유효하지
않을 수 있어요.

Orphan의 조건은: T 블록이 Google 응답에 있고, 부모 블록이 데이터베이스에
없으며, T 블록 상태가 CANCELLED인 경우예요.

```typescript
// Only CANCELLED instances without parents are true orphans
if (block.itemStatus === BlockStatus.Deleted && !parentBlock) {
  orphansToDelete.push(block.id);
}
```

부모 없이 취소되지 않은 T 블록은 부분 캘린더 접근을 나타낼 수 있으므로
유지해요.

## 순서가 중요해요

바로 이 부분에서 저도 당했어요. Stale 정리가 orphan 감지보다 먼저
실행되어야 해요:

1. Stale 정리가 Google 응답에 없는 블록을 삭제
2. 후처리가 응답에 있는 T 블록을 부모에 연결
3. 순서가 바뀌면: 후처리가 T 블록을 부모에 연결한 후, stale 정리가 그
   부모를 삭제해서 댕글링 `originalId` 참조가 생김

전체 결정 테이블:

| 시나리오                                       | 처리자     | 액션               |
| ---------------------------------------------- | ---------- | ------------------ |
| 블록이 응답에 없음                             | Stale 정리 | 하드 삭제          |
| T 블록이 응답에 있고, 부모 존재                | 후처리     | 부모에 연결        |
| T 블록이 응답에 있고, 부모 없음, CANCELLED     | 후처리     | 하드 삭제 (orphan) |
| T 블록이 응답에 있고, 부모 없음, NOT cancelled | 후처리     | 유지 (부분 접근)   |

## 대규모 성능

100k+ 블록이 있는 사용자의 경우, 세 가지 최적화가 필수예요:

1. **최소 SELECT** -- 필요한 필드만 조회 (id, gcalId)
2. **Set 기반 조회** -- O(n) 검색 대신 O(1) 비교
3. **배치 DELETE** -- PostgreSQL 파라미터 제한 준수 (~32k)

```typescript
const BATCH_SIZE = 100;
for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
  await blockRepo.delete(staleIds.slice(i, i + BATCH_SIZE));
}
```

## 실전 가이드

Google이 완전한 이벤트 세트를 반환하는 전체 동기화(410 후 재동기화 또는 초기
동기화)에서 stale 정리를 사용하세요. 부모 시리즈가 인스턴스와 독립적으로
수정되거나 삭제될 수 있으므로, 반복 이벤트를 처리하는 모든 동기화에서 orphan
감지를 사용하세요.

유효한 syncToken이 있는 증분 동기화에서는 stale 정리를 실행하지 마세요.
Google은 증분 응답에서 변경된 이벤트만 반환하고, 모든 이벤트를 반환하지
않아요. 증분 응답에서의 부재는 삭제를 의미하지 않아요 -- 이벤트가 변경되지
않았다는 의미예요. 이것을 잘못 처리하면 존재해야 할 데이터가 삭제돼요.

시스템이 반복 이벤트를 지원하지 않으면 (T 블록 없음, 부모-자식 관계 없음),
orphan 감지는 필요 없어요. 건너뛰세요.
