---
title: TypeScript Type Narrowing을 Assertion보다 우선하기
description: 프로덕션 코드에서 non-null assertion(!)과 강제 캐스팅(as Type) 대신 type narrowing을 사용해야 하는 이유
date: 2026-02-05T00:00:00.000Z
updated: '2026-07-31'
tags:
  - backend
  - typescript
  - best-practices
category: backend
draft: false
lang: ko
source_lang: en
source_slug: typescript-type-narrowing
source_updated: '2026-07-31'
translation_date: '2026-07-31'
references:
  - url: 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html'
    title: TypeScript Handbook - Narrowing
    type: official
---

stale block을 정리하는 helper를 손보다가 `block.gcalId!`를 만났어요. non-null
assertion인데, 옆에는 "gcalId is guaranteed non-null by DB query"라는 주석이
붙어 있었죠. 컴파일러는 조용했고 코드도 깔끔해 보였어요. 걸린 건 그 주석이
보장의 전부였다는 점이에요. 컴파일러가 검증할 수 있는 건 하나도 없고, DB
query는 바뀌니까요. 결국 assertion을 guard clause로 바꿨는데, 이 글은 그 한
줄이 왜 남는 장사인지 정리해 보려는 시도에 가까워요.

Non-null assertion(`!`)과 강제 캐스팅(`as Type`)은 TypeScript한테 "날 믿어,
내가 더 잘 알아"라고 말하는 거예요. 타입 에러는 사라지지만 안전성이 늘어나지는
않아요. Type narrowing은 컴파일 시점 검사와 runtime 보호를 같이 주고, 보통 한
줄이면 끝나요.

## 문제 상황

```typescript
// BAD: Assumes gcalId exists without runtime check
function processBlock(block: Block) {
  console.log(block.gcalId!.length); // Runtime error if null
}
```

`!`는 컴파일러가 불평을 멈추게 할 뿐, 값을 non-null로 만들어주지는 않아요.
runtime에 `gcalId`가 `null`이나 `undefined`면 접근하는 지점에서 `TypeError`가
나는데, 보통 그 가정을 세운 코드와는 한참 떨어진 자리예요.

진짜 아픈 건 안전하다는 착각이에요. "DB query에 의해 non-null이 보장됨"이나
"middleware가 항상 채워줌" 같은 주석은 TypeScript가 검증할 수 없는 약속이고,
그 약속이 기대는 것들은 계속 움직여요. query가 다시 쓰이기도 하고, middleware가
refactoring되기도 하고, migration이 아무도 예상 못 한 모양의 row를 넘겨주기도
해요. `!`는 이걸 전부 통과시켜서 프로덕션에서 터질 때까지 데려가요.

## 해결 방법

제가 대신 하는 건 로컬 변수로 구조 분해하고 그 앞에 guard clause를 하나 두는
거예요. 그다음부터는 TypeScript의 control flow 분석이 타입을 좁혀줘요.

```typescript
// GOOD: Runtime check with type narrowing
function processBlock(block: Block) {
  const { gcalId } = block;
  if (!gcalId) return; // or throw, or continue

  console.log(gcalId.length); // TypeScript knows gcalId is string
}
```

가드 뒤부터 TypeScript는 함수의 나머지 구간에서 `gcalId`가 non-null이라는 걸
알아요. assertion이 필요 없고, 주석으로는 막을 수 없는 엣지 케이스를
runtime에서 걸러주기까지 해요.

## 세 가지 패턴

### Early Return / Continue

제일 자주 손이 가는 패턴이에요. 루프에서는 null 항목을 건너뛰는 `continue`,
함수에서는 조기 `return`이에요.

```typescript
for (const block of blocks) {
  const { gcalId } = block;
  if (!gcalId) continue;

  // gcalId is guaranteed non-null here
  results.push(gcalId);
}
```

뒤늦게 체감한 건 `continue`, `return`, `throw`가 서로 바꿔 쓸 수 있는 게
아니라는 점이에요. 가드는 값이 없다는 사실을 어떻게 받아들일지 정하는
자리거든요. `continue`는 그 항목 하나만 건너뛰고 계속 가고, 조기 `return`은
호출 자체를 접고, `throw`는 불변 조건이 깨졌으니 뒤쪽은 아무것도 진행하면 안
된다고 선언해요. 잘못 고르면 조용히 실패해요. `throw`가 맞는 자리에
`continue`를 쓰면 데이터가 소리 없이 빠지고, `continue`가 맞는 자리에 `throw`를
쓰면 잘못된 row 하나가 batch 전체를 날려요.

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

커스텀 type guard는 쓸모가 있지만, 타입이 바뀔 때마다 같이 맞춰줘야 하는
boilerplate이기도 해요. 함수 하나 안에서 null 체크 한 번 하는 정도라면
`if (!x) return` 쪽이 코드도 짧고 안전성도 똑같아요. guard 함수가 값을 하는 건
여러 호출 지점이 같은 모양을 확인해야 할 때, 또는 좁혀진 타입이 매번 적기 싫은
intersection일 때예요.

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

앞에서 말한 stale block 정리 유틸리티가 바로 그 코드예요. 원래는 non-null
assertion에 주석을 붙여 놨어요.

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

가드는 `gcalId`가 null인 block을 크래시 대신 그냥 건너뛰어요. 프로덕션에서는
엣지 케이스 데이터가 섞여 들어와도 함수가 멀쩡한 block들은 계속 처리했다는
뜻이에요. `TypeError` 하나로 sync 작업 전체가 내려앉는 대신에요.

