---
title: Race Condition 방지를 위한 Pessimistic Locking
description: INSERT 전 존재 여부를 확인할 때 race condition을 방지하기 위해 SELECT FOR UPDATE를 사용하는 방법.
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - backend
  - database
  - concurrency
  - patterns
category: backend
draft: false
lang: ko
source_lang: en
source_slug: pessimistic-locking-race-conditions
source_updated: '2026-03-15'
translation_date: '2026-03-04'
references:
  - url: 'https://www.postgresql.org/docs/current/explicit-locking.html'
    title: Explicit Locking — PostgreSQL Documentation
    type: official
---

## 문제

잠금 없는 check-then-insert 패턴이에요:

```typescript
// ❌ RACE CONDITION
async createIfNotExists(integrationId: number, calendarId: string) {
  // 두 프로세스가 동시에 체크
  const existing = await this.repo.findOne({ integrationId, calendarId });

  if (!existing) {
    // 두 프로세스 모두 없다고 판단
    await this.repo.save({ integrationId, calendarId }); // DUPLICATE KEY ERROR!
  }
}
```

**타임라인:**

```text
Process A: findOne() → null
Process B: findOne() → null
Process A: save() → 성공
Process B: save() → ERROR: duplicate key
```

## 해결: Pessimistic Write Lock

```typescript
async createIfNotExists(integrationId: number, calendarId: string) {
  return this.dataSource.transaction(async (manager) => {
    // 기존 행을 잠그거나, 잠금 해제를 대기
    const existing = await manager
      .createQueryBuilder(Channel, 'channel')
      .setLock('pessimistic_write')
      .where('channel.integrationId = :integrationId', { integrationId })
      .andWhere('channel.calendarId = :calendarId', { calendarId })
      .getOne();

    if (existing) {
      return existing; // 이미 있으면 반환
    }

    // 기존 행 없음 - 안전하게 insert
    const newChannel = manager.create(Channel, { integrationId, calendarId });
    return manager.save(newChannel);
  });
}
```

## 중요한 주의사항

**`SELECT FOR UPDATE`는 기존 행만 잠가요.**

행이 없으면 두 트랜잭션 모두 SELECT를 통과할 수 있어요. 안전망을 추가하세요:

```typescript
async createIfNotExists(integrationId: number, calendarId: string) {
  return this.dataSource.transaction(async (manager) => {
    const existing = await manager
      .createQueryBuilder(Channel, 'channel')
      .setLock('pessimistic_write')
      .where('channel.integrationId = :integrationId', { integrationId })
      .andWhere('channel.calendarId = :calendarId', { calendarId })
      .getOne();

    if (existing) return existing;

    try {
      const newChannel = manager.create(Channel, { integrationId, calendarId });
      return await manager.save(newChannel);
    } catch (error) {
      // 안전망: duplicate key 에러 잡기(Postgres 에러 23505)
      if (error.code === '23505') {
        return manager.findOne(Channel, {
          where: { integrationId, calendarId }
        });
      }
      throw error;
    }
  });
}
```

## Lock 타입

| Lock 타입                   | 사용 사례      | 동작                     |
| --------------------------- | -------------- | ------------------------ |
| `pessimistic_read`          | 읽기 전용 작업 | 쓰기를 차단, 읽기는 허용 |
| `pessimistic_write`         | 수정 작업      | 모든 접근을 차단         |
| `pessimistic_partial_write` | 특정 컬럼      | TypeORM 전용             |

## 고려한 대안

| 접근 방식            | 장점           | 단점                     |
| -------------------- | -------------- | ------------------------ |
| Optimistic locking   | 잠금 경합 없음 | 재시도 로직 필요         |
| Redis lock           | 서비스 간 동작 | 의존성 추가              |
| Unique constraint만  | 단순함         | 에러 발생, API 호출 낭비 |
| **Pessimistic lock** | 표준 SQL 패턴  | 짧은 잠금 경합           |

## 사용 시점

- 동일 키에 대한 중복 INSERT 방지
- 경합이 낮은 중요 리소스
- DB 체크 후 외부 API 호출(API 호출을 낭비하지 않기 위해)
- 높은 빈도의 동시 접근에는 부적합(optimistic 고려)
- 장기 실행 작업에는 부적합(잠금이 다른 작업을 차단)

## TypeORM 구현

```typescript
// 방법 1: QueryBuilder
await manager
  .createQueryBuilder(Entity, "e")
  .setLock("pessimistic_write")
  .where("e.id = :id", { id })
  .getOne();

// 방법 2: FindOptions(유연성이 낮음)
await manager.findOne(Entity, {
  where: { id },
  lock: { mode: "pessimistic_write" },
});
```

## 핵심 교훈

1. **트랜잭션 안에서 잠금** - 반드시 트랜잭션 경계 내에서 사용하세요
2. **행이 없으면 잠금도 없어요** - duplicate key 에러 처리를 안전망으로 추가하세요
3. **잠금은 짧게** - 필요한 것만 잠그고 빠르게 해제하세요
4. **패턴을 문서화하세요** - 나중에 보는 개발자에게는 명확하지 않을 수 있어요
