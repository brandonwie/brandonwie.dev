---
title: updatedAt 기반 Staleness Guard
description: >-
  비동기 업데이트(웹훅, 메시지 큐)를 받을 때 소스의 updatedAt과 로컬 타임스탬프를 비교해서 stale 데이터가 최신 변경을 덮어쓰지
  않도록 보호하는 패턴.
date: 2026-02-13T00:00:00.000Z
updated: '2026-08-02'
tags:
  - backend
  - sync
  - webhooks
  - race-condition
category: backend
draft: false
lang: ko
source_lang: en
source_slug: updatedAt-staleness-guard
source_updated: '2026-08-02'
translation_date: '2026-07-02'
references:
  - url: 'https://developers.google.com/calendar/api/v3/reference/events'
    title: Google Calendar Events API Reference
    type: official
  - url: 'https://en.wikipedia.org/wiki/Optimistic_concurrency_control'
    title: Optimistic Concurrency Control
    type: authoritative
---

캘린더 동기화 버그를 디버깅하고 있었는데, 사용자가 이벤트 제목을 수정한 뒤에도 계속 원래 제목으로 돌아가는 현상이 있었어요. Google Calendar에서 오는 웹훅이 사용자의 수정 이전 데이터를 담고 있었고, 동기화 경로가 그걸 그대로 로컬 레코드에 덮어쓰고 있었거든요. 해결책은 타임스탬프 비교 코드 열 줄이었는데, 이 개념은 비동기 업데이트를 처리하는 모든 시스템에 적용할 수 있어요.

## 문제

웹훅 기반 업데이트나 양방향 동기화가 있는 시스템에서는, 비동기 알림이 로컬 시스템이 더 최신 변경을 이미 처리한 **이후에** 도착할 수 있어요. 레이스 컨디션이 어떻게 발생하는지 볼게요:

```text
T0: 사용자가 레코드 생성 → 로컬 저장 → 비동기 알림 큐에 추가
T1: 사용자가 레코드 수정 → 로컬 저장 (updatedAt = T1)
T2: T0의 비동기 알림 도착 (T0 시점의 데이터를 담고 있음)
T3: 시스템이 T0 데이터를 적용 → T1 변경을 덮어씀 ❌
```

Last-write-wins 레이스 컨디션인데, 여기서 반전은 "마지막 쓰기"(T2 시점의 웹훅)가 **가장 오래된** 데이터를 가지고 있다는 거예요. T1의 사용자 변경이 맞는 건데, T0에서 지연된 웹훅이 그걸 덮어써요. 결과적으로 사용자는 자기 변경이 사라지는 걸 보게 돼요.

이 문제는 어디서든 나타나요 — 웹훅 기반 동기화, 이벤트 소싱 시스템, 서비스 간 양방향 동기화, 그리고 처리 지연이 로컬 수정의 시간 창을 만드는 모든 비동기 파이프라인에서요.

## 해결책

웹훅이 도착하면 필드 업데이트를 적용하기 전에 타임스탬프를 비교하면 돼요. 로컬 레코드가 리모트 소스의 `updatedAt`보다 더 최근에 수정됐는지 확인하고, 로컬이 더 최신이면 웹훅이 stale 데이터를 가져온 거니까 보호 대상 필드는 로컬 값을 유지해요:

```typescript
// 일반 패턴
const remoteUpdatedAt = parseTimestamp(asyncPayload.updatedAt);
const localUpdatedAt = localRecord.updatedAt;

if (localUpdatedAt > remoteUpdatedAt) {
  // 로컬이 더 최신 — 보호 필드는 로컬 값 유지
  for (const field of PROTECTED_FIELDS) {
    incomingData[field] = localRecord[field];
  }
} else {
  // 리모트가 더 최신 — 리모트 값 수용
  // (기본 동작, 별도 처리 불필요)
}
```

여기서 핵심 설계 결정은 **레코드 단위 거부가 아니라 필드 단위 보호**예요. 웹훅 페이로드 전체를 버리는 게 아니라, "보호 대상"으로 지정한 필드만 로컬 값을 유지하고 나머지는 리모트 소스에서 업데이트할 수 있어요. 이렇게 하면 staleness 감지의 안전성은 확보하면서 보호 대상이 아닌 필드의 정당한 업데이트를 놓치지 않아요.

## 결정 매트릭스

웹훅이 도착하면 결정은 간단해요:

| 조건                                | 액션         | 이유                           |
| ----------------------------------- | ------------ | ------------------------------ |
| `local.updatedAt > remote.updated`  | 로컬 유지    | 로컬이 더 최근에 수정됨       |
| `local.updatedAt <= remote.updated` | 리모트 수용  | 리모트가 더 최신이거나 동기화됨 |
| `remote.updated`가 null             | 리모트 수용  | 비교할 타임스탬프 없음         |

리모트 소스가 타임스탬프를 제공하지 않으면 비교할 수 없으니까, 리모트 데이터를 수용하는 게 기본값이에요. 이렇게 하면 수정 시간을 추적하지 않는 소스의 정당한 업데이트를 가드가 차단하지 않아요.

## 주요 설계 결정

**왜 레코드 단위가 아니라 필드 단위인가?** 업데이트 전체를 거부하면 유효한 데이터까지 버려요. 웹훅이 stale한 제목 데이터를 가져왔지만 참석자 데이터는 최신일 수 있거든요. 필드 단위 보호를 쓰면 최신인 건 유지하고 stale한 것만 버릴 수 있어요.

