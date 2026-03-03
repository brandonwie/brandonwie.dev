---
title: "배치 처리 트레이드오프"
description: "데이터베이스 작업을 공유하는 여러 엔티티를 처리할 때, 엔티티별 배칭과 크로스 엔티티 배칭 간의 트레이드오프를 분석해요."
date: 2026-01-26T00:00:00.000Z
updated: 2026-03-03T00:00:00.000Z
tags:
  - backend
  - performance
  - architecture
  - trade-offs
category: backend
draft: false
lang: ko
source_lang: en
source_slug: batch-processing-trade-offs
source_updated: "2026-03-03"
translation_date: "2026-03-04"
references:
  - url: >-
      https://docs.aws.amazon.com/batch/latest/userguide/multi-node-parallel-jobs.html
    title: Multi-node parallel jobs — AWS Batch
    type: official
---

## 시나리오

18개 캘린더를 sync하고, 각각 bulk INSERT가 필요한 상황이에요:

```text
현재: 18개 병렬 프로세스 → 18번 bulk INSERT → 18개 DB 커넥션
대안: 18개 병렬 프로세스 → 1번 bulk INSERT → 1개 DB 커넥션
```

## 엔티티별 배칭(현재 방식)

```typescript
// 각 캘린더가 독립적으로 처리
await Promise.all(
  calendars.map(async (calendar) => {
    const blocks = await fetchEvents(calendar);
    await bulkInsertBlocks(blocks); // 18번 호출
  }),
);
```

### 장점

- 병렬 처리(네트워크 바운드 작업에 빠름)
- 독립적인 트랜잭션(장애 격리)
- 단순한 에러 처리(하나가 실패해도 나머지는 성공)
- 이미 엔티티 내에서 배치됨(이벤트별 insert보다 나음)

### 단점

- sync당 N개 데이터베이스 커넥션
- N번의 bulk INSERT 쿼리
- 커넥션 풀 부담 증가

## 크로스 엔티티 배칭(대안)

### Collect-then-Batch

```typescript
// 모든 block을 먼저 수집
const allBlocks = [];
await Promise.all(
  calendars.map(async (calendar) => {
    const blocks = await processCalendar(calendar);
    allBlocks.push(...blocks);
  }),
);

// 모든 캘린더를 위한 단일 bulk insert
await bulkInsertBlocks(allBlocks);
```

### 장점

- 단일 데이터베이스 쿼리(1 vs N)
- 커넥션 풀 사용량 감소
- 더 나은 데이터베이스 배칭 효율

### 단점

- 어떤 엔티티가 실패했는지 추적하기 어려움
- All-or-nothing 트랜잭션(하나의 실패가 전체에 영향)
- 모든 데이터를 메모리에 버퍼링해야 함
- 에러 복구가 더 복잡함

## 결정 프레임워크

| 요소        | 엔티티별       | 크로스 엔티티 |
| ----------- | -------------- | ------------- |
| 장애 격리   | 있음           | 없음          |
| 커넥션 사용 | 높음           | 낮음          |
| 에러 추적   | 쉬움           | 복잡함        |
| 메모리 사용 | 낮음(스트리밍) | 높음(버퍼링)  |
| 코드 복잡도 | 단순함         | 복잡함        |
| 쿼리 수     | N개            | 1개           |

## 언제 어떤 걸 선택할까

### 엔티티별 배칭을 선택할 때

- 장애 격리가 중요할 때
- 엔티티가 병렬로 처리될 때
- 에러 복구가 엔티티별로 필요할 때
- 네트워크 I/O가 지배적일 때(DB I/O가 아닌)

### 크로스 엔티티 배칭을 선택할 때

- 데이터베이스가 병목일 때
- 커넥션 풀이 제한적일 때
- All-or-nothing 시맨틱이 허용될 때
- 메모리가 모든 데이터를 담을 수 있을 때

## 성능 분석

실제 측정 결과(18개 캘린더):

| 메트릭    | 엔티티별  | 크로스 엔티티(추정) |
| --------- | --------- | ------------------- |
| 총 시간   | 1.6-1.9초 | 1.5-1.8초           |
| DB 쿼리   | 18        | 1                   |
| 시간 절감 | -         | 34-119ms(2-6%)      |
| 복잡도    | 낮음      | 높음                |

**결론**: 2-6% 개선으로는 추가 복잡도를 정당화할 수 없어요.

## 핵심 교훈

1. **이미 배치된 것으로 충분해요** - 엔티티별 bulk INSERT는 행별 INSERT보다 훨씬 나아요
2. **병렬 처리 > 단일 쿼리** - 네트워크 바운드 작업에서는 병렬성이 유리해요
3. **장애 격리가 중요해요** - 하나의 문제 있는 엔티티가 나머지에 영향을 주면 안 돼요
4. **최적화 전에 측정하세요** - 병목이 생각한 곳에 있지 않을 수 있어요

## Nested Fan-Out 증폭

엔티티별 패턴의 변형이에요. 중첩된 `Promise.all()`이 곱셈적으로 커넥션 수요를 만들어요.

```typescript
// 외부: 2개 호출 병렬
const [current, previous] = await Promise.all([
  fetchBlocks(currentPeriod), // 내부: 3개 쿼리 병렬
  fetchBlocks(previousPeriod), // 내부: 3개 쿼리 병렬
]);
// 피크 커넥션: 2 × 3 = 6 (2도 아니고 3도 아님)
```

**해결:** 외부 호출을 순차적으로 바꾸고 내부 병렬성은 유지하세요. 피크가 6에서 3으로 줄어들고 ~50-80ms 지연만 추가돼요.

**이게 중요한 상황:** 캐시가 비활성화되었거나 풀이 작을 때예요. 공식: `outer_parallelism × inner_parallelism × concurrent_users`가 풀 크기 내에 들어와야 해요. 캐시가 활성화되면(60초 TTL) fan-out이 분당 한 번 발생하므로 수용 가능해요. 캐시 없이는 모든 요청이 fan-out을 발생시키므로 위험해요.

[Sentry N+1 Detection](/posts/sentry-n-plus-one-detection)에서 이것이 어떻게 Sentry 오탐을 유발하는지 확인할 수 있어요.

## 코드 문서화 패턴

트레이드오프를 수용할 때는 문서화하세요:

```typescript
// ARCHITECTURAL NOTE: Per-Calendar Batching Trade-off
//
// 각 캘린더가 독립적으로 처리되고 bulkInsertBlocks를 별도로 호출해요.
// 이로 인해 N번의 bulk INSERT 쿼리(캘린더당 1번)가 발생해요.
//
// TRADE-OFF ANALYSIS:
// - 현재: N개 쿼리, 병렬 처리, 빠른 UX
// - 대안: 1개 쿼리, 하지만 직렬 처리 또는 복잡한 버퍼링 필요
//
// DECISION: 단순성과 병렬 처리를 위해 캘린더별 배칭 유지.
// 성능 영향은 미미함(34-119ms 절감 vs 추가 복잡도).
//
// Sentry tracking: NODE-NESTJS-7, NODE-NESTJS-4C
```
