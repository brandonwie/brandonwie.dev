---
title: Typesense documents/import의 바이트 인식 vs 카운트 기반 청킹
description: >-
  Typesense bulk import를 위한 두 가지 청킹 전략. 잘못된 걸 고르면 어떤 파워 유저가 멀티-MB 문서를 만드는 날 조용히
  실패해요.
date: 2026-04-28T00:00:00.000Z
updated: '2026-04-29'
tags:
  - backend
  - typesense
  - batch
  - search
category: backend
draft: false
lang: ko
source_lang: en
source_slug: typesense-import-byte-aware-chunking
source_updated: '2026-04-29'
translation_date: '2026-04-29'
---

contact-bulk-upsert 워커는 `CHUNK_SIZE = 500`으로 출시해서 몇 달 동안 잘
돌았어요 — 작은 고정 문자열 문서에 Typesense 40 MB import 캡 아래로
여유로운 헤드룸. 그런데 calendar-block 워커가 같은 청킹 전략을 쓰면서
산수가 깨졌어요. 단일 block이 멀티-MB 리치텍스트 노트를 가질 수 있는데,
청크 하나가 캡을 넘는 순간 import 전체가 실패하고 부트스트랩이 멈췄어요.
해결은 카운트를 줄이는 게 아니라 전략을 통째로 바꾸는 거였어요.

## 두 가지 전략

Typesense의 `documents/import` 엔드포인트는 하드 캡(이 글 작성 시점 40 MB
— 사용 중인 버전과 대조해보세요)이 있는 JSON body를 받아요. N개 문서를
배치 동기화하는 서비스라면 청킹 전략이 모든 HTTP body를 그 캡 아래로
유지해야 해요. 자연스러운 두 가지 전략이 있는데, 실패 모드가 매우 달라요:

| 전략         | 분할 기준                  | 항상 안전한가?            |
| ------------ | -------------------------- | ------------------------- |
| 카운트 기반  | 청크당 고정 N 문서          | `N×최대문서 < 캡`일 때만    |
| 바이트 인식  | 누적 직렬화 크기            | 예 (안전 마진 포함)        |

흔한 실수는 "dev에서 500 docs가 괜찮아 보였다"는 이유로 모든 곳에 카운트
기반을 기본으로 두는 거예요. 그러다 파워 유저가 멀티-MB 노트가 있는 단일
문서를 만들면, 청크가 40 MB를 넘고, 배치 전체가 실패하고, 부트스트랩이
영영 완료되지 않아요.

## 카운트 기반이 괜찮을 때

카운트 기반이 맞는 선택인 경우는 다음을 **모두** 만족할 때예요:

- 문서 형태가 균일 (큰 자유 텍스트나 blob 필드 없음).
- 최악의 단일 문서가 여유롭게 들어감 (예: `< 100 KB`).
- 청크 사이즈 × 최악 문서 크기가 import 캡 아래 한 자릿수 헤드룸을 남김.

연락처가 교과서적인 경우예요. 스키마는 작은 고정 문자열(`email`,
`displayName`, `photoUrl`, `integrationId`). 최악 ~2 KB/doc; 500 × 2 KB =
1 MB; 40 MB 캡. 두 자릿수 헤드룸 — 카운트 기반으로 충분해요:

```ts
const CHUNK_SIZE = 500;
for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
  const chunk = emails.slice(i, i + CHUNK_SIZE);
  await queue.add("contact-bulk-upsert", { emails: chunk });
}
// processor:
await typesense
  .collections("contacts")
  .documents()
  .import(docs, { action: "upsert" });
```

## 바이트 인식이 필요할 때

다음 중 **하나라도** 해당되면 바이트 인식 분할로 전환해요:

- 스키마에 자유 텍스트 필드 있음 (notes, descriptions, embedded markdown).
- 최악의 단일 문서가 캡에 근접할 수 있음.
- 쓰기 시점에 페이로드 크기를 제한할 수 없음 (사용자 생성 콘텐츠).

Calendar block이 셋 다 해당돼요. 단일 block의 노트가 MB 단위가 될 수
있어요. 200 docs × 최악 200 KB = 40 MB, 단일 outlier가 나오기도 전에. —
카운트 기반이라면 동전 던지기예요. 바이트 인식은 누적 직렬화 크기를
추적하면서 캡 전에 분할해요:

