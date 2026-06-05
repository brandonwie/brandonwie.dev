---
title: 'SvelteKit: `+layout.ts`에서 공유 store를 사이트 전역으로 하이드레이션하기'
description: >-
  한 페이지의 `onMount`로만 채우는 공유 `writable` store는 다른 모든 라우트에서 비어 있어요. 루트 `+layout`에서
  한 번만 하이드레이션하면 모든 내비게이션에서 데이터가 따라와요.
date: 2026-06-04T00:00:00.000Z
updated: '2026-06-05'
tags:
  - frontend
  - sveltekit
  - svelte5
  - stores
  - ssg
  - i18n
category: frontend
draft: false
lang: ko
source_lang: en
source_slug: sveltekit-global-store-hydration
source_updated: '2026-06-05'
translation_date: '2026-06-05'
---

공유 `writable` store는 SvelteKit 앱에서 같은 데이터를 여러 컴포넌트에 넘기는 자연스러운 방법이에요. 그런데 한 페이지의 `onMount`로만 채우면, 그 라우트에서만 채워지고 다른 모든 페이지는 빈 store를 읽어요. 한 기능을 한 화면에서 사이트 전체로 승격하다가 이걸 만났는데, 해결책은 하이드레이션을 _어떻게_ 하느냐가 아니라 _어디서_ 하느냐를 살짝 바꾸는 거였어요.

## 이 문제가 나온 배경

이 사이트의 퍼지 커맨드 팔레트는 예전엔 옛 터미널 뷰 안에서만 마운트됐고, `posts` store는 홈 페이지의 `onMount`로만 하이드레이션됐어요. 팔레트를 전역 `Cmd/Ctrl+K` 표면으로 승격하니까, 갑자기 `/posts`, `/posts/[slug]`, `/ko/*` 등 어디서나 posts가 필요해졌어요. 이 모든 라우트에서 store는 비어 있었죠. store를 채우는 유일한 게, 사용자가 처음에 안 들를 수도 있는 페이지였으니까요.

## 페이지 `onMount`로는 부족한 이유

`+page.svelte`의 `onMount(() => posts.set(data.posts))`는 그걸 선언한 페이지에서만 실행돼요. 사이트 전역에서 — 레이아웃에서 — 마운트된 소비자는 그 순간 store에 들어 있는 값을 읽는데, 하이드레이션하는 바로 그 라우트가 아닌 곳에서는 아무것도 없어요. 데이터를 _소유_ 하는 라우트와 사용자가 실제로 도착하는 라우트가 같지 않으니, 타이밍이 절대 맞질 않아요.

해결책은 **레이아웃**을 단일 하이드레이션 소스로 만드는 거예요. SvelteKit의 두 가지 디테일이 이걸 깔끔하게 해줘요:

1. **`+layout.svelte`의 `data`는 레이아웃 자신의 `load` 반환값이에요** — 자식 페이지와 병합된 데이터가 아니라요. 그래서 거기서 `data.posts`로 store를 설정해도, `posts`를 반환하는 페이지와 충돌하지 않아요.
2. **`onMount`가 아니라 `$effect`를 쓰세요.** 레이아웃 인스턴스는 클라이언트 사이드 내비게이션 동안 유지되니까 `onMount`는 한 번만 실행돼요. `$effect`는 `data`가 바뀔 때마다 다시 실행돼서, EN↔KO 내비게이션이 로케일별 post 집합을 교체해줘요.

## 해결 방법

load를 루트 `+layout.ts`로 옮기고, 레이아웃 컴포넌트에서 store를 설정하세요:

```ts
// src/routes/+layout.ts
import type { LayoutLoad } from "./$types";
export const prerender = true;

const en = import.meta.glob("../content/posts/en/**/*.md", {
  import: "metadata",
  eager: true
});
const ko = import.meta.glob("../content/posts/ko/**/*.md", {
  import: "metadata",
  eager: true
});

export const load: LayoutLoad = ({ url }) => ({
  posts: collect(url.pathname.startsWith("/ko") ? ko : en)
});
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { posts } from '$lib/stores/posts';
  let { data, children } = $props();
  // Re-runs on every navigation whose layout data changes (folds per-page hydration).
  $effect(() => { posts.set(data.posts); });
</script>
```

그러면 홈 페이지의 `onMount(() => posts.set(...))`는 삭제돼요 — 레이아웃이 하이드레이션을 소유하고, store를 채우는 곳이 정확히 한 군데가 되는 거죠.

## 페이지 하이드레이션 vs 레이아웃 하이드레이션

|                            | 페이지 `onMount`    | 루트 레이아웃 `$effect` |
| -------------------------- | ------------------- | ----------------------- |
| 실행 위치                  | 한 라우트           | 모든 내비게이션         |
| 다른 라우트에서의 store    | 비어 있음           | 채워짐                  |
| `data` 변경에 반응 (EN↔KO) | 아니요              | 네                      |
| 적합한 경우                | 데이터가 페이지 한정 | 데이터가 사이트 전역    |

## 왜 여기서 `onMount`가 아니라 `$effect`일까

`onMount`는 컴포넌트 인스턴스당 한 번 실행되는데, 루트 레이아웃은 클라이언트 사이드 내비게이션에서도 살아남는 단일 인스턴스예요. 그래서 레이아웃의 `onMount`는 첫 로드 때 store를 하이드레이션하고 그 뒤로는 안 해요 — 데이터가 라우트에 따라 바뀌어야 하기 전까지는 괜찮죠. `$effect`는 `data`를 추적하다가 바뀌면 다시 실행되는데, 이게 바로 로케일을 인식하는 콘텐츠에 필요한 동작이에요: `/posts`에서 `/ko/posts`로 이동하면 `data.posts`가 바뀌고, store가 그걸 따라가요.

SSG에 특화된 한 가지 더: eager `import.meta.glob` 집합을 `url.pathname`으로 분기하면, 사전 렌더링된 각 라우트가 빌드 타임에 올바른 로케일의 메타데이터를 구워 넣어요.

## 페이지 한정으로 둬야 할 때

"레이아웃에서 항상 하이드레이션하라"는 규칙은 아니에요. 다음 경우엔 데이터를 페이지의 `onMount`에 두세요:

- 데이터가 오직 한 라우트에서만 필요할 때.
- store가 내비게이션 간에 바뀌면 **안 될** 때 — 그러면 `onMount` 한 번이 괜찮고, 매번 재실행되는 `$effect`보다 저렴해요.

명시할 만한 비용도 있어요: 전역 컴포넌트(여기서는 팔레트 + Fuse.js)가 이제 공유 레이아웃 번들에 실려요. 그 무게가 신경 쓰이면 동적 `import()`로 lazy-load 하세요.

## 하마터면 발목 잡힐 뻔한 것

`+layout.ts`는 이 프로젝트에 이미 있었어요 — `prerender`와 `trailingSlash`만 담고 있었죠. 새 파일이라고 가정하고 미리 써둔 계획이었다면 그 설정을 덮어써 버렸을 거예요. 확장하기 전에 실제 파일을 읽는다는, 지루하지만 여기서 실제로 중요했던 교훈이에요.

## 참고 자료

- [SvelteKit — layout data (load)](https://svelte.dev/docs/kit/load#layout-data)
- [SvelteKit — generated $types (LayoutLoad)](https://svelte.dev/docs/kit/$types)
