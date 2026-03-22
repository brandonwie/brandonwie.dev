---
title: Sentry N+1 쿼리 감지
description: 'Sentry가 런타임에서 N+1 쿼리를 감지하는 방식, 병렬 실행으로 인한 오탐 사례, 그리고 해결 패턴.'
date: 2026-03-03T00:00:00.000Z
updated: '2026-03-22'
tags:
  - backend
  - performance
  - observability
  - sentry
category: backend
draft: false
lang: ko
source_lang: en
source_slug: sentry-n-plus-one-detection
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: >-
      https://docs.sentry.io/product/issues/issue-details/performance-issues/n-one-queries/
    title: Sentry N+1 Queries Detection
    type: official
---

## Sentry가 N+1을 감지하는 방식

Sentry는 코드 구조를 분석하지 **않아요.** 트랜잭션 trace에서 런타임 span 패턴을 관찰해요. 단일 트랜잭션 안에서 **반복되는 유사한 데이터베이스 작업**이 보이면 플래그를 걸어요.

```text
Sentry가 보는 것:
  handler.nestjs [250ms]
    ├─ db: pg.connect [4ms]
    ├─ db: pg.connect [4ms]
    ├─ db: pg.connect [4ms]
    ├─ db: pg.connect [63ms]
    ├─ db: pg.connect [7ms]
    └─ db: pg.connect [2ms]

Sentry 결론: 유사한 span 6개 반복 → N+1 Query
```

## 진짜 N+1 vs 오탐

| 구분    | 진짜 N+1                 | 오탐(병렬 Fan-Out)          |
| ------- | ------------------------ | --------------------------- |
| 쿼리 수 | 무한정(데이터에 비례)    | 고정(코드 구조로 결정)      |
| 패턴    | 루프 → 항목별 쿼리       | `Promise.all()` → 동시 배치 |
| 해결    | 배치 쿼리 / eager load   | 순차 실행 또는 무시         |
| 심각도  | 높음(데이터와 함께 증가) | 낮음(데이터 무관하게 일정)  |

## 오탐 패턴: 중첩된 Promise.all()

```typescript
// 외부 병렬: 2개 호출
const [current, previous] = await Promise.all([
  fetchBlocks(currentPeriod), // 내부 병렬: 각 3개 쿼리
  fetchBlocks(previousPeriod), // 내부 병렬: 각 3개 쿼리
]);
// 결과: 2 × 3 = 6개의 동시 pg.connect → Sentry가 N+1로 플래그
```

쿼리 수는 데이터 크기와 무관하게 6개로 고정돼요. 의도적인 병렬화이지, 항목별 루프 패턴이 아니에요.

## 시간적 분리로 해결되는 이유

Sentry의 휴리스틱은 동시에 발생하는 유사한 span을 찾아요. 시간적으로 분리하면 패턴이 깨져요.

```text
변경 전 (6개 동시 — N+1 트리거):
|████|████|████|████|████|████|  ← 6개의 겹치는 pg.connect

변경 후 (3 + 3 순차 — 임계값 이하):
|████|████|████|          |████|████|████|
 현재 기간                이전 기간
```

3개씩 두 배치는 시간적으로 구분되기 때문에 N+1로 분류되지 않아요.

## 핵심 포인트

- Sentry N+1 감지는 span 기반이지, 코드 기반이 아니에요
- `Promise.all()`에서 동일한 작업 타입을 쓰면 휴리스틱이 트리거돼요
- 고정 횟수의 병렬 쿼리는 오탐이에요(데이터 의존성 없이 고정)
- 외부 호출을 순차화하면 ~50-80ms 레이턴시를 대가로 커넥션 풀 압력을 절반으로 줄여요
- Sentry가 아니더라도, fan-out을 줄이는 건 좋은 습관이에요(커넥션 풀은 한정된 공유 리소스)

## 순차화 vs 무시 판단 기준

| 시나리오                               | 조치                      |
| -------------------------------------- | ------------------------- |
| cache 비활성, 모든 요청이 DB 직접 조회 | 순차화(실제 풀 압력 발생) |
| cache 활성, DB 조회 드문 경우          | 무시(오탐, cache가 흡수)  |
| 풀이 fan-out 계수의 4배 이상           | 무시(여유 충분)           |
| 풀이 fan-out 계수의 2배 미만           | 순차화(고갈 위험)         |
