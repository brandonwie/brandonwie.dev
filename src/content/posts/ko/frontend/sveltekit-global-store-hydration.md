---
title: 'SvelteKit: `+layout.ts`에서 공유 store를 사이트 전역으로 hydration하기'
description: >-
  한 페이지의 `onMount`로만 채우는 공유 `writable` store는 다른 모든 route에서 비어 있어요. 루트 `+layout`에서
  한 번만 hydration하면 모든 navigation에서 데이터가 따라와요.
date: 2026-06-04T00:00:00.000Z
updated: '2026-08-02'
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
source_updated: '2026-08-02'
translation_date: '2026-06-14'
---

공유 `writable` store는 SvelteKit 앱에서 같은 데이터를 여러 component에 넘기는 가장 자연스러운 방법이에요. 그런데 한 페이지의 `onMount`에서만 채우면, 그 route에서만 채워지고 나머지 페이지는 전부 빈 store를 읽게 돼요. 한 화면에만 있던 기능을 사이트 전체로 끌어올리다가 이 문제를 만났는데, 해결의 핵심은 hydration을 _어떻게_ 하느냐가 아니라 _어디서_ 하느냐를 살짝 바꾸는 거였어요.

## 어쩌다 마주쳤나

이 사이트의 fuzzy command palette는 원래 예전 terminal view 안에서만 mount됐고 `posts` store는 홈 페이지의 `onMount`가 채워주고 있었어요. 그런데 이 palette를 전역 `Cmd/Ctrl+K`로 끌어올리니까 `/posts`, `/posts/[slug]`, `/ko/*` 같은 모든 곳에서 갑자기 posts가 필요해졌어요. 이 route들에서는 store가 전부 비어 있었죠. store를 채우는 유일한 곳이 사용자가 처음에 안 들를 수도 있는 페이지였으니까요.

## 페이지 `onMount`로는 왜 부족한가

`+page.svelte`의 `onMount(() => posts.set(data.posts))`는 그걸 선언한 페이지에서만 실행돼요. 그런데 layout에 올려서 사이트 전역에 mount된 쪽은 그 순간 store에 들어 있는 값을 읽을 뿐이라, 채우는 route가 아니면 아무것도 없어요. 데이터를 _소유_ 하는 route와 사용자가 실제로 도착하는 route가 서로 다르니 타이밍이 맞을 리가 없죠.

그래서 **layout**을 단일 hydration 지점으로 만들면 돼요. 여기엔 SvelteKit의 두 가지 디테일이 깔끔하게 맞물려요.

1. **`+layout.svelte`의 `data`는 layout 자신의 `load` 반환값이에요.** 자식 페이지와 병합된 데이터가 아니라서 거기서 `data.posts`로 store를 채워도 `posts`를 반환하는 페이지와 부딪히지 않아요.
2. **`onMount` 대신 `$effect`를 써요.** layout instance는 client-side navigation 내내 살아 있어서 `onMount`는 딱 한 번만 실행돼요. 반면 `$effect`는 `data`가 바뀔 때마다 다시 돌기 때문에, EN↔KO로 오갈 때 그 locale의 post 묶음으로 자연스럽게 갈아끼워져요.

## 해결 방법

load를 root `+layout.ts`로 옮기고 store는 layout component에서 채워요.

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

이러면 홈 페이지의 `onMount(() => posts.set(...))`는 지워도 돼요. hydration은 layout이 책임지고 store를 채우는 곳은 정확히 한 군데로 모여요.

## 페이지 hydration vs layout hydration

|                                 | 페이지 `onMount`    | root layout `$effect` |
| ------------------------------- | ------------------- | --------------------- |
| 실행 시점                       | route 하나          | 모든 navigation       |
| 다른 route에서의 store          | 비어 있음           | 채워져 있음           |
| `data` 변화에 반응 (EN↔KO)      | 안 함               | 함                    |
| 어울리는 경우                   | 데이터가 페이지 한정 | 데이터가 사이트 전역  |

## 여기서 왜 `onMount`가 아니라 `$effect`인가

`onMount`는 component instance마다 딱 한 번 실행되는데, root layout은 client-side navigation에도 살아남는 단 하나의 instance예요. 그래서 layout에 `onMount`를 쓰면 첫 로드 때 store를 한 번 채우고 그걸로 끝이에요. 데이터가 route에 따라 바뀌어야 하는 순간 곧바로 부족해지죠. 반면 `$effect`는 `data`를 추적하다가 값이 바뀌면 다시 도는데, locale에 따라 내용이 달라지는 콘텐츠엔 딱 이 동작이 필요해요. `/posts`에서 `/ko/posts`로 넘어가면 `data.posts`가 바뀌고 store가 그걸 그대로 따라가요.

SSG라서 챙길 디테일이 하나 더 있어요. eager `import.meta.glob` 묶음을 `url.pathname`으로 갈라두면, prerender된 route마다 build time에 맞는 locale의 metadata가 박혀 들어가요.

## 페이지 한정으로 둘 때

"hydration은 무조건 layout에서"라는 규칙은 아니에요. 다음 경우엔 데이터를 페이지 `onMount`에 그대로 두는 게 나아요.

- 그 데이터가 오직 한 route에서만 필요할 때.
- store가 navigation 사이에서 **바뀌면 안 될** 때. 이땐 `onMount` 한 번이면 충분하고, 매번 다시 도는 `$effect`보다 가벼워요.

짚어둘 비용도 하나 있어요. 전역 component(여기선 palette와 Fuse.js)가 이제 공유 layout 번들에 같이 실려요. 그 무게가 부담되면 동적 `import()`로 lazy-load 하면 돼요.

## 하마터면 발목 잡힐 뻔한 지점

`+layout.ts`는 이 프로젝트에 이미 있었어요. `prerender`랑 `trailingSlash`만 들어 있던 파일이었죠. 새로 만드는 파일이라고 가정하고 미리 짜둔 계획이었다면 그 설정을 통째로 덮어썼을 거예요. 손대기 전에 실제 파일부터 읽는다는 게 지루한 교훈이긴 한데, 여기선 그게 진짜로 중요했어요.

## 참고 자료

- [SvelteKit — layout data (load)](https://svelte.dev/docs/kit/load#layout-data)
- [SvelteKit — generated $types (LayoutLoad)](https://svelte.dev/docs/kit/types#Generated-types)
