---
title: PostgreSQL IN 절 파라미터 제한
description: 'PostgreSQL wire protocol은 파라미터 쿼리를 65,535개 바인드 파라미터로 제한해요. TypeORM의 `In([...])`을 500-1,000개로 쪼개면 실질적인 성능 한계 안에 머물러요.'
date: 2026-02-11T00:00:00.000Z
updated: '2026-07-31'
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
source_updated: '2026-07-31'
translation_date: '2026-07-31'
references:
  - url: 'https://www.postgresql.org/docs/current/protocol-message-formats.html'
    title: PostgreSQL Protocol Message Formats - Bind Message
    type: official
---

Google Calendar에서 받은 블록 ID 수천 개를 데이터베이스에서 찾아오는 동기화
기능을 만들고 있었어요. 쿼리는 TypeORM의 `In([...])` 연산자를 썼어요. ID가 수십
개뿐인 개발 환경에서는 아무 문제가 없었고요. 그런데 캘린더를 무겁게 쓰는
사용자는 한 번 동기화에 블록 ID가 수천 개씩 나올 수 있었어요. 이 쿼리 크기를
가늠하다가 만난 상한선은 꽤 단단했어요. 수천 개를 넘어가면 플래닝이 눈에 띄게
느려지고, 65,535개에서는 알아보기 힘든 프로토콜 수준 에러와 함께 쿼리가 아예
실패해요.

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
제한에 가까워져도 TypeORM 수준의 경고가 없어요. 조용히 쿼리를 생성하고
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

- **500**: B-tree 인덱스 스캔에 최적, 밀리초 이하 플래닝
- **1,000**: 여전히 빠름, 덜 중요한 경로에 적합
- 1,000 이상: 플래닝 시간이 지배적이 됨

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
파라미터를 지원하는 쿼리 빌더를 사용할 때 더 나은 접근법이에요. 대량 작업에서
자주 보이는 `UNNEST` 패턴도 발상은 같아요. 배열 파라미터 하나가 스칼라 N개를
대신하는 거죠.

## 같은 상한이 대량 `INSERT`에도 걸려요

처음엔 몰랐는데, 65,535라는 숫자는 `IN` 절이 아니라 `Bind` 메시지의
성질이에요. 파라미터를 쓰는 모든 statement에 그대로 적용되니까, 여러 행을 한
번에 넣는 `INSERT`도 예외가 아니에요. 여기서는 계산이 ID 개수가 아니라 컬럼 수
× 행 수라서 보기보다 훨씬 쉽게 걸려요:

```text
15 columns x 7,029 rows = 105,435 parameters   -> exceeds 65,535
```

7,000행은 큰 데이터로 느껴지지 않죠. 그런데 TypeORM의
`repository.insert(rows)`는 이걸 statement 하나로 만들어요. 그래서 한계에
걸리기엔 한참 작아 보이는 크기에서 대량 적재가 터져요. 쪼개는 방법은 앞과
똑같아요:

```ts
const CHUNK = 1000; // 15 x 1000 = 15,000 params, comfortably under
for (let i = 0; i < rows.length; i += CHUNK) {
  await repo.insert(rows.slice(i, i + CHUNK));
}
```

이 실패를 짚어내기 어려운 이유도 `IN` 절 때와 판박이예요. 드라이버가 뱉는 에러는
파라미터 상한을 한 번도 언급하지 않아서, 증상이 원인과 전혀 다른 곳을
가리켜요. 컬럼 수만 알면 `floor(60000 / columns)`로 안전한 chunk 크기가 바로
나와요. 감으로 정할 필요가 없어요.

한 번만 적재하고 끝나는 경우라면 `COPY ... FROM STDIN`이 이 고민 자체를
없애줘요. 스트리밍으로 넣기 때문에 바인드 파라미터를 아예 안 써요. 쪼갠
`INSERT`가 몇 초 걸리는 구간에서도 1초 아래로 끝나는 이유죠. 대신 ORM 경로를
완전히 벗어나니까 애플리케이션 코드보다는 import 작업에 어울려요.

