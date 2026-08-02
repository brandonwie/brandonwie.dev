---
title: Google Calendar 반복 일정 연산
description: '반복 일정의 `all`, `this`, `thisAndFollowing` 업데이트 구현 패턴이에요.'
date: 2026-01-23T00:00:00.000Z
updated: '2026-08-02'
tags:
  - google-api
  - calendar
  - recurring-events
category: google
draft: false
lang: ko
source_lang: en
source_slug: recurring-event-operations
source_updated: '2026-08-02'
translation_date: '2026-03-04'
references:
  - url: >-
      https://developers.google.com/workspace/calendar/api/guides/recurringevents
    title: Recurring events — Google Calendar
    type: official
---

## 최소 저장 모델

이후 내용을 구체적으로 설명하기 위해 간단한 저장 모델을 가정할게요. 저장된 이벤트 레코드 하나를 block이라고 부르고, 여기서 중요한 필드는 두 개예요.

- `originalId` — 이 block이 속한 block을 가리키거나 `null`
- `recurrence` — RRULE이거나 `null`

모델은 이게 전부예요. 아래 내용은 모두 이 위에 얹히고, block들의 관계는 트리를 이뤄요.

```text
Parent Block (originalId = null)
  • recurrence rule(RRULE)을 가짐
  • 시리즈의 root
        │
        │ originalId가 parent를 가리킴
        ▼
Exception (`this`)              Sub-series (`thisAndAfter`)
• originalId = parent.id        • originalId = parent.id
• recurrence = null             • recurrence = [RRULE]
• 단일 항목 오버라이드          • 시리즈의 새 분기
```

### Partial Invitation Edge Case

사용자가 반복 시리즈의 일부에만 초대받으면, Google이 exception이나 sub-series처럼 보이지만 다르게 동작하는 이벤트를 만들어요.

아래 표의 첫 번째 열은 Google Events 리소스의 이벤트 `id`예요. 나머지 두 개는 앞 절에서 정의한 모델 필드고요 — parent 포인터와 recurrence rule을 로컬에서 어떤 컬럼으로 미러링하든 그 컬럼이라고 보면 돼요.

| 형태           | Google 이벤트 `id`   | `originalId`          | `recurrence` | 동작                           |
| -------------- | -------------------- | --------------------- | ------------ | ------------------------------ |
| "TA-as-parent" | `{parentId}_R{date}` | 자기 참조 또는 `null` | `!= null`    | 해당 사용자의 root parent 역할 |
| "T-as-single"  | `{parentId}_{date}`  | `null`                | `null`       | 일반 단일 block처럼 동작       |

**"TA-as-parent"**: 사용자가 "이후 모든 일정" 부분에만 초대된 경우예요. 무시하고 넘어갈 수 없을 만큼 흔했어요. TA 스타일 `id`를 갖지만 `originalId`가 자기 참조해요. 이 사용자의 T block들은 이 block을 parent로 가리켜요.

**"T-as-single"**: 사용자가 단일 항목에만 초대된 경우예요. 이상한 형태들 중에서는 이게 압도적으로 많았어요. Exception 스타일 `id`를 갖지만 `originalId`나 `recurrence`가 없어요. Recurring event 처리 파이프라인에 들어가지 않아요.

핵심은 이거예요. `id` 패턴만으로는 block 타입을 판별할 수 없고, 필드 조합을 봐야 해요.

### Block 타입 식별 (코드 레벨)

Block 타입은 `id` 패턴이 아니라 필드 조합으로 결정돼요:

| 타입           | originalId | recurrence |
| -------------- | ---------- | ---------- |
| Parent         | `null`     | `!= null`  |
| TA(sub-series) | → parent   | `!= null`  |
| T(exception)   | → parent   | `null`     |
| "TA-as-parent" | 자기 참조  | `!= null`  |
| "T-as-single"  | `null`     | `null`     |

인스턴스 확장에서 중요한 함의가 하나 있어요. 시리즈를 인스턴스로 확장하는 코드는 보통 생성된 인스턴스마다 그것을 만든 block의 id를 찍어요. Sub-series라면 그 id는 root parent가 아니라 sub-series 자신이에요.

그래서 exception block을 인스턴스에 매칭할 때(예: 확장 목록에서 취소된 항목 제거) 양쪽 모두 먼저 root parent id로 해석해야 해요. 작은 chain resolver가 필요한 지점이에요 — `originalId`가 없는 block에 도달할 때까지 위로 거슬러 올라가고, 자기 참조 케이스를 위해 cycle 보호를 넣는 거죠.

이게 단순 조회가 아니라 루프여야 하는 이유는 체인 분포에 있어요. 거의 모든 exception은 root parent를 곧바로 가리켜요. 자기 참조하는 "TA-as-parent"가 그다음으로 많고요. 한 홉보다 깊은 체인은 드물지만 0은 아니고, 두 홉보다 깊은 것도 있었어요. 한 번만 역참조하면 압도적 다수에는 맞고 나머지에는 조용히 틀려요 — 생각해낼 만한 테스트에서는 전부 통과하니까, 실패 양상 중에 제일 나쁜 쪽이에요.

## 연산 유형

