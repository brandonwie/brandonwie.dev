---
title: TypeScript Type Narrowing을 Assertion보다 우선하기
description: 프로덕션 코드에서 non-null assertion(!)과 강제 캐스팅(as Type) 대신 type narrowing을 사용해야 하는 이유
date: 2026-02-05T00:00:00.000Z
updated: 2026-02-05T00:00:00.000Z
tags:
  - backend
  - typescript
  - best-practices
category: backend
draft: false
lang: ko
source_lang: en
source_slug: typescript-type-narrowing
source_updated: '2026-03-22'
translation_date: '2026-02-12'
references:
  - url: 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html'
    title: TypeScript Handbook - Narrowing
    type: official
---

"gcalId는 DB 쿼리에 의해 non-null이 보장됨"이라는 주석과 함께 `!` assertion이
있는 함수가 있었어요. 그런데 마이그레이션이 쿼리를 변경하면서 그 보장이
깨졌고, 함수가 프로덕션에서 런타임 에러를 던지기 시작했어요. TypeScript
컴파일러는 제가 `!`로 "믿어달라"고 했기 때문에 경고하지 않았죠.

Non-null assertion과 강제 캐스팅(`as Type`)은 TypeScript의 타입 검사를
우회해요. 컴파일은 잘 되지만 미래의 변경에 대한 지뢰를 만들어요. Type
narrowing은 실제 런타임 검사로 같은 역할을 하기 때문에, 가정이 깨졌을 때
크래시 대신 우아한 처리를 얻을 수 있어요.

## 문제 상황

```typescript
// BAD: Assumes gcalId exists without runtime check
function processBlock(block: Block) {
  console.log(block.gcalId!.length); // Runtime error if null
}
```

`!`는 TypeScript에게 "이거 null 아니야, 날 믿어"라고 말하는 거예요. 하지만
TypeScript는 런타임 데이터베이스 보장을 검증할 수 없고, DB 쿼리는 바뀌어요.
마이그레이션 버그가 생기고, 엣지 케이스에서 부분 데이터가 나타나요. `!`는
프로덕션에서 터질 때까지 이 모든 문제를 숨겨요.

## 어려웠던 점들

"그냥 null 체크 추가하면 되지"보다 여러 요소가 이 변경을 어렵게 만들었어요.

원래 코드는 "DB 쿼리에 의해 non-null 보장"이라는 주석과 함께
`block.gcalId!`를 사용했어요. "절대 null이 아닌 걸 알면서" `if (!gcalId)
continue`를 추가하는 건 불필요하게 느껴졌어요. 하지만 프로덕션 엣지 케이스
-- 마이그레이션 버그, 부분 데이터 -- 가 그 가정이 틀렸다는 걸 증명했어요.

올바른 가드 응답을 선택하는 것도 중요해요. 각 narrowing 가드는 다른 액션이
필요해요: 루프에서는 `continue`, 함수에서는 조기 `return`, 불변 조건
위반에서는 `throw`. 잘못된 것을 선택하면 데이터가 조용히 빠지거나 프로세스가
크래시돼요.

커스텀 type guard(`block is BlockWithCalendar`)는 강력하지만 보일러플레이트가
추가돼요. 단순한 null 체크로 충분한 경우와 재사용 가능한 가드가 필요한 경우를
구분하는 법을 배워야 했어요.

## 해결 방법

로컬 변수로 추출하고 가드를 사용하세요:

```typescript
// GOOD: Runtime check with type narrowing
function processBlock(block: Block) {
  const { gcalId } = block;
  if (!gcalId) return; // or throw, or continue

  console.log(gcalId.length); // TypeScript knows gcalId is string
}
```

가드 이후에 TypeScript가 타입을 자동으로 좁혀줘요. Assertion이 필요 없어요.

## 세 가지 패턴

### Early Return / Continue

가장 흔한 패턴이에요. 구조 분해, 가드, continue:

