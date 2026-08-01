---
title: 멱등 부트스트랩 재시도를 위한 emitAsync 스탬프 게이팅
description: >-
  큐로 sync emit 후 "완료" 스탬프를 찍는 부트스트랩은 Redis가 잠깐 끊기면 다운스트림이 조용히 비어요. emitAsync가
  enqueue 승인에 스탬프를 게이트해줘요.
date: 2026-04-28T00:00:00.000Z
updated: '2026-08-02'
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
source_updated: '2026-08-02'
translation_date: '2026-07-31'
---

예전에 다뤘던 부트스트랩 경로가 Postgres에 행을 쓰고, 행마다 이벤트를 큐
리스너로 fire-and-forget했고, 그 다음에 `syncedAt` sentinel을 스탬프했어요.
코드가 맞아 보였어요. 그런데 Redis가 잠깐 끊겼을 때 리스너의 `queue.add`가
허공으로 reject됐고(emit이 sync fire-and-forget이라 promise가 detached됐거든요)
스탬프는 그대로 떨어졌어요. 다음 호출은 스탬프에서 short-circuit해서 다시
fan-out하지 않았고, 다운스트림 검색 인덱스는 비어 있는 채로 남았어요. 사용자들이
검색하면 zero results였는데 어디에도 예외가 표면화되지 않았어요.

## 조용한 실패가 펼쳐지는 방식

큐로 fan-out한 다음 "완료" sentinel을 쓰는 부트스트랩 경로는, emit이 sync
fire-and-forget이면 조용히 실패하는 구멍이 하나 생겨요.

1. 서비스가 DB에 행을 써요.
2. 서비스가 행마다 `eventEmitter.emit('topic', evt)`를 루프 돌려요.
   `emit`은 sync고 리스너 return을 await하지 **않아요**. 리스너는
   `await queue.add(...)`를 하지만, 그 promise가 detached돼요.
3. 서비스가 `bootstrapped_at = now()`를 써요.
4. 리스너의 `queue.add`가 reject (Redis 도달 불가). Promise가 어디로도
   reject되지 않고, 서비스는 이미 스탬프를 commit했어요.
5. 다음 요청이 `bootstrapped_at IS NOT NULL`을 보고 "로컬 상태에서 읽기"로
   short-circuit해서 다시 fan-out하지 않아요. 다운스트림 시스템(검색 인덱스,
   캐시, audit log)이 그 행들에 대해 영구적으로 stale해져요.

DB 행은 맞고 sentinel도 set돼 있는데, 다운스트림은 비어 있고 아무것도 던지지
않아요. 버그는 사용자가 나중에 검색해서 zero results를 받을 때만 드러나고,
그때쯤이면 원래 Redis 끊김의 로그는 이미 사라진 지 오래예요.

## 해결: emit을 awaitable로 만들기

`EventEmitter2.emitAsync`를 쓰고 sentinel 쓰기를 그 resolution에 게이트
해요. 계약이 이렇게 돼요: 모든 리스너의 returned promise가 resolve된
경우에만 스탬프가 떨어져요. 어디서든 reject되면 스탬프가 un-set으로 남아서
다음 호출이 부트스트랩 전체를 재시도해요.

아래 예제는 그 형태만 남긴 축약 버전이고 이름은 중립적으로 바꿨어요. tenant별
sync source의 행들이 "synced" 스탬프가 떨어지기 전에 큐까지 도달해야 하는
구조예요.

### 1단계: Publisher가 `*Async` variant를 노출

```ts
@Injectable()
export class RecordEventPublisher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  // Sync fire-and-forget — 호출자가 신경 쓰지 않는 핫패스에서 OK
  publishRecordUpserted(tenantId: number, recordId: string): void {
    this.eventEmitter.emit("record.upserted", { tenantId, recordId });
  }

  // Awaited — 모든 리스너의 returned promise가 resolve할 때까지 호출자가 block
  async publishRecordsBulkUpsertedAsync(
    tenantId: number,
    sourceId: number,
    recordIds: string[]
  ): Promise<void> {
    await this.eventEmitter.emitAsync("record.bulk.upserted", {
      tenantId,
      sourceId,
      recordIds
    });
  }
}
```

`emitAsync`는 리스너들의 return value를 `Promise.all`로 모아요. 그래서 각
리스너가 돌려준 값이 담긴 array로 resolve되죠. 어떤 리스너든 어디서든
reject하면 전체가 reject돼요.

### 2단계: 호출자가 emit을 await하고 그 다음 스탬프

```ts
async syncFromProvider(source: SyncSource): Promise<void> {
  const records = await this.provider.fetchRecords(source.id);
  if (records.length > 0) {
    await this.recordsService.bulkUpsert(source.tenantId, records);
    // Awaited — 리스너의 queue.add가 reject하면 이게 reject되고, 아래 스탬프가
    // 안 떨어지고, recordsSyncedAt이 NULL로 남아서 다음 호출이 부트스트랩
    // 전체를 재시도.
    await this.recordEvents.publishRecordsBulkUpsertedAsync(
      source.tenantId,
      source.id,
      records.map((r) => r.id),
    );
  }
  // emit 성공일 때만 떨어짐 — enqueue 승인에 sentinel 게이트
  await this.sourceRepo.update(
    { id: source.id },
    { recordsSyncedAt: new Date() },
  );
}
```

