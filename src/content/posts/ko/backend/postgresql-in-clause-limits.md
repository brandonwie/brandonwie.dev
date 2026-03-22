---
title: PostgreSQL IN 절 파라미터 제한
description: 'TypeORM의 `In([...])` 연산자로 대량 ID를 쿼리하면 생성된 SQL이 ID당 하나의 바인드 파라미터를 만들어 성능이 저하됩니다'
date: 2026-02-11T00:00:00.000Z
updated: '2026-03-22'
tags:
  - backend
  - postgresql
  - typeorm
  - performance
category: backend
draft: false
lang: ko
source_lang: en
source_slug: postgresql-in-clause-limits
source_updated: '2026-03-22'
translation_date: '2026-02-12'
references:
  - url: 'https://www.postgresql.org/docs/current/protocol-message-formats.html'
    title: PostgreSQL Protocol Message Formats - Bind Message
    type: official
---

Google Calendar 동기화 엔드포인트에서 ID 배열로 블록을 쿼리하는 코드가
있었어요. 개발 환경에서 50개 블록으로는 잘 동작했어요. 스테이징에서 파워
유저의 캘린더에서 온 3,000개 이상의 블록으로는 쿼리 플래닝에 수 초가
걸렸어요. 실제 규모에서는 PostgreSQL의 하드 리밋인 65,535 파라미터에
도달해서 크래시가 났을 거예요.

문제는 TypeORM의 추상화 뒤에 숨어 있었어요. `In([...])`은 무해해 보이지만,
요소 하나당 바인드 파라미터 하나를 생성해요. 숫자가 올라갈 때 경고는
없어요.

## 하드 리밋

PostgreSQL의 wire protocol (Frontend/Backend Protocol v3)은 `Bind` 메시지에서
파라미터 수를 **16비트 부호 없는 정수**로 인코딩해요:

```text
Bind message format:
  'B' | int32 length | ... | int16 num_parameters | ...
                                ^^^^^^
                          2 bytes = 2^16 - 1 = 65,535 max
```

파라미터화된 쿼리의 `$1, $2, ..., $N` 각각이 이 제한에 포함돼요.
TypeORM의 `In([...])`은 `WHERE id IN ($1, $2, ..., $N)`을 생성하니까,
65,536개 ID 배열은 프로토콜 수준에서 실패해요.

## 발견하기 어려운 이유

이 문제는 여러 추상화 레이어 뒤에 숨어 있어요.

**에러 메시지가 암호 같아요.** 65K 제한에 도달하면 PostgreSQL이 "파라미터가
너무 많습니다" 같은 명확한 메시지가 아니라 프로토콜 수준 에러를 반환해요.
wire protocol 문서에서 `int16 num_parameters` 필드를 찾기까지 상당한 추적이
필요했어요.

**TypeORM이 파라미터 수를 숨겨요.** `In([...])`이 SQL 생성을 추상화해요.
제한에 가까워져도 TypeORM 수준의 경고가 없어요 -- 조용히 쿼리를 생성하고
PostgreSQL이 거부하게 내버려 둬요.

**성능이 점진적으로 저하돼요.** 특정 숫자에서 절벽이 없어요. 플래닝 시간이
선형적으로 증가하기 때문에, "맞는" 배치 크기를 고르려면 명확한 실패 지점이
아니라 벤치마킹이 필요했어요.

**`ANY(array)`가 드롭인 대체가 아니에요.** TypeORM의 `find()` API는
`ANY($1::int[])`를 지원하지 않아요. 이걸 쓰려면 raw `query()` 호출로
전환해야 하는데, 타입 안전성과 쿼리 빌더 조합 가능성을 잃어요.

## 실질적 제한은 하드 리밋보다 낮음

65K 상한은 이론적이에요. 실제로는 그 전에 성능이 저하돼요:

| 요인           | 실질적 제한    | 이유                                                 |
| -------------- | -------------- | ---------------------------------------------------- |
| 쿼리 플랜 캐시 | ~1,000-5,000   | 파라미터 수가 다르면 다른 prepared statement         |
| 플래닝 시간    | ~5,000-10,000  | 플래너가 각 파라미터를 평가, O(n) 오버헤드           |
| 메모리         | ~10,000-30,000 | 각 파라미터가 executor의 파라미터 배열에 메모리 차지 |
| Wire protocol  | 65,535         | 쿼리당 하드 상한                                     |

