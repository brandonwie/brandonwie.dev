---
title: 사용자 단위 transaction으로 backfill 원자성 지키기
description: >-
  여러 row를 함께 옮겨야 하는 backfill에서 사용자별 transaction,
  prevalidation, idempotent update, keyset pagination을 조합한 방법이에요.
date: 2026-07-22T00:00:00.000Z
updated: 2026-07-23T00:00:00.000Z
tags:
  - backend
  - backfill
  - transactions
  - typeorm
  - postgresql
  - data-integrity
category: backend
draft: false
lang: ko
source_lang: en
source_slug: per-user-transactional-backfill-atomicity
source_updated: 2026-07-23T00:00:00.000Z
translation_date: 2026-07-23
references:
  - url: 'https://typeorm.io/docs/transactions'
    title: TypeORM transactions
    type: official
  - url: 'https://www.postgresql.org/docs/current/tutorial-transactions.html'
    title: PostgreSQL transactions
    type: official
---

한 사용자의 여러 row를 옮기는 backfill을 만들다가 실패 경계를 먼저 정해야
했어요. 전체 dataset을 한 transaction으로 묶으면 lock을 너무 오래 잡고,
row마다 따로 갱신하면 한 사용자만 절반쯤 옮겨진 상태가 남을 수 있었어요.

중간 지점은 사용자마다 transaction 하나를 쓰는 방식이에요. 다만 row 하나가
validation에 실패하면 선택이 생겨요. 정상인 나머지를 저장할지, 그 사용자의
전체 batch를 되돌릴지 정해야 해요.

## 잘못된 row를 건너뛸지 먼저 검증할지 정해요

잘못된 row만 건너뛰면 진행은 빠르지만 사용자 단위 all-or-nothing contract가
깨져요. 한 사용자의 데이터가 섞인 상태로 남고, 검증 과정에서 부분 이관된
사용자를 계속 추적해야 해요.

반대로 모든 row를 먼저 검증하고 하나라도 잘못되면 중단하면 contract가
명확해져요. 문제가 있는 사용자는 데이터가 고쳐질 때까지 막히지만, 이후
사용자는 각자 transaction에서 계속 처리할 수 있어요.

## rollback 밖으로 실패 정보를 가져와요

typed error에 row 단위 실패를 담으면 transaction이 사라진 뒤에도 보고할 수
있어요.

```typescript
class BackfillValidationError extends Error {
  constructor(readonly failures: FailureDto[]) {
    super('User backfill validation failed');
  }
}

for (const userId of userIds) {
  try {
    const committed = await dataSource.transaction(async (manager) => {
      const rows = await loadEligibleRows(manager, userId);
      const failures = validate(rows);

      if (failures.length > 0) {
        throw new BackfillValidationError(failures);
      }

      return updateEligibleRows(manager, rows);
    });

    totals.updated += committed.updated;
  } catch (error) {
    if (error instanceof BackfillValidationError) {
      totals.usersFailed += 1;
      totals.failures.push(...error.failures);
      continue;
    }
    throw error;
  }
}
```

TypeORM transaction callback 안의 모든 operation은 callback이 받은
transactional entity manager를 써야 해요. 사용자별 count는 callback이
성공한 뒤에만 전체 합계에 더해요. rollback된 transaction 안에서 만든 count는
결과에 들어가면 안 돼요.

## concurrency와 진행 상태를 함께 지켜요

각 update에는 `new_col_a IS NULL AND new_col_b IS NULL`처럼 eligibility
predicate를 다시 넣어요. 정상적인 동시 write가 먼저 끝났다면
`affected === 0`은 transaction 실패가 아니라 상태가 이미 바뀌어서 건너뛴
경우예요.

같은 predicate 덕분에 재실행도 idempotent해져요. 완료된 row는 다음 selection
대상에서 빠지므로 별도의 ID 목록을 만들지 않고 backfill 전체를 다시 돌릴 수
있어요.

owner ID는 안정적인 순서와 keyset pagination으로 순회해요.

```sql
SELECT DISTINCT owner_id
FROM items
WHERE new_col_a IS NULL AND owner_id > $1
ORDER BY owner_id
LIMIT $2;
```

cursor는 계속 줄어드는 eligibility 집합이 아니라 owner ID를 기준으로
이동해요. 영구적으로 잘못된 사용자가 반복해서 실패해도 전체 scan이 같은
page에 갇히지 않아요.

soft-delete row도 명시적으로 결정해야 해요. TypeORM read에서는 기본적으로
빠질 수 있지만 직접 update에는 포함될 수 있어요. 포함 여부를 정하고 test로
증명해요.

## 이 단위가 맞는 경우

한 사용자의 row가 함께 이동해야 하고 실패한 사용자가 뒤쪽 사용자를 막으면 안
되는 backfill에 잘 맞아요. row가 완전히 독립적이라면 단일 statement update가
더 단순해요. 한 사용자의 데이터가 너무 커서 transaction이 lock을 오래 잡는
경우에도 다른 단위가 필요해요.

완료 신호는 endpoint가 실행됐다는 사실이 아니에요. 이관 대상 row가 남아 있지
않고, 실패한 사용자마다 고칠 수 있는 보고가 있어야 끝난 거예요.
