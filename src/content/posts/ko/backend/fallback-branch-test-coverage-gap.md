---
title: Fallback 브랜치 테스트 커버리지 갭
description: 테스트는 통과해요. 커버리지는 100%예요. `|| randomUUID()`를 지워도 모든 게 통과해요. 빌더 기반 fixture가 falsy 브랜치를 어떻게 숨기는가.
date: 2026-04-29T00:00:00.000Z
updated: '2026-08-02'
tags:
  - backend
  - testing
  - coverage
  - knowledge
category: backend
draft: false
lang: ko
source_lang: en
source_slug: fallback-branch-test-coverage-gap
source_updated: '2026-08-02'
translation_date: '2026-04-29'
---

AI 리뷰어가 제 pull request에 인라인 코멘트를 남겼어요: `refreshToken =
user.refreshToken || randomUUID()` 테스트가 truthy 브랜치만 실행하고
있다고요. 모든 기존 테스트는 fluent builder로 refresh token을 채워서
사용자를 만들었어요 — `aUser().withRefreshToken('x')`. 프로덕션에서
`|| randomUUID()`를 빼버려도 모든 테스트가 그대로 통과해요. Fallback은
프로덕션에서 load-bearing이었지만(fresh signup은 refresh token이 null)
suite에는 invisible이었어요. Line-coverage 도구가 절대 못 잡고 AI 리뷰어가
mechanical하게 잡아내는 구조적 커버리지 갭이에요.

## 누가, 언제, 어디서

이 패턴은 빌더나 fixture에서 LHS가 공급되는 `||`나 `??` (또는 단축 평가
fallback) 코드 모든 곳에서 나타나요. 테스트 fixture가 프로덕션 코드가
sometimes-null로 기대하는 값을 미리 채울 때마다 물려요. 핸들러, 서비스,
factory의 unit test에서 — 테스트 setup이 falsy 브랜치를 실행 불가능하게
만드는 모든 곳에서 갭을 찾을 수 있어요.

## 갭이 어떻게 생겼나

프로덕션 코드에 `value = source || generateDefault()` 같은 fallback이
있고 테스트 fixture가 항상 `source`를 채우면, `generateDefault()` 브랜치는
절대 실행 안 돼요. 모든 테스트가 통과해요. 커버리지 도구는 100% 라인
커버리지를 보고할 수도 있어요 — 라인이 실행됐으니까(LHS가 평가되고
short-circuit). 하지만 브랜치 커버리지는 불완전하고 — **`||
generateDefault()`를 지워도 어떤 테스트도 실패하지 않아요.**

이건 다음을 하는 구조적 커버리지 사각지대예요:

- 우발적인 리팩터링을 숨김 (누군가 "정리" 패스에서 fallback 제거 — 보이지
  않는 회귀)
- 프로덕션 전용 실행 경로를 숨김 (fresh signup은 null 필드를 가짐; 기존
  fixture는 미리 채워둠)
- LHS가 fixture 제어 변수일 때 line-coverage gate에 invisible하고
  대부분의 branch-coverage 도구에도 invisible

