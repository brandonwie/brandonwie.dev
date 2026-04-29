---
title: 멱등 부트스트랩 재시도를 위한 emitAsync 스탬프 게이팅
description: >-
  큐로 sync emit 후 "완료" 스탬프를 찍는 부트스트랩은 Redis가 잠깐 끊기면 다운스트림이 조용히 비어요. emitAsync가
  enqueue 승인에 스탬프를 게이트해줘요.
date: 2026-04-28T00:00:00.000Z
updated: '2026-04-29'
tags:
  - backend
  - nestjs
  - eventemitter2
  - bullmq
  - idempotency
category: backend
draft: false
lang: ko
source_lang: en
source_slug: emitasync-stamp-gating
source_updated: '2026-04-29'
translation_date: '2026-04-29'
---

`ContactCacheService.refreshFromGoogle`이 Postgres에 contacts를 쓰고,
이메일별 이벤트를 큐 리스너로 fire-and-forget 했고, 그 다음에
`contactsSyncedAt = now()`를 스탬프했어요. 코드가 맞아 보였어요. 그런데
Redis가 잠깐 끊겼을 때 리스너의 `queue.add`가 허공으로 reject 됐어요 —
emit이 sync fire-and-forget이라 promise가 detached 됐거든요 — 그리고
스탬프는 그대로 떨어졌어요. 다음 호출은 스탬프에서 short-circuit해서
다시 fan-out하지 않았고, 다운스트림 Typesense 인덱스는 비어 있는 채로
남았어요. 사용자들이 검색하면 zero results였는데 어디에도 예외가
표면화되지 않았어요.

## 조용한 실패가 펼쳐지는 방식

큐로 fan-out하고 그 다음에 "완료" sentinel을 쓰는 부트스트랩 경로는 emit이
sync fire-and-forget일 때 silent failure mode를 가져요:

1. 서비스가 DB에 행을 써요.
2. 서비스가 행마다 `eventEmitter.emit('topic', evt)`를 루프 돌려요.
   `emit`은 sync고 리스너 return을 await하지 **않아요**. 리스너는
   `await queue.add(...)` 하는데 — 그 promise가 detached 돼요.
3. 서비스가 `bootstrapped_at = now()`를 써요.
4. 리스너의 `queue.add`가 reject (Redis 도달 불가). Promise가 어디로도
   reject되지 않고, 서비스는 이미 스탬프를 commit 했어요.
5. 다음 요청이 `bootstrapped_at IS NOT NULL`을 보고 "로컬 상태에서 읽기"로
   short-circuit해서 다시 fan-out하지 않아요. 다운스트림 시스템(Typesense,
   검색 인덱스, 캐시, audit log)이 그 행들에 대해 영구적으로 stale
   해져요.

DB 행은 맞아요. Sentinel은 set돼 있어요. 다운스트림은 비어 있어요.
어디에도 예외가 표면화 안 됐어요. 버그는 사용자가 나중에 검색해서 zero
results를 받을 때만 보여요 — 그때쯤 원래 Redis 끊김의 로그는 이미
사라진 지 오래예요.

## 해결: emit을 awaitable로 만들기

`EventEmitter2.emitAsync`를 쓰고 sentinel 쓰기를 그 resolution에 게이트
해요. 계약이 이렇게 돼요: 모든 리스너의 returned promise가 resolve된
경우에만 스탬프가 떨어져요. 어디서든 reject되면 스탬프가 un-set로 남아서
다음 호출이 부트스트랩 전체를 재시도해요.

### 1단계: Publisher가 `*Async` variant를 노출

```ts
@Injectable()
export class ContactEventPublisher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  // Sync fire-and-forget — 호출자가 신경 쓰지 않는 핫패스에서 OK
  publishContactUpserted(userId: number, email: string): void {
    this.eventEmitter.emit("contact.upserted", { userId, email });
  }

  // Awaited — 모든 리스너의 returned promise가 resolve할 때까지 호출자가 block
  async publishContactsBulkUpsertedAsync(
    userId: number,
    emails: string[]
  ): Promise<void> {
    await this.eventEmitter.emitAsync("contact.bulk.upserted", {
      userId,
      emails
    });
  }
}
```

`emitAsync`는 `Promise<unknown[]>`을 반환해요 — 모든 리스너의 return value의
resolved array. 어떤 리스너든 어디서든 reject하면 전체가 reject 돼요.

### 2단계: 호출자가 emit을 await하고 그 다음 스탬프

```ts
async refreshFromGoogle(integration: Integration): Promise<void> {
  const contacts = await this.googlePeople.getContacts(integration.id);
  if (contacts.length > 0) {
    await this.userContactsService.bulkUpsert(integration.userId, contacts);
    // Awaited — 리스너의 queue.add가 reject하면 이게 reject되고, 아래 스탬프가
    // 안 떨어지고, integration의 contactsSyncedAt이 NULL로 남아서 다음 호출이
    // 부트스트랩 전체를 재시도.
    await this.contactEventPublisher.publishContactsBulkUpsertedAsync(
      integration.userId,
      integration.id,
      contacts.map(c => c.email),
    );
  }
  // emit 성공일 때만 떨어짐 — enqueue 승인에 sentinel 게이트
  await this.integrationRepo.update(
    { id: integration.id },
    { contactsSyncedAt: new Date() },
  );
}
```

### 3단계: 리스너가 awaited handler 안에서 일을 함