```ts
import { Buffer } from "node:buffer";

const MAX_IMPORT_BYTES = 30 * 1024 * 1024; // 30 MB — 40 MB 캡 아래 25 % 마진

export function splitByByteSize<T extends { id?: string }>(
  docs: T[],
  maxBytes: number = MAX_IMPORT_BYTES
): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;

  for (const doc of docs) {
    const docBytes = Buffer.byteLength(JSON.stringify(doc), "utf8");

    if (docBytes > maxBytes) {
      // 단일 문서 오버플로 — 표시하고 스킵; 조용히 truncate 하지 않음.
      Sentry.captureMessage("Document exceeds Typesense import byte limit", {
        level: "warning",
        extra: { docId: doc.id, docBytes, maxBytes }
      });
      continue;
    }

    if (currentBytes + docBytes > maxBytes) {
      groups.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(doc);
    currentBytes += docBytes;
  }

  if (current.length > 0) groups.push(current);
  return groups;
}
```

## 바이트 인식과 카운트 캡을 같이 써요

순수 바이트 인식만 쓰면 작은 문서 수천 개를 담은 거대한 잡 하나가 나올 수
있고, 재시도 granularity에 좋지 않아요 — 한 번 실패하면 그 그룹의 모든 걸
다시 import해야 해요. Robust한 형태는 큐 레이어의 카운트 캡 + 프로세서
안의 바이트 인식 분할이에요:

```ts
// 리스너는 재시도 granularity 위해 잡당 200 IDs로 이미 캡;
// 프로세서의 바이트 분할이 그 200 안의 long-note 꼬리를 처리.
const groups = splitByByteSize(docs);
for (const group of groups) {
  await typesense
    .collections("blocks")
    .documents()
    .import(group, { action: "upsert" });
}
```

카운트 캡(예: 잡당 200 IDs)이 재시도 표면을 제한하고, 그 안의 바이트
분할이 outlier를 처리해요.

## 핵심 포인트

- **안전 마진 두고 캡.** 40 MB Typesense 캡 → 30 MB 예산 사용. UTF-16
  문자열, 프로토콜 프레이밍, gzip 헤더 오버헤드 모두 예산을 갉아먹고,
  `JSON.stringify` 추정은 근사치예요.
- **단일 문서 오버플로는 별도 결정.** 한 문서가 이미 캡을 넘으면 세
  가지 선택지가 있어요: (1) 스킵 + 로깅, (2) 배치 실패, (3) 필드 내용
  truncate. 스킵 + 로깅이 나머지 배치를 보존하면서 outlier를 검색
  동작 손상 없이 표면화해요. 조용히 truncate가 최악이에요 — 검색이
  불완전한 문서를 반환하기 시작하는데 아무도 이유를 몰라요.
- **카운트 캡 + 바이트 인식이 가변 문서에 robust한 형태.** 카운트 캡
  (예: 200)이 재시도 표면을 제한하고, 바이트 분할이 outlier를 처리해요.
- **`Buffer.byteLength(JSON.stringify(doc), 'utf8')`로 추정해요.**
  `string.length`는 쓰지 마세요 — code unit을 세지 바이트를 안 세고,
  UTF-8 multibyte chars가 조용히 underestimate 돼요.
  `JSON.stringify(doc).length`도 같은 이유로 안 돼요.

## 카운트 기반이 테스트를 통과하는 이유

CI seed fixture와 로컬 dev 데이터베이스는 prod가 몇 년 사용 후에 누적하는
멀티-MB 문서를 거의 안 가지고 있어요. 잡당 500 카운트 기반 제한은 모든
테스트를 통과하고 ship되지만, 프로덕션 부트스트랩은 단일 파워 유저 한
명에 day 1부터 실패해요. 유용한 코드 리뷰 휴리스틱: UI에서 textarea나
markdown 에디터로 매핑되는 필드는 unbounded — 바이트 인식 사용해요.

## 잡당 vs import당 캡 혼동

BullMQ 잡은 가져와서 import할 N개 문서의 ID를 carry할 수 있어요. 잡 데이터
페이로드(IDs only)는 작고, 결국 만들어지는 Typesense HTTP body(fetched +
projected docs)가 캡에 부딪쳐요. 둘을 섞지 마세요: 잡 데이터의 카운트
캡은 재시도 표면을 제한하고, 프로세서 안의 바이트 인식 분할은 HTTP body
크기를 제한해요.

