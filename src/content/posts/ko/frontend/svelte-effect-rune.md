---
title: "Svelte 5 $effect Rune"
description: >-
  Svelte 5에서 $effect rune의 자동 의존성 추적, cleanup, 그리고 $derived 및 onMount와의 차이를 알아봅니다.
date: 2026-01-28T00:00:00.000Z
updated: 2026-01-28T00:00:00.000Z
tags:
  - frontend
  - svelte
  - svelte5
  - reactivity
category: frontend
draft: false
lang: ko
source_lang: en
source_slug: svelte-effect-rune
source_updated: "2026-01-28"
translation_date: "2026-02-12"
references:
  - url: "https://svelte.dev/docs/svelte/$effect"
    title: Svelte 5 $effect Rune
    type: official
  - url: "https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView"
    title: Element.scrollIntoView() - MDN
    type: official
---

터미널 스타일 블로그용 FuzzyFinder 컴포넌트를 만들고 있었어요. 사용자가 화살표
키로 검색 결과를 탐색하면 선택된 항목이 자동으로 스크롤되어 보여야 했습니다.
Svelte 4에서는 `$: { }` 반응형 구문을 사용했을 텐데, Svelte 5에서는 그 문법이
사라지고 rune으로 대체됐어요. `$effect`를 이해해야 했습니다 -- 의존성을 어떻게
추적하는지, 언제 실행되는지, cleanup이 어떻게 동작하는지.

## React의 useEffect에서 오면

React를 써왔다면 가장 큰 멘탈 모델 변화는 Svelte의 `$effect`에 dependency
array가 없다는 거예요. 두 번째 인자가 없습니다. Svelte에게 무엇을 감시할지 말해줄
필요가 없어요. effect 본문 안에서 읽는 반응형 값을 자동으로 추적합니다.

```svelte
<script>
  let count = $state(0);

  // count가 변경될 때마다 실행
  $effect(() => {
    console.log('Count is now:', count);
  });
</script>
```

함수 안에서 읽는 모든 `$state`, `$derived`, `$props` 값이 의존성이 됩니다.
강력하지만 추적할 의도가 없는 상태에 접근하면 예상치 못한 재실행이 발생할 수
있어요.

```svelte
<script>
  let a = $state(1);
  let b = $state(2);

  // a 또는 b 중 하나라도 변경되면 재실행
  $effect(() => {
    console.log('Sum:', a + b);
  });
</script>
```

`a`에만 반응하고 싶었는데 effect 안에서 실수로 `b`를 읽으면, 둘 다에 반응합니다.
의존성이 한 번 읽히면 빼는 방법이 없어요. effect를 신중하게 구조화하세요.

## Svelte 4와의 비교

| Svelte 4              | Svelte 5                          |
| --------------------- | --------------------------------- |
| `$: { sideEffect() }` | `$effect(() => { sideEffect() })` |
| 암시적, 제어 부족     | 명시적, 의도가 명확               |
| cleanup 지원 없음     | cleanup 함수 반환                 |

Svelte 5 버전이 더 명시적입니다. effect가 어디서 시작하고 끝나는지 정확히
보여요. 그리고 Svelte 4 반응형 구문에서 지원하지 않았던 cleanup이 내장되어
있습니다.

## 실제 예시: FuzzyFinder의 자동 스크롤

`$effect`를 배우게 된 실제 사용 사례입니다. FuzzyFinder는 검색 결과를 스크롤
가능한 리스트로 보여줍니다. 사용자가 위/아래 화살표를 누르면 `selectedIndex`가
바뀌고, 선택된 항목이 보이도록 스크롤되어야 합니다:

```svelte
<script>
  let selectedIndex = $state(0);
  let results = $state([]);
  let containerRef: HTMLDivElement;

  // selectedIndex 또는 results.length가 변경되면 실행
  $effect(() => {
    if (containerRef && results.length > 0) {
      const selectedElement = containerRef.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',    // 보이는 영역 밖일 때만 스크롤
          behavior: 'smooth'   // 스크롤 애니메이션
        });
      }
    }
  });
</script>
```

이 effect는 `results.length`와 `selectedIndex`를 읽기 때문에 둘 중 하나가 바뀌면
재실행됩니다. 사용자가 새 쿼리를 입력하거나(results 변경) 화살표 키를 누르면
(index 변경) 선택된 항목이 스크롤되어 보입니다.