```ts
@OnEvent('contact.bulk.upserted')
async onBulkUpserted(evt: ContactsBulkUpsertedEvent): Promise<void> {
  if (evt.emails.length === 0) return;
  await this.queue.addBulk(/* N chunked jobs */);
}
```

Promise를 return하거나 (`async` handler 안에서 `await`하거나) 하는 게
`emitAsync`가 실제로 기다리게 만드는 거예요. Promise를 swallow하는 handler
(`void` return, fire-and-forget inside)는 게이팅을 무력화해요.

## 핵심 포인트

- **게이팅 계약:** sentinel 쓰기는 `await emitAsync`가 resolve할 때만
  떨어져요. 어떤 리스너에서든 reject되면 sentinel이 un-set로 남아 → 다음
  호출이 재시도.
- **멱등성은 필수.** 재시도가 안전해야 해요 — `bulkUpsert`는 `ON CONFLICT
  DO UPDATE`가 필요하고, 다운스트림 upsert는 `action: 'upsert'`가 필요해요.
  멱등성 없으면 재시도가 갭을 치유하는 대신 중복을 만들어요.
- **네이밍 컨벤션.** Publisher 메서드의 `*Async` 접미사는 호출자가 `await`
  해야 한다고 신호를 줘요. Sync `publishX`와 async `publishXAsync`는 같은
  publisher에 공존할 수 있어요 — 다른 호출 사이트는 다른 걸 신경 써요.
- **빈 페이로드 엣지 케이스.** 빈 입력에는 emit을 스킵하지만(enqueue할 일
  없음), 그래도 스탬프할지를 의도적으로 결정해요. 빈 입력에 스탬프하면
  source가 정말 데이터 없을 때 무의미한 re-fetch를 피할 수 있고, 스탬프 안
  하면 fan-out도 없는 재시도를 강제해요. 하나 골라서 결정을 문서화해요.

## 리스너 측 swallow가 게이트를 조용히 깨요

어떤 `@OnEvent` handler가 `async`로 선언됐지만 body가 `queue.add`를
`await` 없이 실행하면, handler는 즉시 `undefined`를 return하고 `emitAsync`는
enqueue가 진행 중인데도 resolved listener를 봐요. 더 나쁜 건: post-resolve
rejection이 게이팅 경로에 visible error 없이 unhandled rejection이 돼요.

수정은 mechanical — 모든 awaited-emit handler는 의존하는 작업을 `return
await` (또는 그냥 `await`)해야 해요. `queue.add`가 reject하도록 mock하고
publisher의 `*Async` 메서드가 reject하는 걸 assert하는 unit test로 계약을
못 박아요.

## 같은 토픽의 여러 리스너

`emitAsync`는 모든 리스너를 기다려요. 같은 handler 안에서 느린 IO를 하는
다운스트림 컨슈머(예: analytics)를 추가하면, 모든 부트스트랩 호출이 그것에
block돼요. 느린 컨슈머를 다른 토픽으로 옮기거나, awaited handler 안에서
별도 sync `emit`으로 발사해서 리스너-of-리스너 decoupling을 명시적으로
만들어요.

## TypeORM 트랜잭션으로 감싸는 건 보통 답이 아니에요

흔한 충동: "DB 쓰기 + sentinel을 txn에서 atomic하게 만들자." 부트스트랩
케이스에서는 보통 emit 전에 DB 쓰기가 하나뿐이라 txn이 단일 statement를
감싸요(이미 Postgres autocommit으로 atomic). 진짜 버그는 sequencing(쓰기들
사이의 sentinel)이지 atomicity가 아니에요. Txn 추가는 게이팅 문제를 안
고치고 큐 서버로의 `await`를 가로질러 row lock을 잡는 long-running
transaction을 추가해요 — bad practice.

## 언제 사용할까

- Sentinel이 다시 fan-out할지 결정하는 one-shot 부트스트랩 경로 (TTL
  스탬프, "first sync done" 플래그, materialized-view refresh marker).
- 업스트림 부작용(DB 쓰기)이 다운스트림 부작용(큐 enqueue)보다 먼저 와야
  하지만, 다운스트림의 실패가 "완료" 선언을 막아야 하는 모든 흐름.
- 호출자가 작업 완료를 주장하기 전에 모든 리스너가 성공해야 하는
  multi-listener fan-out.

## 언제 사용하지 말까

- 핫패스 single-emit fire-and-forget — 리스너 실패가 다른 수단(예: 폴링
  루프에서 row별 재시도)으로 복구 가능한 저레이턴시 케이스에는 `emit`을
  유지해요.
- 리스너 작업이 느리고 호출자가 거기서 block될 여유가 없는 케이스 —
  빠른 acknowledgement 리스너 + 별도 느린 worker로 분할해요.
- 멱등 재시도 경로가 없을 때 — 멱등성 없는 게이팅은 한 버그(silent
  stale 상태)를 다른 버그(재시도시 중복 행)로 바꾸는 것뿐이에요.

## 정리

Sync emit + post-emit 스탬프는 코드 리뷰에서 맞아 보이고 모든 happy-path
테스트를 통과하는 패턴이에요. 버그는 외부 의존성이 정확히 잘못된 순간에
끊길 때만 나타나요. `emitAsync` + 리스너 `await` + emit 후 스탬프가 그
silent failure를 깨끗한 재시도로 바꿔주는 게이트를 구성해요 — 부트스트랩
경로가 멱등하다는 전제 하에요(이미 그래야 하긴 하죠).