## 단일 문서 오버플로 경로의 Sentry 노이즈

오버플로마다 `error` 레벨로 로깅하면 단일 bad 문서가 N번 재시도되며
반복될 때 알림을 폭격해요. `warning` 레벨 + 태그
`area: search-integration, issue: oversized_document`를 쓰면 docId로
그루핑되고 suppress 돼요.

## 호출자가 보지 못하는 silent skip 함정

`splitByByteSize`의 첫 버전은 그냥 `T[][]`만 반환했어요. 오버사이즈 문서는
Sentry 경고와 `continue`로 스킵됐어요. 호출자(`bulkUpsertBlocks`)는 신호가
없어서 — 문서가 Typesense에서 잃어버려졌는데 프로세서 로그에 안 나타나고,
`Bulk upserted N/M blocks`가 일부 문서가 drop돼도 `M = blockIds.length`로
출력해서 차이를 숨겼어요.

PR #858의 proactive review가 이 점을 표시했어요(F-T-3). 반환 형태가 이렇게
진화했어요:

```typescript
export interface SplitByByteSizeResult<T> {
  groups: T[][];
  skippedIds: string[];
}
```

호출자 패턴:

```typescript
const { groups, skippedIds } = splitByByteSize(docs);
for (const group of groups) {
  await import(group, { action: "upsert" });
}
if (skippedIds.length > 0) {
  this.logger.warn(
    `Bulk upsert dropped ${skippedIds.length} oversize block doc(s) ` +
      `user=${userId} calendar=${calendarId} blockIds=[${skippedIds.join(",")}]`
  );
}
this.logger.debug(
  `Bulk upserted ${rows.length - skippedIds.length}/${blockIds.length} blocks ...`
);
```

문서당 Sentry breadcrumb은 깊은 관측성을 위해 유지하고, 프로세서 레벨
tail-warning은 util이 볼 수 없는 전체 `(userId, calendarId,
skippedBlockIds)` 컨텍스트를 가진 배치당 한 줄의 로그를 운영자에게 줘요.
`Bulk upserted` debug 로그가 skipped count를 빼서 비율이 정직해요.

## 일반화 가능한 교훈

조용히 항목을 drop하는 utility는 무엇이 drop됐는지 표면화해야 해요.
합리적인 세 가지 형태:

| 옵션          | 언제                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| Throw         | 호출자가 모든 항목 없이 진행할 수 없을 때                                          |
| Truncate      | 각 항목에 "축약됐지만 유효한" 형태가 있을 때                                       |
| Drop + report | 항목들이 독립적; 부분 완료 허용; 호출자가 복구 결정                                 |

`splitByByteSize`는 옵션 3을 써요. 왜냐하면 (a) block들은 독립적이라 하나
drop이 다른 199개를 막으면 안 되고, (b) note 텍스트 truncate는 검색 동작을
손상시키니까요. 반환 튜플이 옵션 3을 정직하게 만드는 부분이에요 — 그게
없으면 선택은 "조용히 데이터 잃기"로 퇴화해요.

## 언제 사용할까

- **카운트 기반:** 균일 형태 컬렉션 — contacts, user accounts, reference
  codes, bounded 고정 크기 필드를 가진 모든 것.
- **바이트 인식 (카운트 캡과 함께):** 자유 텍스트가 있는 모든 컬렉션 —
  notes, descriptions, blog posts, comments, support tickets, payload
  필드 있는 audit log entries.

## 언제 사용하지 말까

- 둘 다 스킵하고 개별 `documents().upsert`를 문서당 사용 — 볼륨이 자연스럽게
  작을 때(작업당 `< 50 docs`). 청킹은 낮은 볼륨에서 처리량 이득 없이 복잡도만
  추가해요.
- "큰" 필드가 server-side에서 bounded일 때(예: 쓰기 시점 max-length
  validator) 바이트 인식 분할 스킵해요. 넉넉한 캡의 카운트 기반이 더
  단순하고 잘 맞아요.

## 정리

전략 선택은 최악의 문서가 bounded인지에 달려 있어요. 스키마가 작은 상한을
보장하면 카운트 기반이 단순함으로 이겨요. 어떤 필드든 사용자 생성 자유
텍스트라면 바이트 인식이 유일한 안전한 선택이고 — 문서를 스킵하는 순간
호출자에게 그 사실을 표면화해서 손실이 silent하지 않게 만들어요.