라인이 "실행됨"으로 잡히는 이유가 바로 short-circuit이에요.
[MDN의 `||` 문서](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_OR)는
왼쪽 피연산자가 truthy면 오른쪽은 "평가되지 않으므로 그로 인한 side
effect도 발생하지 않는다"고 명시해요. 라인은 실행됐지만 그 안의 호출은
실행되지 않았어요. Jest가
[`branches`와 `lines`를 별도의 coverage threshold](https://jestjs.io/docs/configuration#coveragethreshold-object)로
두는 이유도 같아요 — 라인 100%는 브랜치 숫자에 대해 아무것도 말해주지
않아요.

## 왜 함정인가

세 가지가 공모해서 갭을 숨겨요:

1. **빌더 fluency가 테스트를 "완전한" 객체로 편향시켜요.**
   `aUser().withEmail(x).withRefreshToken(y).build()`가
   있으면 `.withRefreshToken(y)` 호출이 ergonomic한 경로예요. 미래의 테스트
   작성자는 기존 테스트에서 copy-paste하면서 미리 채워진 상태를 상속해요.
   빌더가 "complete"를 디폴트로 만들어요; "partial"은 의식적인 노력이
   필요해요.
2. **프로덕션 코드는 "incomplete" 객체를 반환해요.** Fresh signup에 대해
   `{ refreshToken: null }`을 반환하는 factory는 누군가 명시적으로
   `withX()` 호출을 빼지 않으면 테스트 fixture vocabulary에 존재하지
   않아요. Fixture의 디폴트는 테스트하기 편한 걸 반영하지, 프로덕션이 실제로
   emit하는 걸 반영하지 않아요.
3. **커버리지 도구가 라인 수준 실행을 평탄화해요.** `const x = a || b()`는
   한 라인으로 표시돼요. `a`가 truthy면 `b()`는 실행 안 되지만 라인은
   "covered"예요. Branch-coverage 도구는 가끔 잡고, line-coverage 도구는
   절대 못 잡아요.

## 선제적 수정

프로덕션 코드의 모든 `||`나 `??` fallback에 대해 **최소 두 개의 테스트**를
써요:

1. **LHS truthy** — fixture가 값을 미리 채움. Truthy 경로 assert.
2. **LHS falsy** — fixture가 명시적으로 값을 채우지 않음. Fallback 경로가
   실행됐는지 assert (생성된 default가 expected shape를 가짐).

Falsy 테스트는 또한 **input precondition**도 assert해야 해요
(`expect(input.x).toBeNull()`) — fixture 디폴트가 바뀌어도 테스트가 조용히
저하되지 않게요.

## 탐정형 수정

프로덕션 코드에 새 fallback을 추가할 때, 그 코드를 실행하는 모든 테스트를
grep해서 확인해요:

- 모든 테스트가 빌더로 LHS를 미리 채우는가?
- 그렇다면 — LHS를 생략한 평행 테스트 하나를 추가해요.

이 갭을 표시하는 AI review를 받으면 거의 항상 진짜예요 — Claude,
Copilot, Codex 리뷰를 겪어본 경험상 그래요. 패턴은 mechanical하고 AI
리뷰어가 안정적으로 잡아내요 — 긴 diff를 스캔하는 인간 리뷰어보다 훨씬
안정적이에요.

## Fallback이 `randomUUID()`나 random output을 쓸 때

정확한 output을 assert할 수 없지만 다음은 할 수 있어요:

- Shape 매칭: UUID에 대해 `expect.stringMatching(/^[0-9a-f-]{36}$/i)`
- Captured value 대조:
  `expect(updateMock).toHaveBeenCalledWith(id, accessToken, expect.any(String))`
- 리다이렉트 URL이 UUID-shaped param을 포함하는지 assert:
  `expect(result).toMatch(/refreshToken=[0-9a-f-]{36}/i)`

`expect.stringMatching`은 asymmetric matcher라서 `toHaveBeenCalledWith`나
`toEqual` 안에 그대로 넣을 수 있어요. Jest 문서는 "받은 값이 기대한
문자열이나 정규식과 매치되는 문자열이면 매치된다"고 설명해요
([Jest expect 문서](https://jestjs.io/docs/expect#expectstringmatchingstring--regexp)).

"값이 random이라" 테스트를 스킵하지 마세요 — 증명하는 건 **브랜치
실행**이지 specific value가 아니에요.

## Regex 조합 함정

anchor가 있는 regex를 쓴 다음 URL 매치로 조합하면 `^...$` anchor가 URL
매치에 carry돼서 실패해요:

```ts
const uuidPattern = /^[0-9a-f-]{36}$/i;
// 잘못됨: anchor가 substring 매치로 carry됨
new RegExp(`refreshToken=${uuidPattern.source}`, 'i');
```

`source`가 원래 그런 약속이에요. MDN은 이걸
["양쪽 슬래시와 flag를 뺀, 이 정규식의 source text를 담은 문자열"](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/source)로
정의해요 — flag는 빠지지만 anchor는 안 빠져요.

조합할 때 anchor를 떼고 — standalone-arg 매칭에만 유지해요:

```ts
// 재사용 가능한 패턴 body, anchor 없이
const uuidBody = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
expect(arg).toMatch(new RegExp(`^${uuidBody}$`, "i")); // standalone arg에 anchored
expect(url).toMatch(new RegExp(`token=${uuidBody}`, "i")); // substring에 unanchored
```

## 실제 예시

중요한 부분만 남긴 형태예요. 프로덕션 라인:

```ts
const refreshToken = user.refreshToken || randomUUID();
```

기존 테스트는 truthy 브랜치만 실행했어요:

```ts
it("should issue tokens for new user", () => {
  const newUser = aUser()
    .withEmail("test@example.com")
    .withRefreshToken("existing-token") // ← LHS 미리 채워짐
    .build();
  // ... 실행, 통과, randomUUID() 절대 실행 안 됨
});
```

빠진 테스트가 falsy 브랜치를 실행해요:

```ts
it("should generate new refresh token when user has none", () => {
  const newUser = aUser()
    .withEmail("test@example.com")
    // ← .withRefreshToken() 생략 — refreshToken이 null로 남음
    .build();
  expect(newUser.refreshToken).toBeNull(); // precondition guard

  const result = service.handle(input);

  const uuidBody =
    "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  expect(updateTokenMock).toHaveBeenCalledWith(
    newUser.id,
    expect.any(String),
    expect.stringMatching(new RegExp(`^${uuidBody}$`, "i"))
  );
});
```

Precondition guard(`expect(newUser.refreshToken).toBeNull()`)가
load-bearing이에요 — 그게 없으면 미래의 빌더 디폴트 변경이
`refreshToken`을 채워서 테스트를 truthy 케이스의 중복으로 조용히
바꿔버릴 수 있어요.

## 핵심 포인트

- `value || fallback()`은 두 브랜치 표현식이에요. 테스트가 두 브랜치 모두
  커버해야 해요.
- 빌더 기반 테스트 fixture는 모든 테스트를 truthy 브랜치로 편향시켜요.
  Falsy 케이스에 대해 명시적이어야 해요.
- Line coverage는 못 잡아요. Branch coverage는 가끔 잡아요. AI review는
  안정적으로 잡아요.
- Fallback이 non-deterministic(UUID, timestamp, random)일 때, 값이 아닌
  output의 **shape**을 assert해요.

## 언제 사용할까

- 새 `||` / `??` fallback이 있는 PR 코드 리뷰.
- 빌더 기반 fixture를 가진 핸들러/서비스의 테스트 작성.
- 커버리지가 높아 보이지만 프로덕션이 default-generation 경로 버그를 가진
  레거시 코드 감사.
- AI review가 fallback 표현식의 누락된 브랜치 커버리지를 표시한 후.

## 언제 사용하지 말까

- Fallback이 상수(`x || 0`, `name || 'anonymous'`)이고 fallback 값이
  truthy 테스트의 negative case에 trivially assert되는 테스트.
- Fallback이 프로덕션에서 진짜로 도달 불가능한 코드(예: 업스트림 invariant로
  보호) — 그 경우 fallback 자체가 dead code이므로 테스트하지 말고
  제거하세요.

## 정리

오늘 AI 리뷰어가 가장 유용하게 하는 건 새로운 버그를 잡는 게 아니라 — 인간이
훑고 지나가는 mechanical한 패턴을 잡는 거예요. Fallback 브랜치 커버리지가
그런 패턴 중 하나예요: 정의하기 쉽고, mechanical하게 검사하기 쉽고, intent로
diff를 읽을 때 놓치기 쉬워요. 리뷰 봇이 이런 종류의 갭을 표시하면, 거의
확실한 진짜 발견으로 다루고 평행 테스트를 추가해요.

## References

- [MDN — Logical OR (||), short-circuit evaluation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_OR)
- [Jest configuration — `coverageThreshold` (branches와 lines는 별도 지표)](https://jestjs.io/docs/configuration#coveragethreshold-object)
- [Jest — `expect.stringMatching(string | regexp)`](https://jestjs.io/docs/expect#expectstringmatchingstring--regexp)
- [MDN — `RegExp.prototype.source`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/source)
