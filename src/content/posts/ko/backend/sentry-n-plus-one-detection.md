---
title: Sentry N+1 쿼리 감지
description: 'Sentry가 런타임에서 N+1 쿼리를 감지하는 방식, 병렬 실행으로 인한 오탐 사례, 그리고 해결 패턴.'
date: 2026-03-03T00:00:00.000Z
updated: '2026-08-02'
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
source_updated: '2026-08-02'
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

Sentry 문서는 이 detector를 "a set of sequential, non-overlapping database spans with similar descriptions"를 찾는 것으로 설명하고, 네 가지 기준을 덧붙여요. 관련 span의 총 duration이 50ms를 넘을 것, span 개수가 임계값(보통 5개)을 초과할 것, 각 span의 description이 잘리지 않은 전체 query일 것, 그리고 반복 그룹 앞에 database span이 최소 하나 있을 것(fingerprinting에 쓰이는 "source" span)이에요.

이 기준을 위 trace에 대보면 안 맞는 데가 있어요. 그 span 6개는 sequential이 아니라 동시에 떴고, 앞에 오는 source span도 없어요. 문서 기준대로면 플래그가 걸리지 않았어야 하는데 걸린 거예요. 저도 이 간극은 설명하지 못해요. Sentry가 이 휴리스틱에 대해 공개한 건 저 기준 페이지가 전부이고, detector 임계값은 project별로 조정할 수 있어서 실제로 돌아간 값이 문서의 기본값이 아니었을 수도 있어요. 문서 기준을 계약으로 보고, 아래 내용은 그에 대한 관측 하나로 읽어 주세요.

## 진짜 N+1 vs 오탐

| 구분    | 진짜 N+1                 | 오탐(병렬 Fan-Out)          |
| ------- | ------------------------ | --------------------------- |
| 쿼리 수 | 무한정(데이터에 비례)    | 고정(코드 구조로 결정)      |
| 패턴    | 루프 → 항목별 쿼리       | `Promise.all()` → 동시 배치 |
| 해결    | 배치 쿼리 / eager load   | 순차 실행 또는 무시         |
| 심각도  | 높음(데이터와 함께 증가) | 낮음(데이터 무관하게 일정)  |

## 오탐 패턴: 중첩된 Promise.all()

알림을 발생시킨 코드의 형태예요. `fetchPeriodStats`는 내부에서 독립적인 쿼리 3개를 병렬로 실행해요.

```typescript
// 외부 병렬: 2개 호출
const [current, previous] = await Promise.all([
  fetchPeriodStats(currentPeriod), // 내부 병렬: 각 3개 쿼리
  fetchPeriodStats(previousPeriod), // 내부 병렬: 각 3개 쿼리
]);
// 결과: 2 × 3 = 6개의 동시 pg.connect → Sentry가 N+1로 플래그
```

쿼리 수는 데이터 크기와 무관하게 6개로 고정돼요. 의도적인 병렬화이지, 항목별 루프 패턴이 아니에요.

## 배치를 나누면 해결되는 이유

두 기간을 병렬 대신 순차로 실행하면 반복 span 6개짜리 그룹 하나가 3개짜리 그룹 두 개로 나뉘어요. 3개는 문서에 나온 개수 임계값 아래라서 alert이 멈춘 이유로는 이게 가장 그럴듯해요. 다만 위에서 짚은 것처럼 문서 기준은 원래의 alert도 설명하지 못하니까, 증명된 메커니즘이 아니라 일어난 일로 읽어 주세요.

```text
변경 전 (6개 동시 — N+1 트리거):
|████|████|████|████|████|████|  ← 6개의 겹치는 pg.connect

변경 후 (3 + 3 순차 — 임계값 이하):
|████|████|████|          |████|████|████|
 현재 기간                이전 기간
```

3개씩 두 배치는 N+1로 분류되지 않았고, 알림도 멈췄어요. 대가는 레이턴시예요. 두 번째 배치가 첫 번째와 겹칠 수 없으니까요. 제가 본 엔드포인트에서는 대략 50-80ms였는데, 이건 그 쿼리들이 우연히 그만큼 걸린 것뿐이라 각자 측정해 보는 게 맞아요. 대신 동시 커넥션 압력은 절반으로 줄어요.

## 핵심 포인트

- Sentry N+1 감지는 span 기반이지, 코드 기반이 아니에요
- `Promise.all()`에서 동일한 작업 타입을 쓰면 휴리스틱이 트리거돼요
- 고정 횟수의 병렬 쿼리는 오탐이에요(데이터 의존성 없이 고정)
- 외부 호출을 순차화하면 레이턴시를 대가로 커넥션 풀 압력을 절반으로 줄여요(제 경우 대략 50-80ms였지만, 수치는 쿼리마다 달라요)
- Sentry가 아니더라도, fan-out을 줄이는 건 좋은 습관이에요(커넥션 풀은 한정된 공유 리소스)

## 순차화 vs 무시 판단 기준

아래는 제가 정리한 경험칙이지, 측정으로 얻은 임계값이 아니에요. 특히 풀 비율은 얼마나 여유를 두면 안심되는지에 대한 판단에 가까워요.

| 시나리오                               | 조치                      |
| -------------------------------------- | ------------------------- |
| cache 비활성, 모든 요청이 DB 직접 조회 | 순차화(실제 풀 압력 발생) |
| cache 활성, DB 조회 드문 경우          | 무시(오탐, cache가 흡수)  |
| 풀이 fan-out 계수의 4배 이상           | 무시(여유 충분)           |
| 풀이 fan-out 계수의 2배 미만           | 순차화(고갈 위험)         |
