---
title: "배치 처리 트레이드오프"
description: "엔티티별 배칭과 크로스 엔티티 bulk INSERT 하나를 비교해요. 무엇을 측정했고, 무엇은 추정에 그쳤고, 왜 더 단순한 쪽을 유지했는지 정리했어요."
date: 2026-01-26T00:00:00.000Z
updated: "2026-08-02"
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
source_updated: "2026-08-02"
translation_date: "2026-03-04"
references:
  - url: https://www.postgresql.org/docs/current/populate.html
    title: Populating a Database — PostgreSQL Documentation
    type: official
  - url: >-
      https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all
    title: Promise.all() — MDN Web Docs
    type: official
---

여러 엔티티가 각각 같은 종류의 데이터베이스 쓰기를 해야 할 때, 선택할 수 있는
형태는 두 가지예요. 엔티티마다 자기 bulk INSERT를 실행하거나, 모든 엔티티가
행을 모아서 마지막에 하나의 INSERT로 넘기거나요. sync job에서 첫 번째 형태를
쓰고 있었고, 두 번째로 바꿀 만한지 따져봤어요.

결론은 "아니오"였는데, 결론보다 이유가 더 흥미로워요. 그리고 그 결정을 만든
숫자는 생각보다 근거가 얇아요.

## 시나리오

sync job이 18개 calendar feed에서 이벤트를 병렬로 가져와요. feed마다 하나의
테이블에 들어갈 행 묶음이 만들어져요:

```text
방식 A(당시 구현):   18개 병렬 fetch → 18번 bulk INSERT → 18개 커넥션
방식 B(검토한 대안): 18개 병렬 fetch →  1번 bulk INSERT →  1개 커넥션
```

## 방식 A — 엔티티별 배칭

```typescript
// 각 feed가 독립적으로 처리돼요.
await Promise.all(
  feeds.map(async (feed) => {
    const rows = await fetchEvents(feed);
    await bulkInsert(rows); // feed당 한 번 호출
  }),
);
```

얻는 것: fetch가 병렬로 돌아가고, 네트워크 바운드 작업에서는 이게 가장
중요해요. feed마다 트랜잭션이 분리되니까 실패가 그 feed 안에 머물러요. 에러
처리도 feed 단위라, 하나가 망가져도 나머지 17개는 살아남아요. 그리고 feed
*내부*에서는 이미 배치가 되어 있는데, 결과적으로 이 부분이 이득의 대부분을
차지해요.

치르는 비용: 실행당 N개 커넥션, N번의 INSERT 문, 그만큼 커진 커넥션 풀 부담이
있어요.

## 방식 B — 크로스 엔티티 배칭

전부 모은 다음 한 번에 써요.

```typescript
const allRows = [];

await Promise.all(
  feeds.map(async (feed) => {
    const rows = await fetchEvents(feed);
    allRows.push(...rows);
  }),
);

// 모든 feed를 아우르는 단일 bulk insert
await bulkInsert(allRows);
```

얻는 것: N개가 아니라 1개의 문, N개가 아니라 1개의 커넥션, 그리고 데이터베이스
입장에서 더 큰 배치예요.

치르는 비용: 어떤 feed가 잘못된 행을 만들었는지 알아내기 어렵고, all-or-nothing
이라 하나가 실패하면 나머지도 롤백되고, 쓰기 전까지 모든 행이 메모리에 남아
있고, 에러 복구가 눈에 띄게 복잡해져요.

## 표 하나로 보는 비교

| 요소        | 엔티티별            | 크로스 엔티티      |
| ----------- | ------------------- | ------------------ |
| 장애 격리   | 있음                | 없음               |
| 커넥션 사용 | N개                 | 1개                |
| 에러 추적   | 단순함              | 복잡함             |
| 메모리      | 낮음(흘려보냄)      | 높음(전부 버퍼링)  |
| 코드 복잡도 | 낮음                | 높음               |
| 쿼리 수     | N개                 | 1개                |

엔티티별은 장애 격리가 중요하고, 엔티티가 이미 병렬로 처리되고, 복구가 엔티티
단위여야 하고, 네트워크 I/O가 지배적일 때 잘 맞아요.

크로스 엔티티는 데이터베이스가 병목이고, 커넥션 풀이 빠듯하고, all-or-nothing
시맨틱이 허용되고, 메모리가 전체 페이로드를 충분히 담을 수 있을 때 맞아요.

## 숫자가 말한 것

엔티티별 열은 18개 feed 실행을 실제로 측정한 값이에요. 크로스 엔티티 열은
추정치예요. 만들지 않았으니 측정 결과가 아니라 예측이에요.

| 메트릭    | 엔티티별(측정) | 크로스 엔티티(추정) |
| --------- | -------------- | ------------------- |
| 총 시간   | 1.6-1.9초      | 1.5-1.8초           |
| 쿼리 수   | 18             | 1                   |
| 시간 절감 | —              | 34-119ms(2-6%)      |
| 복잡도    | 낮음           | 높음                |