`block: 'nearest'` 옵션이 여기서 중요합니다. "요소가 보이는 영역 밖에 있을 때만
스크롤"한다는 뜻이에요. 이것이 없으면 선택된 항목이 이미 보이는 상태에서도 매
키 입력마다 스크롤 위치가 점프합니다.

| 옵션                  | 값                                  | 동작 |
| --------------------- | ----------------------------------- | ---- |
| `block: 'nearest'`    | 요소가 보이는 영역 밖일 때만 스크롤 |      |
| `block: 'start'`      | 요소를 컨테이너 상단에 정렬         |      |
| `block: 'end'`        | 요소를 컨테이너 하단에 정렬         |      |
| `behavior: 'smooth'`  | 스크롤 애니메이션                   |      |
| `behavior: 'instant'` | 즉시 점프                           |      |

## Cleanup

`$effect`에서 함수를 반환하면 effect가 재실행되거나 컴포넌트가 제거될 때 cleanup이
실행됩니다:

```svelte
$effect(() => {
  const interval = setInterval(() => {
    console.log('tick');
  }, 1000);

  // Cleanup: interval 해제
  return () => clearInterval(interval);
});
```

cleanup 함수는 두 가지 상황에서 실행됩니다: effect의 다음 실행 전(의존성 변경
시), 그리고 컴포넌트가 제거될 때. React에서는 cleanup 동작이 dependency array에
따라 달라지므로 약간 다릅니다.

## 올바른 도구 선택

모든 것에 `$effect`를 사용하면 안 됩니다. 결정 프레임워크입니다:

| 사용 사례                      | 도구         |
| ------------------------------ | ------------ |
| 파생/계산된 값                 | `$derived()` |
| 사이드 이펙트 (DOM, 로깅, API) | `$effect()`  |
| 일회성 설정                    | `onMount()`  |

가장 흔한 실수는 파생 값을 계산하는 데 `$effect`를 사용하는 것입니다.
`$effect(() => { someVar = transform(otherVar) })`를 쓰고 있다면 멈추세요.
`const someVar = $derived(transform(otherVar))`를 대신 사용하세요. `$effect`
버전은 불필요한 리렌더 사이클을 만듭니다.

## $effect를 사용하면 안 되는 경우

- **파생 값 계산** -- `$derived()`를 대신 사용하세요. `$effect`로 다른 상태
  변수를 설정하면 불필요한 리렌더 사이클이 생깁니다.
- **일회성 초기화** -- `window`의 이벤트 리스너 등록, 초기 데이터 가져오기처럼
  마운트 시 한 번 실행되는 설정에는 `onMount()`를 사용하세요. `$effect`는 관련
  상태가 변경될 때마다 실행되지, 한 번만 실행되지 않습니다.
- **다른 상태에 대한 동기적 상태 업데이트** -- 이것은 연쇄적인 반응성을 만듭니다.
  `$effect`가 상태 A를 업데이트하고 이것이 상태 B를 업데이트하는 또 다른
  `$effect`를 트리거하면 디버그하기 어려운 업데이트 체인이 됩니다. `$derived`로
  재구조화하거나 로직을 통합하세요.
- **매 상태 변경마다 무거운 계산** -- `$effect`는 렌더 후 동기적으로 실행됩니다.
  네트워크 요청이나 큰 DOM 변경 같은 비싼 작업은 debounce하거나 명시적 가드와
  함께 `$effect`에 넣으세요.

## 핵심 정리

`$effect`는 Svelte 4의 반응형 구문을 더 명확하고 강력한 API로 대체합니다. 핵심
통찰은 자동 의존성 추적이에요: effect 안에서 읽는 모든 반응형 값이 의존성이
되므로, 필요한 것만 읽도록 effect를 구조화하세요. 계산된 값에는 `$derived`,
일회성 설정에는 `onMount`, 상태 변경에 반응하는 진짜 사이드 이펙트에는 `$effect`를
사용하세요. 여기서 보여준 자동 스크롤 패턴이 `$effect`의 교과서적인 사용
사례입니다: 상태 변경에 반응하는 DOM 조작.
