---
title: "Two-Phase Deletion 패턴"
description: "rollback이 없는 시스템을 위한 안전한 삭제 패턴 — 먼저 soft-delete하고, 외부 API가 확인해 준 뒤에만 hard-delete해요."
date: 2026-01-26T00:00:00.000Z
updated: "2026-08-02"
tags:
  - backend
  - architecture
  - data-integrity
  - patterns
category: backend
draft: false
lang: ko
source_lang: en
source_slug: two-phase-deletion-pattern
source_updated: "2026-08-02"
translation_date: "2026-03-04"
references:
  - url: "https://typeorm.io/docs/working-with-entity-manager/repository-api/"
    title: Repository APIs — TypeORM Documentation
    type: official
  - url: "https://typeorm.io/docs/working-with-entity-manager/find-options/"
    title: Find Options — TypeORM Documentation
    type: official
---

행 하나를 지우는 건 쉬워요. 하지만 다른 시스템에서도 같이 사라져야 하는 행이라면
얘기가 달라져요. 앞쪽 절반이 이미 커밋된 뒤에 뒤쪽 절반이 실패할 수 있으니까요.

## 문제

캘린더 서비스, 결제 대행사, CRM처럼 외부 서비스에서도 지워야 하는 레코드라면,
즉시 hard-delete하는 건 아직 보내지도 않은 네트워크 호출에 거는 도박이에요.

```typescript
// ❌ 위험: 외부 호출이 실패하면 복구 불가
async deleteEntry(id: number) {
  await this.entryRepo.delete(id);          // DB에서 이미 사라짐
  await this.calendarApi.deleteEvent(id);   // ...여기서 던지면?
}
```

되돌릴 방법이 없어요. 트랜잭션은 이미 커밋됐거든요. 로컬 행은 사라졌고, 원격
이벤트는 그대로 남아 있고, 둘이 연결돼 있었다는 사실을 기억하는 곳은 시스템에
남아 있지 않아요.

## 해결: soft-delete 후 확인

### Phase 1: soft-delete (서비스 레이어)

레코드를 "임시 삭제"로 표시하고, 외부 호출은 큐에 넘겨요.

```typescript
async deleteEntry(id: number) {
  const entry = await this.entryRepo.findOneByOrFail({ id });

  // soft-delete: 삭제 타임스탬프만 기록하고 행은 유지
  await this.entryRepo.softRemove(entry);

  // 외부 호출은 별도 경로에서 처리
  await this.eventQueue.add('delete', { entryId: id });
}
```

호출자 입장에서는 레코드가 즉시 사라져요. 행은 아직 남아 있고요.

### Phase 2: hard-delete (큐 프로세서)

외부 API가 확인해 준 뒤에야 행이 실제로 사라져요.

```typescript
async processDelete(job: Job) {
  const entry = await this.entryRepo.findOne({
    where: { id: job.data.entryId },
    withDeleted: true, // soft-delete된 행은 기본적으로 제외됨
  });

  await this.calendarApi.deleteEvent(entry.externalEventId);

  await this.entryRepo.delete(entry.id);
}
```