```typescript
for (const block of blocks) {
  const { gcalId } = block;
  if (!gcalId) continue;

  // gcalId is guaranteed non-null here
  results.push(gcalId);
}
```

### Type Guard 함수

여러 곳에서 나타나는 복잡한 타입 검사에 사용해요:

```typescript
type BlockWithCalendar = Block & { calendar: Calendar };

function hasCalendar(block: Block): block is BlockWithCalendar {
  return block.calendar !== null;
}

// Usage
if (hasCalendar(block)) {
  console.log(block.calendar.id); // Safe
}
```

### 검증 후 Intersection Type

경계에서 검증하고 더 강한 타입을 하위로 전달할 때:

```typescript
function validateBlock(block: Block): BlockWithCalendar {
  if (!block.calendar) {
    throw new BlockBadRequestException("Calendar is required");
  }
  return block as BlockWithCalendar; // Safe: validated above
}
```

이것은 `as Type`이 허용되는 몇 안 되는 경우 중 하나예요 -- 같은 스코프에서
명시적 검증 직후에 사용하는 경우.

## 실제 코드 예시

이 패턴을 만들게 된 실제 코드 변경이에요. 변경 전:

```typescript
export function identifyStaleBlockIds(
  existingBlocks: StaleBlockCandidate[],
  googleEventGcalIds: Set<string>,
): number[] {
  const staleBlockIds: number[] = [];
  for (const block of existingBlocks) {
    // NOTE: gcalId is guaranteed non-null by DB query
    if (!googleEventGcalIds.has(block.gcalId!)) {
      staleBlockIds.push(block.id);
    }
  }
  return staleBlockIds;
}
```

변경 후:

```typescript
export function identifyStaleBlockIds(
  existingBlocks: StaleBlockCandidate[],
  googleEventGcalIds: Set<string>,
): number[] {
  const staleBlockIds: number[] = [];
  for (const block of existingBlocks) {
    const { gcalId } = block;
    if (!gcalId) continue; // Defensive guard

    if (!googleEventGcalIds.has(gcalId)) {
      staleBlockIds.push(block.id);
    }
  }
  return staleBlockIds;
}
```

변경은 작아요 -- 두 줄 추가. 하지만 그 두 줄 덕분에 예상치 못한 null을
크래시 대신 우아하게 처리해요.

## Assertion이 허용되는 경우

| 시나리오                | 허용 | 예시                                             |
| ----------------------- | ---- | ------------------------------------------------ |
| 명시적 검증 후          | Yes  | null 체크 후 `return block as BlockWithCalendar` |
| 테스트 파일에서         | Yes  | `expect(result!.id).toBe(1)`                     |
| Type narrowing 헬퍼     | Yes  | 적절한 type guard와 함께                         |
| 검증 없는 프로덕션 코드 | No   | `block.gcalId!`                                  |

테스트 파일이 주요 예외예요. 테스트에서의 non-null assertion은 괜찮아요.
테스트 실패가 안전망이고, narrowing 가드는 `expect(result!.id).toBe(1)` 같은
assertion에 노이즈만 추가하니까요.

## 실전 가이드

nullable 프로퍼티에 접근하는 모든 프로덕션 코드에서 type narrowing을
사용하세요. 외부 데이터(API 응답, DB 결과, 사용자 입력)를 받는 함수의 검증
경계에서 사용하세요. 선택적 필드가 있는 루프 본문에서 사용하세요 -- 구조
분해하고 `continue`로 가드해서 나머지 루프 본문을 깔끔하게 유지하세요.

테스트 파일, 같은 스코프에서의 명시적 검증 후(`as Type`이 안전한 경우), 또는
`.filter(Boolean)` 콜백 내부(언어가 이미 좁혀주는 경우)에서는 narrowing
가드를 사용할 필요 없어요.

이 패턴은 두 줄의 코드가 들어요. 런타임 안전성, 자체 문서화되는 제약 조건,
더 쉬운 디버깅, 그리고 내가 잊고 있던 가정이 깨지는 미래의 변경에 대한
보호를 얻을 수 있어요.