**잠금(locking)을 쓰면 안 되나?** 이 가드는 stale한 비동기 덮어쓰기를 방지하는 건데, 잠금의 대체가 아니라 보완이에요. 비관적/낙관적 잠금은 여러 쓰기자의 동시 쓰기를 처리하고, staleness 가드는 로컬 상태가 이미 앞서간 후에 도착하는 지연된 비동기 알림을 처리해요.

**이동에 민감한 필드는?** 캘린더 동기화에서 이 패턴은 기본 컨텐츠 필드를 넘어서 확장돼요. 사용자가 이벤트를 다른 캘린더로 이동하면, 소스 캘린더에서 오는 stale 웹훅이 `event.status='cancelled'`를 가져와서 이동 결과를 덮어쓸 수 있어요. 로컬 레코드의 status 필드, 소속 캘린더 참조, soft-delete 마커를 보호하면 이런 stale 취소 시그널이 이동을 되돌리는 걸 막을 수 있어요.

**큐 측 타임스탬프 갱신:** 비동기 API 호출(예: Google Calendar 이동) 이후에, 응답 웹훅이 도착하기 전에 로컬 레코드의 `updatedAt`을 명시적으로 갱신해요. 이렇게 하면 그 호출이 유발한 웹훅에 대해 `local.updatedAt > remote.updated`가 보장돼서, staleness 가드가 올바른 데이터로 판단할 수 있어요.

## ORM 함정

이 패턴은 정확한 로컬 타임스탬프가 필요한데, 여기서 미묘한 ORM 이슈가 나와요. 많은 ORM이 벌크나 raw 업데이트 메서드에서 자동 타임스탬프 데코레이터를 건너뛰거든요:

```typescript
// TypeORM 예제
// ❌ .update()는 @UpdateDateColumn을 트리거하지 않음
await repo.update(id, { field: newValue });

// ✅ updatedAt을 수동으로 설정해야 함
await repo.update(id, {
  field: newValue,
  updatedAt: new Date() // staleness guard에 필수
});

// ✅ .save()는 @UpdateDateColumn을 트리거함
await repo.save(entity);

// ⚠️ .upsert()도 ON CONFLICT 경로에서 @UpdateDateColumn을 건너뜀.
// `updated_at = EXCLUDED.updated_at`으로 entity가 들고 있던 값을 그대로 쓰기 때문에
// stale한 entity 타임스탬프가 conflict 시 그대로 저장됨
entity.updatedAt = new Date(); // upsert 전에 갱신 필수
await repo.upsert(entity, ["uniqueCol"]);
```

`updatedAt`이 실제 마지막 수정 시간을 반영하지 않으면, staleness 가드가 잘못된 판단을 내려요. 어떤 ORM 메서드가 자동 타임스탬프를 트리거하고 어떤 게 수동 할당이 필요한지 항상 확인하세요. TypeORM에서는 `.save()`가 `@UpdateDateColumn`을 트리거하지만 `.update()`는 안 해요 — 이 차이가 이 패턴 전체를 조용히 망가뜨릴 수 있어요.

셋 중에 제일 교활한 건 `.upsert()`였어요. 자동 타임스탬프를 건너뛰는 데서 끝나지 않고, ON CONFLICT 경로에서 `updated_at = EXCLUDED.updated_at`을 내보내요. entity가 들고 있던 타임스탬프가 뭐든 그대로 다시 저장된다는 뜻이에요. 그 값이 stale하면 upsert를 아무리 반복해도 record의 `updatedAt`은 영영 안 움직여요. 반복 일정의 단일 인스턴스를 다시 수정하는 케이스에서 이 문제를 만났어요. 수정할 때마다 upsert를 타고 entity에는 여전히 옛 타임스탬프가 실려 있어서, upsert 직전에 entity를 갱신해주기 전까지 `updatedAt`이 얼어붙어 있었죠. `.update()`에 필요한 것과 똑같은 수동 할당이죠. 동작 원리를 보면(적어도 제가 확인한 TypeORM 버전에서는) `EntityManager.upsert`는 entity에 정의된 column만 conflict-overwrite 목록에 추가하고, column이 이미 있으면 `CURRENT_TIMESTAMP`를 주입하지 않아요.

## 이 패턴이 필요 없는 경우

모든 시스템에 staleness 가드가 필요한 건 아니에요. 다음 경우에는 건너뛰세요:

- **단방향 동기화** (소스 → 로컬만) — 보호할 로컬 수정이 없어요
- **멱등 연산** — stale 데이터를 적용해도 부작용이 없다면, 가드가 불필요한 복잡도만 추가해요
- **추가 전용 시스템** — 덮어쓰기가 불가능해요
- **순서가 보장된 실시간 스트림** (예: 단일 컨슈머의 Kafka 파티션) — 순서가 이미 전송 계층에서 처리돼요

## 핵심 정리

비동기 업데이트를 처리할 때는, 보호 대상 필드를 덮어쓰기 전에 항상 소스의 수정 타임스탬프와 로컬 레코드의 타임스탬프를 비교하세요. 이 패턴은 코드 열 줄이고, 레코드 단위가 아닌 필드 단위로 동작하며, 웹훅 기반 시스템에서 가장 흔한 데이터 손상 유형을 방지해요. 이걸 망가뜨릴 수 있는 한 가지: `updatedAt`을 생각대로 업데이트하지 않는 ORM — 가드를 신뢰하기 전에 ORM의 자동 타임스탬프 동작을 꼭 확인하세요.

## 참고 자료

- [Google Calendar Events API Reference](https://developers.google.com/calendar/api/v3/reference/events)
- [Optimistic Concurrency Control — Wikipedia](https://en.wikipedia.org/wiki/Optimistic_concurrency_control)