### `ON CONFLICT` upsert도 계산은 똑같아요

upsert도 `Bind` 메시지 하나라서 계산이 달라지지 않아요. 행당 파라미터 수는
`INSERT` 목록의 컬럼 수 그대로예요. `ON CONFLICT` 대상과 `DO UPDATE SET` 절은
`EXCLUDED`와 대상 테이블을 참조할 뿐 새 placeholder를 만들지 않아서 개수를
늘리지 않아요. 그래서 6컬럼 upsert의 상한은 `floor(65535 / 6)`, 즉
10,922행이에요:

```sql
INSERT INTO "user_contacts"
  ("user_id", "email", "display_name", "photo_url", "integration_id", "updated_at")
VALUES ($1,$2,$3,$4,$5,$6), ($7,$8,$9,$10,$11,$12), ...   -- 6 params per row
ON CONFLICT ("user_id", "integration_id", "email")         -- 0 params
DO UPDATE SET "display_name" = COALESCE(EXCLUDED."display_name", ...)
```

### 계산을 아는 레이어에서 쪼개기

큰 배열을 들고 있는 호출부에서 쪼개고 싶어지는데, 지금 다시 한다면 statement를
만드는 메서드 안에서 쪼갤 거예요. 행당 파라미터 수를 아는 레이어는 거기뿐이고,
그래야 호출부마다 따로 기억할 필요 없이 전부 수정을 물려받아요. 저희는 네 곳이
하나의 `bulkUpsert`를 함께 썼는데, 한 번도 쪼갠 적 없던 bootstrap 경로가 상한을
넘긴 범인이었어요.

분기를 하나 두면 작은 배치는 여전히 statement 하나로 나가요:

```ts
const MAX_ROWS_PER_STATEMENT = 1000; // 6 x 1000 = 6,000 params

if (rows.length > MAX_ROWS_PER_STATEMENT) {
  const out: Ref[] = [];
  for (const batch of chunk(rows, MAX_ROWS_PER_STATEMENT)) {
    out.push(...(await this.bulkUpsert(userId, batch, opts, manager)));
  }
  return out;
}
```

여기서 놓치기 쉬운 게 두 가지 있어요. 하나는 호출부의 transaction
핸들(`manager`)을 모든 chunk에 그대로 넘기는 거예요. 그래야 transaction 안에서
부른 쪽이 쪼갠 뒤에도 원자성을 유지해요. 안 넘기면 원자적이던 statement 하나를
조용히 독립적인 N개로 바꿔버린 셈이 돼요. 다른 하나는 `ON CONFLICT` 절을
유지하는 거예요. transaction 밖에서 부른 쪽이 일부만 적용된 상태를 안전하게
재시도할 수 있는 건 이 절 덕분이에요.

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
  `VALUES` 패턴을 쓰고, 위에서 본 컬럼 수 × 행 수 계산을 같이 기억해 두세요.
  이 statement들도 같은 `Bind` 메시지를 타고 가니까 행 단위로 따로 쪼개야 해요.

경험 법칙: `IN` 절이 수백 개 요소를 넘어설 가능성이 있다면, 500으로
배치하세요. 점진적 성능 저하와 프로토콜 크래시를 모두 방지하는 작은 코드
변경이에요.

가장 늦게 몸에 붙은 건 이 상한이 `IN` 절이 아니라 `Bind` 메시지에 속한다는
점이에요. 여러 행 `INSERT`나 `ON CONFLICT` upsert에서도 똑같이 나타나는데,
거기서는 개수가 리스트처럼 생긴 무언가가 아니라 컬럼 수 × 행 수예요. 세 번을
따로 겪고 나서야 매번 새 버그로 취급하는 걸 그만뒀어요. 어떤 statement의 행당
파라미터 수를 알아두는 것, 그리고 그 숫자를 아는 레이어에서 쪼개는 것. 실제로
두루 쓰이는 건 이 부분이에요.
