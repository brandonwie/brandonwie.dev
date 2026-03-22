---
title: TypeORM으로 PostgreSQL Advisory Lock 사용하기
description: PostgreSQL이 관리하는 애플리케이션 수준의 lock으로 분산 환경에서 작업을 조율하는 방법.
date: 2026-01-23T00:00:00.000Z
updated: '2026-03-22'
tags:
  - backend
  - postgresql
  - database
  - work
category: backend
draft: false
lang: ko
source_lang: en
source_slug: postgresql-advisory-locks
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: 'https://www.postgresql.org/docs/current/explicit-locking.html'
    title: Explicit Locking — PostgreSQL Documentation
    type: official
---

## 주요 특성

| 속성      | 값                                             |
| --------- | ---------------------------------------------- |
| Lock ID   | `bigint` (`integrationId` 같은 엔티티 ID 사용) |
| 저장 위치 | PostgreSQL 공유 메모리                         |
| 가시성    | 모든 커넥션에서 확인 가능(분산)                |
| 범위      | **세션 범위**(데이터베이스 커넥션에 종속)      |
| 자동 해제 | 커넥션 종료 시 자동 해제                       |

## SQL 명령어

```sql
-- 획득 (논블로킹, 즉시 true/false 반환)
SELECT pg_try_advisory_lock(123);

-- 해제
SELECT pg_advisory_unlock(123);

-- 활성 lock 조회
SELECT locktype, objid AS lock_id, pid, granted
FROM pg_locks WHERE locktype = 'advisory';

-- 어떤 커넥션이 lock을 보유하고 있는지 확인
SELECT l.objid, p.pid, p.application_name, p.client_addr
FROM pg_locks l
JOIN pg_stat_activity p ON l.pid = p.pid
WHERE l.locktype = 'advisory';
```

## 핵심 규칙: 세션 범위

**lock을 획득한 커넥션만 해제할 수 있어요.**

```text
Lock Table:
┌─────────┬─────────────┬─────────┐
│ Lock ID │ Session/PID │ Granted │
├─────────┼─────────────┼─────────┤
│    5    │    1234     │  true   │ ← PID 1234만 해제 가능
└─────────┴─────────────┴─────────┘
```

## TypeORM: Connection Pool vs QueryRunner

### Connection Pool(기본값) - lock에 사용하면 안 돼요

```typescript
// ❌ Advisory lock에 사용하면 안 됨
await this.dataSource.query("SELECT pg_try_advisory_lock($1)", [id]);
// 매번 풀에서 랜덤한 커넥션을 가져옴!
```

### QueryRunner(전용 커넥션) - 올바른 방법

```typescript
// ✅ Advisory lock에 올바른 방법
const qr = dataSource.createQueryRunner();
await qr.connect();     // 전용 커넥션 획득
await qr.query(...);    // 항상 같은 커넥션 사용
await qr.query(...);    // 여전히 같은 커넥션
await qr.release();     // 풀에 반환
```

**QueryRunner를 사용해야 할 때:**

- 트랜잭션(같은 커넥션이어야 함)
- Advisory lock(같은 세션이어야 함)
- 커넥션 친화성이 필요한 모든 작업

## 구현 패턴

lock별로 전용 QueryRunner를 Map에 저장해요.

```typescript
@Injectable()
export class LockService {
  private readonly lockConnections = new Map<number, QueryRunner>();

  async acquireLock(id: number): Promise<boolean> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();

    const result = await qr.query(
      "SELECT pg_try_advisory_lock($1) as acquired",
      [id],
    );

    if (result[0]?.acquired) {
      this.lockConnections.set(id, qr); // 해제용으로 저장
      return true;
    }

    await qr.release();
    return false;
  }

  async releaseLock(id: number): Promise<boolean> {
    const qr = this.lockConnections.get(id);
    if (!qr) return false;

    try {
      const result = await qr.query(
        "SELECT pg_advisory_unlock($1) as released",
        [id],
      );
      return result[0]?.released ?? false;
    } finally {
      this.lockConnections.delete(id);
      await qr.release();
    }
  }
}
```

## 멀티 Pod(ECS) 환경에서의 고려사항

```text
┌─────────┐      ┌─────────┐      ┌─────────┐
│  Pod A  │      │  Pod B  │      │  Pod C  │
│ Map:{5} │      │ Map:{}  │      │ Map:{}  │
└────┬────┘      └────┬────┘      └────┬────┘
     └────────────────┼────────────────┘
                      ▼
            ┌─────────────────┐
            │   PostgreSQL    │
            │ Lock 5: Pod A   │ ← 진실의 원천
            └─────────────────┘
```

| 시나리오                            | 동작                                          |
| ----------------------------------- | --------------------------------------------- |
| Pod A가 동기화 중일 때 Pod B가 요청 | Pod B의 `pg_try_advisory_lock`이 `false` 반환 |
| Pod A가 작업 중 크래시              | PostgreSQL이 lock 자동 해제(커넥션 종료)      |
| 같은 Pod에서 동시 요청              | Map이 ID당 하나의 QueryRunner만 보장          |

## FAQ: 인메모리 Map은 안전한가요?

**Q: 컨테이너가 스케일링될 때 인메모리 Map에 문제가 생기지 않나요?**

**A: 아니요.** 획득과 해제는 **같은 HTTP 요청**에서 **같은 컨테이너**에서 일어나요. Map은 단일 요청 내에서 추적하는 용도일 뿐이에요. 컨테이너 간 조율은 PostgreSQL의 세션 범위 동작에 의존해요.

## 흔한 실수

1. **`dataSource.query()`를 lock에 사용** - 매번 랜덤 커넥션을 가져와요
2. **다른 세션의 lock을 강제 해제하려는 시도** - 설계상 불가능해요
3. **복구를 위한 타임아웃 의존** - 불필요해요. PostgreSQL이 연결 끊김 시 자동 해제해요
4. **커넥션 풀이 버그를 숨기는 경우** - 풀이 작으면 우연히 커넥션이 재사용될 수 있어요