## 가드를 밖으로 빼면 narrowing이 조용히 사라져요

몇 달 뒤 #960으로 추적한 refactoring에서 같은 codebase가 두 번째 교훈을 줬어요.
이번엔 가드 자체에 대한 이야기예요. 중복된 가드를 한곳으로 모으는 건
refactoring 중에서도 가장 평범한 축에 들어요. handler 여섯 개가 똑같은 검사를
들고 있었으니 helper로 옮긴 거죠. 놓치기 쉬운 지점은 runtime 동작이 정말로
똑같다는 데 있어요. 원래의 inline 가드는 두 가지 일을 동시에 하고 있었거든요.

```typescript
// refuses the enqueue AND narrows both fields to non-null below this line
if (event.integrationId === null || event.calendarGcalId === null) return;
```

이걸 `boolean`을 반환하는 helper로 빼면 첫 번째 일만 남아요.

```typescript
// WRONG — refusal preserved, narrowing lost
private isEnqueueableGoogleEvent(event: {...}): boolean
```

그러자 뒤쪽의 `queue.add({ integrationId: event.integrationId })`가 전부
컴파일되지 않았어요. job payload가 그 필드를 `number | undefined`로 선언해
놨는데 `null`은 거기 들어갈 수 없으니까요. runtime 동작은 하나도 안 바뀌었어요.
컴파일러가 신경 쓰는 딱 한 가지만 빼면 충실한 refactoring이었고, 그 하나 때문에
build가 전부 깨졌어요.

해법은 generic parameter 위에 얹은 type predicate예요. narrowing을 다시 호출자
쪽으로 넘겨줘요.

```typescript
private isEnqueueableGoogleEvent<
  TEvent extends { integrationId: number | null; calendarGcalId: string | null },
>(event: TEvent, fnName: string): event is TEvent & {
  integrationId: number;
  calendarGcalId: string;
} {
```

`event is TEvent & {...}`가 문법적으로 허용되는 건 좁혀진 타입이 선언된
parameter 타입에 할당 가능하기 때문이에요. 그리고 `if (!pred(x)) return;`은
inline 가드가 하던 것과 똑같이 나머지 구간에서 `x`를 좁혀줘요.

예상 못 했던 부분은 이거예요. inline `if (...) return;`은 control flow 구문인
_동시에_ 타입 수준의 구문인데, `boolean`을 반환하는 함수는 그중 앞쪽 절반만
대신할 수 있어요. 그래서 null 검사나 모양 검사를 함수 밖으로 들어낼 때는, 뒤쪽
코드가 그 narrowing에 기대고 있었는지 한 번 물어보는 게 좋아요. 기본값을
predicate로 두는 편이 더 싼 습관 같아요. 아무도 narrowing을 안 쓰면 비용이
0이니까요.

솔직하게 짚고 갈 부분도 있어요. 그 repo의 test suite는 이걸 잡아낼 수 없었는데,
test suite 일반의 성질이라기보다 그 설정의 성질이에요. ts-jest가
`diagnostics.warnOnly`로 돌고 있어서 타입 에러가 경고로 내려앉고 실행은 그대로
초록불이 나요. 게다가 diagnostics 범위가 spec 파일로 묶여 있어서, source 파일의
타입 에러는 test 실행 중에 아예 드러나지도 않았어요. ESLint도 타입 검사를 하지
않고요. 그러니 "test 다 통과, lint 깨끗"은 이 refactoring이 안전하다는 증거가
된 적이 없어요. 그 repo에서는 build만이 여기서 걸러낼 수 있는 유일한
관문이었어요.

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

가드를 더해도 얻는 게 없는 자리가 두 군데 더 있어요. 하나는 언어가 이미
narrowing을 해준 곳이에요. `.filter(Boolean)` 콜백 안이나, `.find()` 결과를
방금 truthy 검사한 뒤라면, 가드를 하나 더 두는 건 컴파일러가 이미 아는 걸 다시
말하는 셈이에요. 다른 하나는 드물게 나오는 hot path예요. 안쪽 루프에서 수백만
번 도는 검사이고 불변 조건이 정말 구조적으로 보장된다면 `!`가 정직한 선택일 수
있어요. 다만 여기엔 저 스스로에게도 똑같이 적용하고 싶은 단서가 붙어요.
"구조적으로 보장된다"는 말이 애초에 `block.gcalId!`를 만든 바로 그 표현이거든요.
그 길을 간다면 구조가 정확히 뭘 보장하는지 주석으로 적어두고, 그 구조가 바뀔
때 주석도 다시 검사받게 하고 싶어요.

## 정리

프로덕션 코드에서는 `!` 대신 guard clause(`if (!x) return/continue/throw`)를
쓰는 쪽으로 정리했어요. 로컬 변수로 구조 분해하고, null을 가드하고, 그다음은
TypeScript의 control flow가 타입을 좁히게 두는 거예요. 한 줄 더 쓰는 대신
컴파일 시점 검사와 runtime 크래시 방지를 같이 가져가요. `!`와 `as Type`은
테스트 파일과 명시적 검증 바로 다음 줄에서는 여전히 제 몫을 해요.

제일 강조하고 싶은 건 마지막 항목이에요. 가드가 함수 밖 공용 helper로 옮겨갈
때는 `boolean`이 아니라 type predicate여야 버텨요. 거절은 refactoring을 견디고
살아남는데, narrowing은 조용히 사라지거든요.