이 근거가 얼마나 얇은지는 솔직히 말할 필요가 있어요. 측정값에 추정값을 붙여
얻은 2-6%는 그 자체로 강한 결과가 아니에요. 표의 나머지 항목이 전부 같은 방향을
가리켰기 때문에 결정에 영향을 준 정도예요. 추정치가 40% 근처였다면 예측으로
논쟁하는 대신 프로토타입을 만들어 제대로 측정하는 게 맞았을 거예요.

## 중요한 배칭은 이미 끝나 있었어요

큰 도약은 행별 INSERT에서 배치 INSERT로 가는 구간이지, 18개 배치에서 1개로 가는
구간이 아니에요. PostgreSQL 문서의 "Populating a Database" 항목이 이 곡선의
모양을 잘 보여줘요. 삽입마다 따로 커밋하면 "PostgreSQL is doing a lot of work
for each row that is added"이고, `COPY`는 "almost always faster than using
`INSERT`, even if `PREPARE` is used and multiple insertions are batched into a
single transaction"이라고 말해요.

즉 사다리는 대략 행마다 커밋 → 트랜잭션 안의 배치 INSERT → `COPY` 순이에요.
이미 배치된 18번의 쓰기를 1번으로 합치는 건, 이미 올라서 있는 칸 안에서 조금
움직이는 일이에요. 여기서 남길 교훈은 이거예요. 눈앞에 보이는 단계를 최적화하기
전에, 지금 사다리의 어디에 서 있는지부터 측정하세요.

## Nested Fan-Out 증폭

엔티티별 패턴의 변형 하나는 따로 경고할 만해요. 중첩된 `Promise.all()`은 커넥션
수요를 더하는 게 아니라 곱해요.

```typescript
// 외부: 두 구간을 병렬로
const [current, previous] = await Promise.all([
  loadRange(currentPeriod), // 내부: 3개 쿼리 병렬
  loadRange(previousPeriod), // 내부: 3개 쿼리 병렬
]);
// 피크 커넥션: 2 × 3 = 6 — 2도 3도 아니에요.
```

MDN의 `Promise.all()` 설명에서 기억할 부분은, 넘겨줄 시점에 promise가 이미
실행 중이라는 점이에요. "if you are using it to run several async functions
concurrently, you need to call the async functions and use the returned
promises"라고 적혀 있어요. 바깥쪽 `Promise.all()`이 안쪽 fan-out을 대신 조절해
주지 않아요.

해결은 외부 호출을 순차로 바꾸고 내부 병렬성은 유지하는 거예요. 피크 커넥션이
6에서 3으로 줄고, 비용은 대략 50-80ms예요.

풀이 작거나 캐시가 꺼져 있을 때 이게 중요해져요. 대략적인 제약은
`outer × inner × concurrent_users`가 풀 크기 안에 들어와야 한다는 거예요. 앞단에
60초 캐시가 있으면 fan-out은 분당 한 번 정도라 아무도 눈치채지 못해요. 캐시가
없으면 모든 요청이 fan-out을 만들어요.

같은 패턴이 N+1 탐지기도 혼란스럽게 만드는데, 그건
[Sentry N+1 Detection](/posts/sentry-n-plus-one-detection)에 따로 적었어요.

## 트레이드오프는 코드 옆에 적어두기

이런 결정은 설명하는 코드 옆에 남기지 않으면 6개월 뒤에 보이지 않아요:

```typescript
// ARCHITECTURAL NOTE: 엔티티별 배칭 트레이드오프
//
// 각 feed가 독립적으로 처리되면서 자기 bulk INSERT를 실행하므로, 한 번의
// 실행이 1개가 아니라 N개의 문을 만들어요.
//
// TRADE-OFF:
// - 엔티티별:     N개 문, 병렬 fetch, 실패 격리.
// - 크로스 엔티티: 1개 문, 대신 직렬 처리 또는 전체 메모리 버퍼링 필요.
//
// DECISION: 엔티티별 배칭 유지. 단일 문으로 합쳤을 때의 추정 이득은 18개 feed
// 실행 기준 34-119ms로, 실패 격리를 포기할 만한 값이 아니에요.
```

이 메모가 없으면 다음에 코드를 읽는 사람은 1개면 될 자리에 N개의 쿼리를 보고
아무도 고민하지 않았다고 생각하게 돼요.

## 핵심 요약

질문은 처음부터 "쿼리 1개냐 N개냐"가 아니었어요. 어떤 자원이 실제로 부족한지가
질문이었어요. 실행이 네트워크 바운드이고 풀에 여유가 있으면, N번의 배치 쓰기를
하나로 합치는 건 몇 퍼센트를 얻고 실패 격리를 잃는 거래예요. 반대로 풀이
제약이면 — 그리고 중첩 fan-out은 풀을 제약으로 만드는 가장 빠른 방법이에요 —
같은 변경이 미세 최적화가 아니라 문제 해결 그 자체가 돼요.

## 참고 자료

- [Populating a Database — PostgreSQL Documentation](https://www.postgresql.org/docs/current/populate.html)
- [Promise.all() — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)
