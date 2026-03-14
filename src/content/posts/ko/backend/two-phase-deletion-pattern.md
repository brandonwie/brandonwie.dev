---
title: "Two-Phase Deletion 패턴"
description: "rollback 기능이 없는 시스템에서 외부 API 호출이 성공해야만 데이터를 영구 삭제하는 안전한 삭제 패턴."
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
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
source_updated: "2026-01-26"
translation_date: "2026-03-04"
references:
  - url: "https://www.postgresql.org/docs/current/sql-update.html"
    title: UPDATE — PostgreSQL Documentation
    type: official
---

## 문제

외부 서비스(예: Google Calendar)에서도 삭제해야 하는 데이터를 즉시 hard-delete하면 위험해요.

```typescript
// ❌ 위험: Google API 실패 시 복구 불가
async deleteBlock(id: number) {
  await this.blockRepo.delete(id);        // DB에서 삭제됨
  await this.googleApi.deleteEvent(id);   // 여기서 실패하면?
}
```

Google API 호출이 실패하면 데이터는 이미 데이터베이스에서 사라진 상태에요.

## 해결: 2단계 삭제

### Phase 1: Soft-Delete (서비스 레이어)

레코드를 실제로 삭제하지 않고 "임시 삭제" 표시만 해요.

```typescript
async deleteBlock(id: number) {
  // Soft-delete: deletedAt 설정, 레코드 유지
  await this.blockRepo.softRemove(block);

  // 외부 API 호출을 큐에 추가
  await this.eventQueue.add('delete', { blockId: id });
}
```

### Phase 2: Hard-Delete (큐 프로세서)

외부 API가 확인되면 영구 삭제해요.

```typescript
async processDelete(job: Job) {
  const block = await this.blockRepo.findOne({
    where: { id: job.data.blockId },
    withDeleted: true,  // soft-delete된 것도 포함
  });

  // 외부 API에 확인
  await this.googleApi.deleteEvent(block.gcalId);

  // 이제 hard-delete해도 안전
  await this.blockRepo.delete(block.id);
}
```

### Phase 3: Safety Net (동기화 레이어)

큐 프로세서가 놓친 참조가 끊긴 레코드를 정리해요.

```typescript
async sync() {
  // 참조가 끊긴 레코드 감지 및 정리
  const orphans = await this.findOrphans();
  for (const orphan of orphans) {
    this.logger.warn('Orphan detected', { id: orphan.id });
    await this.blockRepo.delete(orphan.id);
  }
}
```

## 흐름도

```text
사용자 요청 → 서비스 레이어(soft-delete) → 큐 Job
                                                ↓
                                          큐 프로세서
                                                ↓
                                          Google API 성공?
                                          /           \
                                        예             아니오
                                         ↓              ↓
                                   Hard-delete    재시도/알림
                                         ↓
                                     동기화 레이어(safety net)
```

## 언제 사용하면 좋을까

| 시나리오               | Two-Phase 사용?   |
| ---------------------- | ----------------- |
| 외부 API 필요          | 사용              |
| 데이터베이스만 삭제    | 불필요(직접 삭제) |
| rollback 메커니즘 없음 | 사용              |
| 중요한 사용자 데이터   | 사용              |

## 주요 구현 세부사항

### Soft-Delete vs Status 필드

일부 엔티티에서는 soft-delete(`deletedAt`)가 쿼리에서 숨겨요. 하지만 때로는 가시성이 필요해요.

```typescript
// T block은 itemStatus=Deleted가 필요 (클라이언트에 보여야 함)
// deletedAt은 안 됨 (쿼리에서 숨겨짐)
if (isTBlock(block)) {
  block.itemStatus = BlockStatus.Deleted;
  // deletedAt을 설정하면 안 됨 - 클라이언트가 취소 마커를 봐야 함
} else {
  await this.blockRepo.softRemove(block);
}
```

### 참조가 끊긴 레코드 감지

부모 관계와 원본 관계를 모두 추적해야 해요.

```typescript
// Gap 1: 직접 자식 (originalId)
await this.blockRepo.delete({ originalId: deletedBlockId });

// Gap 2: Divergence chain (JSON 내 recurringEventId)
await this.blockRepo.delete({
  googleEventData: { recurringEventId: deletedGcalId },
});
```

## 핵심 교훈

1. **관심사 분리** - 서비스 레이어가 표시, 큐가 확인, 동기화가 정리
2. **다층 방어** - 큐 프로세서 + 동기화 레이어 = 이중 안전장치
3. **참조가 끊긴 레코드 로깅** - 놓친 정리 작업에 대한 가시성 확보
4. **Status vs 삭제** - 용도에 따라 다른 의미론 적용
5. **하위 호환성** - 기존 잘못된 데이터를 점진적으로 처리