## 검토한 방법들

| 방법                   | 장점                                      | 단점                                   |
| ---------------------- | ----------------------------------------- | -------------------------------------- |
| **배치 (500-1,000)**   | TypeORM `find()`와 호환, 예측 가능한 성능 | 여러 라운드트립                        |
| **`ANY(array)`**       | 단일 라운드트립, 65K 제한 우회            | raw SQL 필요, TypeORM 타입 안전성 상실 |
| **임시 테이블 + JOIN** | 100K+ ID 처리, 단일 쿼리                  | 추가 DDL 오버헤드, 커넥션 스코프       |
| **CTE with VALUES**    | 임시 테이블 불필요, 1K-10K 범위           | 장황한 SQL, 플래닝 오버헤드 여전       |

## 해결책: 500-1,000으로 배치

배치를 선택한 이유는 raw SQL로 전환하지 않고 TypeORM의 `find()` API와 직접
호환되기 때문이에요. `findByIdsAndUserIdWithCalendar` 메서드는 다른 쿼리
빌더 조건과 조합 가능하고, `ANY(array)`로 전환하면 전체 쿼리를 다시 작성해야
했을 거예요.

`SELECT ... WHERE id IN (...)` 쿼리 기준:

- **500** -- B-tree 인덱스 스캔에 최적, 밀리초 이하 플래닝
- **1,000** -- 여전히 빠름, 덜 중요한 경로에 적합
- 1,000 이상 -- 플래닝 시간이 지배적이 됨

여러 라운드트립은 여기서 허용 가능해요. 동기화 작업이 이미 Google Calendar
API에서 I/O-bound이기 때문이에요. 데이터베이스 라운드트립은 외부 API 호출에
비하면 무시할 수준이에요.

## 대안: `ANY(array)` 우회

raw SQL을 사용할 수 있다면, `ANY(array)`가 문제 전체를 우회해요:

```sql
-- IN clause: N parameters
WHERE id IN ($1, $2, ..., $500)  -- 500 params

-- ANY(array): 1 parameter (entire array)
WHERE id = ANY($1::int[])        -- 1 param, bypasses 65K limit
```

TypeORM은 `find()`에서 `ANY(array)`를 네이티브로 지원하지 않지만, raw
`query()`로는 사용할 수 있어요. 타입 안전성이 크게 중요하지 않거나 배열
파라미터를 지원하는 쿼리 빌더를 사용할 때 더 나은 접근법이에요.

## 이게 왜 효과적인가

배치는 각 개별 쿼리를 PostgreSQL이 편안하게 처리하는 범위 안에 유지해요.
500개 요소의 `IN` 절은 밀리초 이하 시간에 쿼리 플랜을 생성하고 B-tree
인덱스 스캔을 효율적으로 사용해요. 전체 작업량은 같지만, 플래너는 하나의
거대한 쿼리보다 작은 쿼리들을 더 빠르게 처리해요.

## 실전 가이드

**배치를 사용하면 좋은 경우:**

- 사용자 입력이나 업스트림 데이터에서 오는 동적 ID 집합으로 쿼리하는 경우
  (예: 가변 ID 수를 반환하는 캘린더 동기화)
- 수백 개를 넘어 커질 수 있는 리스트의 `WHERE x IN (...)`
- 큰 배열에 대한 TypeORM `find()`의 `In([...])`

**배치가 필요 없는 경우:**

- **고정되거나 작은 ID 집합**: 리스트가 항상 100개 미만이면 (예: 사용자 자신의
  캘린더), 배치는 불필요한 복잡성과 라운드트립 오버헤드만 추가해요.
- **JOIN이 가능한 경우**: ID가 같은 데이터베이스의 다른 테이블에서 오면,
  애플리케이션에서 ID 리스트를 구체화하는 대신 `JOIN`이나 서브쿼리를
  사용하세요.
- **쓰기 작업**: bulk `INSERT`/`UPDATE`에는 `IN` 절 배치 대신 `UNNEST`나
  `VALUES` 패턴을 사용하세요.

경험 법칙: `IN` 절이 수백 개 요소를 넘어설 가능성이 있다면, 500으로
배치하세요. 점진적 성능 저하와 프로토콜 크래시를 모두 방지하는 작은 코드
변경이에요.