### 3단계: 리스너가 awaited handler 안에서 일을 함

```ts
@OnEvent('record.bulk.upserted')
async onRecordsBulkUpserted(evt: RecordsBulkUpsertedEvent): Promise<void> {
  if (evt.recordIds.length === 0) return;
  await this.queue.addBulk(/* N chunked jobs */);
}
```

`async` handler 안에서 promise를 return하거나 `await`해야 `emitAsync`가 실제로
기다려요. promise를 그냥 흘려보내는 handler(`void` 반환, 안에서
fire-and-forget)는 게이팅을 무력화해요.

## 핵심 포인트

- **게이팅 계약:** sentinel 쓰기는 `await emitAsync`가 resolve할 때만
  떨어져요. 어떤 리스너에서든 reject되면 sentinel이 un-set으로 남고, 그래서
  다음 호출이 재시도해요.
- **멱등성은 필수.** 재시도가 안전해야 하니까 `bulkUpsert`에는 `ON CONFLICT
  DO UPDATE`가 필요하고, 다운스트림 쓰기도 plain insert가 아니라 upsert
  semantics여야 해요. 멱등성이 없으면 재시도가 갭을 메우는 대신 중복을
  만들어요.
- **일시적 실패라는 전제도 필수.** 이건 제가 한 번도 적어두지 않았던
  전제예요. "스탬프가 안 찍혔으니 다음 호출이 재시도한다"는 다음 호출이
  성공할 가망이 있을 때만 갭을 메워요. Redis가 잠깐 안 닿는 상황은 여기
  해당하고, 매번 똑같이 터지는 실패는 아니에요. 그때는 게이트가 똑같이 망할
  작업을 영원히 다시 돌려요. 멱등성과 일시성은 서로 다른 요구사항인데, 저는
  앞의 하나만 확인했어요.
- **네이밍 컨벤션.** publisher 메서드의 `*Async` 접미사는 호출자가 `await`
  해야 한다는 신호예요. Sync `publishX`와 async `publishXAsync`는 같은
  publisher에 공존할 수 있어요. 호출 사이트마다 신경 쓰는 게 다르니까요.
- **빈 페이로드 엣지 케이스.** 빈 입력에서 emit을 건너뛰는 건 쉬운 쪽이에요.
  enqueue할 일이 없으니까요. 어려운 쪽은 그래도 스탬프를 찍을지예요. 빈
  입력에 스탬프를 찍으면 source에 정말 데이터가 없을 때 무의미한 re-fetch를
  피하고, 안 찍으면 fan-out할 것도 없는 재시도를 강제해요. 둘 다 나름 근거가
  있으니 하나 골라서 적어두면 돼요.

## 리스너 측 swallow가 게이트를 조용히 깨요

어떤 `@OnEvent` handler를 `async`로 선언해놓고 안에서 `queue.add`를 `await`
없이 실행하면, handler가 즉시 `undefined`를 돌려줘요. enqueue는 아직 날아가는
중인데 `emitAsync` 입장에서는 리스너가 이미 끝난 걸로 보이는 거예요. 더 안
좋은 건, 나중에 터지는 reject가 게이팅 경로에는 아무 흔적도 안 남기고
unhandled rejection으로 끝난다는 점이에요.

고치는 건 기계적이에요. awaited-emit handler는 전부 의존하는 작업을 `return
await`(또는 그냥 `await`) 해야 해요. 계약을 못 박아두는 건 `queue.add`가
reject하도록 mock하고 publisher의 `*Async` 메서드가 reject하는지 assert하는
unit test예요.

## 매번 똑같이 터지는 실패는 게이트를 영구 루프로 만들어요

이 패턴을 넣고 세 달쯤 지나서, 같은 부트스트랩 경로가 게이트로 막으려던 바로
그 조용한 stale 버그를 반대편에서 다시 만들어냈어요. 게이트 자체는 한 번도
오작동한 적이 없어서 더 당황스러웠어요.

`bulkUpsert`는 행 하나당 param 여섯 개를 묶어서 `INSERT ... ON CONFLICT`
한 방을 만들었어요. 그래서 행이 10,922개를 넘는 source는 Postgres의
bind-parameter 상한 65,535를 넘겨서 그대로 터졌어요. 이 상한은 튜닝할 수 있는
값이 아니에요. wire protocol의 Bind 메시지가 param 개수를 `Int16`으로 세거든요.
그래서 statement 하나가 그보다 많이 실어 나를 방법이 없어요. 그리고 이 실패는
*결정적*이에요. 같은 입력이면 매번 같은 자리에서 같게 터져요. 게이트는 약속한
그대로 동작했어요. `recordsSyncedAt`은 `NULL`로 남았고, 다음 호출이 재시도했고,
재시도는 업스트림 provider에서 다시 받아와서 또 터졌어요. 모든 요청에서,
끝없이요.