| 연산               | 복잡도   | 설명                                |
| ------------------ | -------- | ----------------------------------- |
| `all`              | 낮음     | 전체 시리즈 업데이트                |
| `this`             | 낮음     | 단일 항목 업데이트(exception)       |
| `thisAndFollowing` | **높음** | 시리즈 분할, 해당 지점부터 업데이트 |

## All 연산

Parent block과 모든 자식(exception, sub-series)을 업데이트해요.

| Block 타입 | 변경 내용                        |
| ---------- | -------------------------------- |
| Parent     | 콘텐츠/시간/recurrence 업데이트  |
| Exception  | 콘텐츠 업데이트(시간 유지)       |
| Sub-series | 콘텐츠 업데이트(recurrence 유지) |

## This 연산

Exception을 생성하거나 업데이트해요. Parent와 다른 단일 항목이에요.

```typescript
{
  originalId: parent.id,           // Parent를 가리킴
  recurrence: null,                // Exception은 recurrence 없음
  originalStartDateTime: Date,     // Parent 시리즈에서의 원래 슬롯
  startDateTime: Date,             // 시간이 변경됐으면 다를 수 있음
}
```

## ThisAndFollowing 연산

가장 복잡해요. **divide**와 **non-divide**로 분류돼요:

| 기준             | Divide                       | Non-Divide                            |
| ---------------- | ---------------------------- | ------------------------------------- |
| 시간 변경?       | 네                           | 아니요                                |
| Recurrence 변경? | 네                           | 아니요                                |
| 생성 결과        | 새 시리즈(`originalId=null`) | 연결된 시리즈(`originalId=parent.id`) |
| 분할 후 삭제?    | 네                           | 아니요(콘텐츠 업데이트)               |

```typescript
const divide = timeChanged || changeRecurrence;
```

## Case 분류

| Case    | 설명                             | Divide? | 동작                                              |
| ------- | -------------------------------- | ------- | ------------------------------------------------- |
| **C-1** | Sub-series 시작점에서 divide     | 네      | Sub-series 삭제 + 새로 생성                       |
| **C-2** | 중간에서 divide                  | 네      | UNTIL 설정 + 이후 삭제 + 새로 생성                |
| **D-1** | Sub-series 시작점에서 non-divide | 아니요  | 콘텐츠 현재 위치에서 업데이트                     |
| **D-2** | 중간에서 non-divide              | 아니요  | UNTIL 설정 + 연결된 시리즈 생성 + 콘텐츠 업데이트 |

## UNTIL 규칙 알고리즘

### 규칙 1: Source Block 식별

```typescript
if (requestedBlock has originalId AND has recurrence) {
  sourceBlock = requestedBlock;  // Sub-series
} else if (requestedBlock has originalId AND no recurrence) {
  sourceBlock = parent;          // `this` exception
} else {
  sourceBlock = requestedBlock;  // Parent
}
```

### 규칙 2: Source UNTIL 업데이트

```text
sourceBlock.UNTIL = splitPoint - 1 day
```

### 규칙 3: Blocking Block 찾기

```typescript
blockingBlock = relatedBlocks
  .filter(
    (block) =>
      block.recurrence !== null &&
      getBlockStart(block) > splitPoint &&
      block.deletedAt === null,
  )
  .sort((a, b) => getBlockStart(a) - getBlockStart(b))[0];
```

### 규칙 4: 새 Block의 UNTIL 설정

```typescript
if (blockingBlock) {
  newBlock.UNTIL = blockingBlock.start - 1 day;
} else {
  newBlock.UNTIL = sourceBlock.originalUNTIL;  // 상속
}
```

## 핵심 개념

### Blocking Block

새 `thisAndFollowing`이 얼마나 멀리 확장될 수 있는지 제한하는 sub-series예요:

```text
Timeline:     1   2   3   4   5   6   7   8   9  10
Parent:       [===============]
              UNTIL=5
Sub-series:                   [===================]
                              starts at 6

3일에서 thisAndFollowing 선택:
→ 새 block은 5일까지만 확장 가능 (sub-series에 의해 차단)
```

### UNTIL 상속

Blocking block이 없으면 새 block은 source에서 UNTIL을 상속해요:

```text
Sub-series(11-15, UNTIL=15)
13일 선택 (이후에 blocking block 없음):
→ 새 block UNTIL = 15 (source에서 상속)
```

## 흔한 실수

### 1. 잘못된 Source에서 UNTIL 상속

Sub-series에서 분할할 때는 parent가 아닌 sub-series에서 UNTIL을 상속해야 해요:

```text
Parent(1-14, UNTIL=14)
Sub-series(15-24, UNTIL=24)

20일 선택:
❌ 잘못: UNTIL=14 (parent에서) → 보이지 않게 됨
✅ 올바름: UNTIL=24 (sub-series에서)
```

### 2. 쿼리 필터링

`UNTIL < startDate`인 block은 필터링돼요. 올바르게 생성된 block이라도 UNTIL이 잘못되면 "보이지 않게" 될 수 있어요.

### 3. TypeORM update() vs save()

엔티티가 변경됐을 수 있으면 `repo.update(id, { field })`를 사용하세요:

```typescript
// 잘못됨 - 변경된 엔티티를 저장할 수 있음
await repo.save(block);

// 올바름 - 대상 지정 업데이트
await repo.update(block.id, {
  recurrence: updatedRecurrence,
});
```
