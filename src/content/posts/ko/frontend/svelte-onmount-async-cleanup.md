---
title: 'Svelte: async `onMount`의 반환값은 cleanup이 아니에요'
description: >-
  Svelte는 `onMount`가 반환한 값을 언마운트 시 cleanup으로 실행해요 — 단, 그 값이 함수일 때만요. `async`
  콜백은 Promise를 반환하기 때문에 cleanup이 조용히 무시돼요.
date: 2026-06-04T00:00:00.000Z
updated: '2026-06-05'
tags:
  - frontend
  - svelte
  - svelte5
  - lifecycle
  - gotcha
category: frontend
draft: false
lang: ko
source_lang: en
source_slug: svelte-onmount-async-cleanup
source_updated: '2026-06-05'
translation_date: '2026-06-14'
---

Svelte는 `onMount`에서 반환한 값을 컴포넌트의 cleanup 함수로 바꿔요. 언마운트될 때 실행되죠 — 단, **그 값이 함수일 때만요**. `async` 콜백은 항상 함수가 아니라 `Promise`를 반환하기 때문에, Svelte는 그걸 조용히 무시하고 cleanup은 절대 실행되지 않아요. 에러도, 경고도 없어요. 모달에 focus trap을 추가하다가 이걸 만났는데, 툴체인 어디에서도 가리켜주지 않는 실패라서 공유해볼게요.

## 문제가 드러난 상황

이 사이트의 커맨드 팔레트 모달(`FuzzyFinder.svelte`)에 접근성 focus trap을 추가하고 있었어요. 팔레트가 열리면 검색 입력창으로 포커스를 옮기고, 닫히면 열기 전에 포커스돼 있던 요소로 **포커스를 복원**해야 해요. 정리(teardown) 시점에 포커스를 복원하는 건 딱 `onMount` cleanup 반환값이 하는 일이라서, 첫 버전은 이렇게 생겼어요:

```ts
// Svelte's contract: the RETURN VALUE of onMount is the destroy callback,
// IF it is a function. An async function returns Promise<fn>, not fn.
onMount(async () => {
  previouslyFocused = document.activeElement as HTMLElement | null;
  await tick();
  inputRef?.focus();
  return () => previouslyFocused?.focus?.(); // ⟵ wrapped in a Promise → ignored
});
```

한 가지가 이걸 깨뜨렸어요: 그 `onMount`는 이미 `async`였거든요. 입력창에 포커스하기 전에 `tick()`을 `await`하니까요. 콜백이 `async`가 되는 순간, 반환값은 Svelte가 찾는 `() => void`가 아니라 `Promise<() => void>`가 돼요. 그래서 복원 함수가 Promise로 감싸지고, Svelte는 함수가 아닌 반환값을 보고, 정리는 조용히 일어나지 않았어요. 팔레트를 닫은 뒤에도 포커스가 갇혀 있었죠.

## 왜 조용히 실패할까

이 부분이 새겨둘 만하다고 생각해요. Svelte가 `onMount`에 거는 계약은 좁아요: _콜백이 함수를 반환하면, 그걸 destroy 시점에 실행한다._ `Promise`는 함수가 아니니까 계약 밖으로 벗어나고, 아무 불평 없이 버려져요. 컴포넌트는 여전히 정상적으로 마운트되고 포커스도 잘 잡혀요 — 정리만 빠지는 거죠. 실제로는 이게 누수된 이벤트 리스너, 복원되지 않는 포커스, 정리되지 않는 타이머로 나타나요. 한참 뒤에야 드러나는 종류의 버그예요.

## 해결: 정리를 `onDestroy`로 옮기기

`onDestroy`에는 반환값 계약이 없어요. 컴포넌트가 파괴될 때 그냥 실행되니까, 마운트 로직이 sync든 async든 신경 쓰지 않아요. async 셋업은 `onMount`에 두고, 정리는 `onDestroy`로 옮기세요:

```ts
import { onMount, onDestroy, tick } from "svelte";

let previouslyFocused: HTMLElement | null = null;

onMount(async () => {
  previouslyFocused = document.activeElement as HTMLElement | null;
  await tick();
  inputRef?.focus();
});

// Runs on unmount regardless of onMount being async.
onDestroy(() => previouslyFocused?.focus?.());
```

셋업이 **동기**라면 `onMount`에서 cleanup을 반환해도 괜찮아요 — 함정은 딱 `async` 키워드가 반환값을 Promise로 바꾸는 경우예요. 하지만 `onDestroy`는 무조건 올바르게 동작하니까, 마운트 로직이 무언가를 await할 가능성이 조금이라도 있다면 더 안전한 기본값이에요.

## 헷갈리기 쉬운 비대칭

헷갈리는 부분은 `$effect`가 async `onMount`와 정반대로 동작한다는 거예요. `$effect`에서 반환한 함수는 **cleanup으로 실행돼요** — 매 재실행 전에, 그리고 destroy 시점에요. 그러니까 "함수를 반환해서 정리한다"는 `$effect`와 _동기_ `onMount`에는 해당되지만, _async_ `onMount`에는 해당되지 않아요. 네 가지 경우를 나란히 놓으니 머리에 박히더라고요:

| 라이프사이클 호출          | 반환한 함수가 cleanup으로 실행되나요?   |
| -------------------------- | --------------------------------------- |
| `onMount(() => fn)` (동기) | 네                                      |
| `onMount(async () => fn)`  | **아니요** — `Promise`를 반환해서 무시됨 |
| `onDestroy(fn)`            | 해당 없음 — `fn` 자체가 정리            |
| `$effect(() => fn)`        | 네 — 매 재실행 전과 destroy 시점        |

## 잡기 어려웠던 이유

타입 체커도 빌드도 깨진 버전을 문제없이 통과시켜요. 함수를 반환하는 async 함수는 유효한 TypeScript라서 `svelte-check`는 초록불을 유지하거든요. 결국 실제 브라우저에서 focus trap을 직접 써보고 나서야 잡았어요 — 팔레트를 닫아도 포커스가 눈에 띄게 갇혀 있었죠. 타입 체크 통과가 cleanup이 실행된다는 증거는 아니에요.

## 정리

- `onMount(fn)` cleanup은 `fn`이 **동기적으로 함수를 반환할 때만** 동작해요.
- `async () => { …; return cleanup }`은 `Promise<cleanup>`을 반환하고, Svelte는 이걸 무시해요 — 그것도 에러 없이요.
- 마운트 로직이 `async`여야 한다면(`tick()`, 동적 `import()`, fetch 등을 await) `onDestroy`를 쓰세요.
- `svelte-check` 초록불이 정리가 일어난다고 믿게 두지 마세요 — 브라우저에서 cleanup 동작을 직접 확인하세요.

## 참고 자료

- [Svelte lifecycle hooks — onMount](https://svelte.dev/docs/svelte/lifecycle-hooks#onMount)
- [Svelte lifecycle hooks — onDestroy](https://svelte.dev/docs/svelte/lifecycle-hooks#onDestroy)
