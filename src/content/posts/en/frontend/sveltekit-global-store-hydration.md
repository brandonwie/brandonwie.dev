---
title: 'SvelteKit: hydrate a shared store site-wide from `+layout.ts`'
description: A shared `writable` store populated by a single page's `onMount` is empty on every other route. Hydrate it once in the root `+layout` so every navigation carries it.
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
lang: en
references:
  - url: 'https://svelte.dev/docs/kit/load#layout-data'
    title: SvelteKit — layout data (load)
    type: official
  - url: 'https://svelte.dev/docs/kit/$types'
    title: SvelteKit — generated $types (LayoutLoad)
    type: official
source_content_hash: 9306ec36476c069f92c00f09935612e4475259a232adf963ba2f303ad60f39db
expanded: true
---

A shared `writable` store is the natural way to hand the same data to many
components in a SvelteKit app. But if you populate it from a single page's
`onMount`, it is only ever filled on that one route — every other page reads an
empty store. I hit this while promoting a feature from one view to the whole
site, and the fix turned out to be a small change in _where_ the hydration
happens, not how.

## Where this came up

On this site the fuzzy command palette used to mount only inside the old terminal
view, and the `posts` store was hydrated by the home page's `onMount`. When I
promoted the palette to a global `Cmd/Ctrl+K` surface, it suddenly needed posts
everywhere — `/posts`, `/posts/[slug]`, `/ko/*`, and so on. On all of those
routes the store was empty, because the only thing that ever set it was a page
the user might never visit first.

## Why a page `onMount` isn't enough

`+page.svelte`'s `onMount(() => posts.set(data.posts))` runs only on the page
that declares it. A consumer mounted site-wide — in the layout — reads whatever
is in the store at that moment, which is nothing on any route other than the one
that hydrates it. The route that _owns_ the data and the route the user actually
lands on are not the same route, so the timing never lines up.

The fix is to make the **layout** the single hydration source. Two SvelteKit
details make that clean:

1. **`data` in `+layout.svelte` is the layout's own `load` return** — not the
   merged child-page data. So setting the store from `data.posts` there does not
   collide with a page that also returns `posts`.
2. **Use `$effect`, not `onMount`.** The layout instance persists across
   client-side navigation, so `onMount` would fire only once. `$effect` re-runs
   whenever `data` changes, so an EN↔KO navigation swaps the locale's post set.

## The solution

Move the load to the root `+layout.ts`, and set the store from the layout
component:

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

The home page's `onMount(() => posts.set(...))` then gets deleted — the layout
owns hydration, and there is exactly one place that fills the store.

## Page hydration vs layout hydration

|                                 | Page `onMount`     | Root layout `$effect` |
| ------------------------------- | ------------------ | --------------------- |
| Runs on                         | one route          | every navigation      |
| Store on other routes           | empty              | populated             |
| Reacts to `data` change (EN↔KO) | no                 | yes                   |
| Right when                      | data is page-local | data is site-wide     |

## Why `$effect` and not `onMount` here

`onMount` fires once per component instance, and the root layout is a single
instance that survives client-side navigation. So `onMount` in the layout would
hydrate the store on first load and never again — fine until the data needs to
change with the route. `$effect` tracks `data` and re-runs when it changes, which
is exactly what locale-aware content needs: navigating from `/posts` to
`/ko/posts` changes `data.posts`, and the store follows.

One more SSG-specific touch: branch the eager `import.meta.glob` set on
`url.pathname`, so each prerendered route bakes in the right locale's metadata at
build time.

## When to keep it page-local

This is not an "always hydrate in the layout" rule. Keep the data in a page's
`onMount` when:

- The data is only ever needed on one route.
- The store must NOT change across navigation — then `onMount`-once is fine, and
  cheaper than a re-running `$effect`.

There is a cost worth naming, too: the global component (here the palette plus
Fuse.js) now ships in the shared layout bundle. If that weight matters, lazy-load
it with a dynamic `import()`.

## One thing that nearly tripped me

`+layout.ts` already existed on this project — it held only `prerender` and
`trailingSlash`. A plan written ahead of time that assumed it was a new file
would have clobbered that config. Reading the real file before extending it is
the boring lesson, but it is the one that actually mattered here.

## References

- [SvelteKit — layout data (load)](https://svelte.dev/docs/kit/load#layout-data)
- [SvelteKit — generated $types (LayoutLoad)](https://svelte.dev/docs/kit/$types)
