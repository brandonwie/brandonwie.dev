---
title: Paraglide-JS i18n for SvelteKit
description: Adding Korean/English internationalization to a SvelteKit static blog without
date: 2026-01-28T00:00:00.000Z
updated: 2026-01-28T00:00:00.000Z
tags:
  - frontend
  - i18n
  - svelte
  - sveltekit
category: frontend
draft: false
lang: en
references:
  - url: "https://inlang.com/m/gerre34r/library-inlang-paraglideJs"
    title: Paraglide-JS Documentation
    type: official
  - url: "https://svelte.dev/docs/kit/routing"
    title: SvelteKit Routing
    type: official
---

I needed Korean and English on my blog. The site is statically generated with
SvelteKit's adapter-static, so whatever i18n solution I picked had to resolve
translations at build time, not ship a runtime parser to the browser. Most i18n
libraries failed that requirement immediately.

## Why Most i18n Libraries Did Not Work

I evaluated four approaches before making a decision.

| Option                   | Pros                                                                               | Cons                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Paraglide-JS             | Tiny bundle (tree-shakes), full type safety, compile-time, native SvelteKit plugin | Newer library, smaller community, docs still maturing                 |
| svelte-i18n              | Established Svelte ecosystem, runtime flexibility                                  | Runtime parsing overhead, medium bundle, manual SvelteKit integration |
| i18next + svelte adapter | Massive ecosystem, plugins for plurals/formatting                                  | Large bundle, not compile-time, manual SvelteKit wiring               |
| DIY JSON + store         | No dependency, full control                                                        | No type safety, must build tooling from scratch                       |

svelte-i18n and i18next both parse translations at runtime. That means shipping
a parser, a locale file loader, and interpolation logic to the browser. For a
static blog with maybe 30 translation keys, that is a lot of overhead.

A DIY approach with JSON files and a Svelte store would work, but without type
safety, I would be guessing at key names and catching typos at runtime instead
of at build time.

Paraglide-JS won because it compiles translations into plain JavaScript
functions at build time. The result is tree-shakeable, type-safe, and adds
virtually nothing to the bundle.

| Feature               | Paraglide          | svelte-i18n | i18next |
| --------------------- | ------------------ | ----------- | ------- |
| Bundle size           | Tiny (tree-shakes) | Medium      | Large   |
| Type safety           | Full               | Partial     | Partial |
| Compile-time          | Yes                | No          | No      |
| SvelteKit integration | Native             | Manual      | Manual  |

## Setting It Up

```bash
npx @inlang/paraglide-js init
```

This creates three things:

- `project.inlang/settings.json` - Configuration
- `messages/en.json` - English messages
- `src/lib/paraglide/` - Generated runtime (do not edit this)

## Writing Message Files

Messages live in JSON files, one per language:

```json
// messages/en.json
{
  "site_title": "Brandon Wie | Software Engineer",
  "welcome_message": "Welcome to my blog"
}

// messages/ko.json
{
  "site_title": "Brandon Wie | 소프트웨어 엔지니어",
  "welcome_message": "블로그에 오신 것을 환영합니다"
}
```

## Using Messages in Components

Import the generated message functions and call them:

```svelte
<script>
  import * as m from '$lib/paraglide/messages';
</script>

<h1>{m.site_title()}</h1>
<p>{m.welcome_message()}</p>
```

Messages are functions, not strings. This is because they can accept parameters:

```json
{
  "greeting": "Hello, {name}!"
}
```

```svelte
{m.greeting({ name: 'Brandon' })}
```

If you mistype a key or forget a parameter, TypeScript catches it at build time.
No runtime "missing translation" errors.

## Route-Based Locale Detection

For SSG, I use route-based locales instead of cookies or browser detection:

```text
/           → English (default)
/posts      → English posts
/ko         → Korean
/ko/posts   → Korean posts
```

The Korean layout sets the language tag:

```svelte
<!-- src/routes/ko/+layout.svelte -->
<script>
  import { setLanguageTag } from '$lib/paraglide/runtime';
  setLanguageTag('ko');
</script>

<slot />
```

Every page under `/ko/` automatically gets Korean translations. No middleware,
no cookies, no client-side detection. The static site generator pre-renders both
language versions at build time.

## Building the Language Toggle

The toggle component builds the alternate-language URL by manipulating the
current pathname:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { languageTag } from '$lib/paraglide/runtime';

  const currentLang = languageTag();

  // Build alternate URL
  $: currentPath = $page.url.pathname;
  $: alternateUrl = currentLang === 'en'
    ? `/ko${currentPath}`
    : currentPath.replace(/^\/ko/, '') || '/';
</script>

<a href={alternateUrl}>
  {currentLang === 'en' ? '한국어' : 'English'}
</a>
```

The edge case to watch for is the root path. When you strip `/ko` from `/ko`,
you get an empty string, so the `|| '/'` fallback is essential.

## Wiring Up Vite

Paraglide integrates with SvelteKit through a Vite plugin:

```typescript
// vite.config.ts
import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/lib/paraglide",
    }),
  ],
});
```

The plugin watches your message files and regenerates the runtime code whenever
you add or modify translations. The generated code in `src/lib/paraglide/` is
auto-generated and should not be edited manually.

## The Rough Edges

**SSG compatibility was not obvious.** Most Paraglide examples assumed
server-side middleware for locale detection. Figuring out that route-based
detection with a layout `setLanguageTag` call was the SSG-friendly approach took
some digging.

**The generated runtime is opaque.** Paraglide generates code into
`src/lib/paraglide/` that you should not touch. Understanding the difference
between `setLanguageTag` (sets the locale) and `languageTag` (reads the current
locale) required reading the generated source since the docs were sparse on this
distinction.

**Language toggle URL construction has edge cases.** The root path (`/ko` to
`/`) and nested paths (`/ko/posts/my-post` to `/posts/my-post`) need careful
pathname manipulation. Test both directions.

## When to Use Paraglide-JS

- SvelteKit projects (especially SSG) needing lightweight i18n
- Projects where type safety for translation keys is important
- Small-to-medium translation sets (personal sites, blogs, portfolios)
- When bundle size is a priority and runtime overhead must be minimal

## When NOT to Use Paraglide-JS

- **Dynamic translations from CMS/database** -- Paraglide compiles messages at
  build time; if translations change frequently without redeploying, use a
  runtime library like i18next.
- **Large teams with non-technical translators** -- Paraglide uses JSON files in
  the codebase; teams needing a translation management platform (Crowdin,
  Lokalise) will find i18next better integrated.
- **Complex ICU message syntax** -- If you need advanced pluralization, gender
  agreement, or nested selects, i18next or FormatJS have more mature ICU support.
- **Non-SvelteKit frameworks** -- Paraglide's DX is optimized for SvelteKit; for
  React/Next.js or Vue/Nuxt, use framework-native i18n solutions.

## Practical Takeaway

Paraglide-JS is the right choice when you want compile-time i18n with zero
runtime cost and full type safety. The setup is straightforward for SvelteKit
SSG: route-based locales, a layout that sets the language tag, and JSON message
files. The tradeoff is a smaller community and maturing docs compared to
i18next, but for a personal blog with two languages, that tradeoff is well worth
it.