여기서 순서를 지탱하는 ORM 동작이 두 개 있는데, 둘 중 하나만 놓쳐도 패턴이 조용히
깨져요. `softRemove`는 `DELETE`를 실행하는 대신 삭제 타임스탬프를 기록하고
([TypeORM repository API](https://typeorm.io/docs/working-with-entity-manager/repository-api/)),
`withDeleted`는 프로세서가 그 행을 다시 찾을 수 있게 해줘요. soft-delete된 엔티티는
`find` 결과에서 기본적으로 빠지거든요
([TypeORM find options](https://typeorm.io/docs/working-with-entity-manager/find-options/)).
`withDeleted` 없이 조회하면 job이 자기 레코드를 찾지 못해요.

외부 호출이 실패하면 job은 재시도하고, 재시도할 대상인 행은 그대로 남아 있어요.
순서를 이렇게 잡는 이유가 정확히 이거예요.

### 세 번째 phase가 아닌 안전망

큐는 job을 흘려요. API 호출과 hard-delete 사이에서 프로세스가 죽기도 하고요.
그래서 큐가 끝내지 못한 행을 주기적으로 훑는 정리 작업이 필요해요.

```typescript
async reconcile() {
  const orphans = await this.findOrphans();
  for (const orphan of orphans) {
    this.logger.warn('Orphan detected', { id: orphan.id });
    await this.entryRepo.delete(orphan.id);
  }
}
```

여기서는 삭제보다 로그 한 줄이 더 중요해요. orphan 수가 늘어난다는 건 큐 경로가
망가졌다는 신호인데, 로그가 없으면 이 정리 작업이 자기가 치우고 있는 실패를 조용히
가려버려요.

## 흐름도

```text
요청 → 서비스 레이어(soft-delete) → 큐 job
                                       ↓
                                  큐 프로세서
                                       ↓
                                외부 API 성공?
                                /           \
                              예            아니오
                               ↓              ↓
                         Hard-delete    재시도/알림
                               ↓
                       정리 작업(safety net)
```

## 언제 사용하면 좋을까

| 시나리오               | Two-Phase 사용?   |
| ---------------------- | ----------------- |
| 외부 API도 삭제해야 함 | 사용              |
| 데이터베이스만 삭제    | 불필요(직접 삭제) |
| rollback 메커니즘 없음 | 사용              |
| 중요한 사용자 데이터   | 사용              |

## 주요 구현 세부사항

### soft-delete vs status 필드

soft-delete는 기본 쿼리에서 행을 숨겨요. 보통은 그게 원하는 동작이죠. 그런데 반복
일정(recurring series)에서는 이 전제가 무너져요.

반복 이벤트의 취소된 occurrence는 "없는 레코드"가 아니에요. "이 회차는 취소됐다"고
말하는 게 존재 이유인 레코드거든요. 이걸 soft-delete하면 취소를 담고 있던 행이 읽기
경로에서 안 보이게 되니까, 시리즈는 취소가 없었던 것처럼 렌더링돼요.

```typescript
// 취소된 occurrence는 호출자에게 계속 보여야 하므로
// soft-delete 대신 status를 바꿔요.
if (isRecurringException(entry)) {
  entry.status = EntryStatus.Cancelled;
  await this.entryRepo.save(entry);
} else {
  await this.entryRepo.softRemove(entry);
}
```

정리하면 이런 기준이에요. soft-delete는 "사라졌지만 복구 가능하다"는 뜻이고, status
필드는 "여전히 여기 있고, 그 상태 자체가 답의 일부"라는 뜻이에요.

### orphan 탐지는 양쪽 관계를 다 봐야 해요

행 하나를 지우면 서로 다른 두 종류의 레코드가 붕 뜰 수 있고, 찾는 방법도 달라요.

1. 지워진 행을 부모로 가리키는 행
2. 지워진 외부 이벤트 id를 JSON 컬럼 안에서 참조하는 행

```typescript
// 지워진 행을 가리키는 자식 레코드
await this.entryRepo.delete({ parentId: deletedEntryId });

// JSON 컬럼 안에서 지워진 이벤트 id를 참조하는 레코드
await this.entryRepo.delete({
  externalData: { seriesId: deletedExternalEventId },
});
```

놓치기 쉬운 쪽은 두 번째예요. 첫 번째는 foreign key가 알아서 잡아주지만, JSON
페이로드 안에 묻힌 참조에는 제약 조건이 없어요. 결국 남는 건 "그걸 쿼리해야 한다는
사실을 기억하는 것"뿐이에요.

## 핵심 교훈

1. **관심사 분리** — 서비스 레이어가 표시하고, 큐가 확인하고, 정리 작업이 훑어요.
2. **다층 방어** — 큐 프로세서 + 정리 작업이면 실패 하나가 데이터 손실로 이어지지
   않아요.
3. **orphan 로깅** — 놓친 정리 작업을 볼 수 있는 유일한 창구예요.
4. **status는 삭제가 아니에요** — 의미도 다르고, 읽기 경로에 미치는 영향도 달라요.
5. **기존 잘못된 데이터를 염두에 두기** — 패턴이 생기기 전에 붕 뜬 행들도 빠져나갈
   경로가 필요해요.