이걸 안 보이게 만든 건 호출자 쪽의 error isolation이었어요. 그것만 떼어놓고
보면 맞는 코드였고요.

```ts
// 망가진 source 하나 때문에 endpoint 전체가 500 나지 않도록 빈 껍데기로 degrade
const result = await this.bootstrapOne(tenantId, sourceId, source).catch(
  (err) => {
    this.logger.error(`Bootstrap failed for tenant=${tenantId}: ${err.message}`);
    return { tenantId, sourceId, label: source.label, records: [] };
  },
);
```

게이트와 합쳐지면, 각각은 멀쩡한 이 두 조각이 어느 쪽을 리뷰하든 예측하기
힘든 상태를 만들어요. 영향받은 tenant는 행을 영원히 하나도 못 받고, 요청
때마다 업스트림 fetch를 통째로 태우고, 남는 흔적이라고는 너무 자주 찍히는
바람에 오히려 잠깐 끊긴 것처럼 읽히는 로그 한 줄뿐이에요.

결국 고른 수정은 게이트를 그대로 두고 결정성 쪽을 건드리는 거였어요. upsert를
chunk로 쪼개서 bind-parameter 상한에 아예 닿지 않게 만들었어요. 처음부터
넣어둘 만한 진단이 두 개 보이는데, 그때 있었으면 좋았겠다 싶어요.

- **재시도 횟수를 세기.** 같은 키에서 sentinel을 N번 연속 un-set으로 남긴
  게이트는 불안정한 의존성이 아니라 결정적 실패를 신고하고 있는 거예요. 작은
  N을 넘기면 severity를 올려서 로그를 찍었다면 이건 바로 시끄러워졌을 거예요.
- **`catch`가 구분할 수 있는지 묻기.** "token 만료"(일시적, 사용자가 고칠 수
  있음)와 "한 statement에 담기엔 입력이 너무 큼"(결정적, 코드 버그)을 똑같이
  degrade시키는 `catch`는 게이트가 의존하는 바로 그 구분을 지워버려요.

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
사이의 sentinel)이지 atomicity가 아니에요. txn을 씌워도 게이팅 문제는 안
고쳐지고, 큐 서버로 나가는 `await`를 가로질러 row lock을 붙잡는 long-running
transaction만 늘어나요. 좋은 습관이 아니에요.

## 언제 사용할까

- Sentinel이 다시 fan-out할지 결정하는 one-shot 부트스트랩 경로 (TTL
  스탬프, "first sync done" 플래그, materialized-view refresh marker).
- 업스트림 부작용(DB 쓰기)이 다운스트림 부작용(큐 enqueue)보다 먼저 와야
  하지만, 다운스트림의 실패가 "완료" 선언을 막아야 하는 모든 흐름.
- 호출자가 작업 완료를 주장하기 전에 모든 리스너가 성공해야 하는
  multi-listener fan-out.

## 언제 사용하지 말까

- 핫패스 single-emit fire-and-forget. 리스너 실패를 다른 수단(예: 폴링
  루프의 행별 재시도)으로 복구할 수 있다면, 저레이턴시 케이스에는 `emit`이
  여전히 맞는 선택이에요.
- 리스너 작업이 느려서 호출자가 거기서 block될 여유가 없는 케이스. 이런 건
  빠른 acknowledgement 리스너와 별도 느린 worker로 쪼개요.
- 멱등 재시도 경로가 없을 때. 멱등성 없는 게이팅은 버그 하나(조용한 stale
  상태)를 다른 버그(재시도 시 중복 행)로 바꾸는 것뿐이니까요.
- 게이트가 걸린 경로의 실패가 일시적이지 않고 결정적일 때. 스탬프가 안 찍힌
  게이트는 다음 호출이 메울 가망이 있는 갭만 메워주니까, 같은 입력에서
  똑같이 재현되는 실패는 게이트를 영구 재시도 루프로 바꿔버려요. 위의 "매번
  똑같이 터지는 실패는 게이트를 영구 루프로 만들어요" 참고.

## 정리

Sync emit + post-emit 스탬프는 코드 리뷰에서 맞아 보이고 모든 happy-path
테스트를 통과하는 패턴이에요. 버그는 외부 의존성이 정확히 잘못된 순간에
끊길 때만 나타나요. `emitAsync` + 리스너 `await` + emit 후 스탬프가 그
silent failure를 깨끗한 재시도로 바꿔주는 게이트를 구성해요. 부트스트랩
경로가 이미 멱등하다는 전제 하에요. 지금이라면 하나를 더 붙이겠어요. 게이트로
막으려는 실패가 정말 일시적인지도 같이 확인하는 거예요. 재시도 루프는 언젠가
메울 수 있는 갭만 메워주는데, 저는 그걸 느린 길로 배웠어요.
