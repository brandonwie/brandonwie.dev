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
  - url: 'https://inlang.com/m/gerre34r/library-inlang-paraglideJs'
    title: Paraglide-JS Documentation
    type: official
  - url: 'https://svelte.dev/docs/kit/routing'
    title: SvelteKit Routing
    type: official
---

bloating the bundle or introducing runtime overhead. The site uses SSG (static
site generation), so the i18n solution must resolve translations at build time,
not at runtime in the browser.

---

## Difficulties Encountered

- **SSG compatibility gap** -- Most i18n libraries (i18next, svelte-i18n) are
  designed for server-rendered or client-rendered apps; getting them to work
  correctly with SvelteKit's static adapter required workarounds or was not
  well-documented.
- **Route-based vs cookie-based locale** -- Paraglide supports multiple locale
  detection strategies, but figuring out how to wire route-based detection
  (`/ko/...` prefix) for SSG took trial and error since most examples assumed
  server-side middleware.
- **Language toggle URL construction** -- Building the alternate-language URL
  for EN/KO toggle required careful pathname manipulation (stripping or adding
  `/ko` prefix) with edge cases for the root path.
- **Generated runtime is opaque** -- Paraglide generates code into
  `src/lib/paraglide/` which should not be edited; understanding what it
  generates and how to use `setLanguageTag` vs `languageTag` required reading
  the generated source code since docs were sparse.

---

## Options Considered

| Option                   | Pros                                                                               | Cons                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Paraglide-JS             | Tiny bundle (tree-shakes), full type safety, compile-time, native SvelteKit plugin | Newer library, smaller community, docs still maturing                 |
| svelte-i18n              | Established Svelte ecosystem, runtime flexibility                                  | Runtime parsing overhead, medium bundle, manual SvelteKit integration |
| i18next + svelte adapter | Massive ecosystem, plugins for plurals/formatting                                  | Large bundle, not compile-time, manual SvelteKit wiring               |
| DIY JSON + store         | No dependency, full control                                                        | No type safety, must build tooling from scratch                       |

## Why This Approach

Chose Paraglide-JS because the site is statically generated and bundle size
matters. Compile-time translation means zero runtime cost, and full TypeScript
support catches missing or mistyped message keys during development rather than
at runtime. The native SvelteKit Vite plugin made integration seamless compared
to manually wiring i18next.

---

## Why Paraglide-JS

| Feature               | Paraglide          | svelte-i18n | i18next |
| --------------------- | ------------------ | ----------- | ------- |
| Bundle size           | Tiny (tree-shakes) | Medium      | Large   |
| Type safety           | Full               | Partial     | Partial |
| Compile-time          | Yes                | No          | No      |
| SvelteKit integration | Native             | Manual      | Manual  |

## Setup

```bash
npx @inlang/paraglide-js init
```

This creates:

- `project.inlang/settings.json` - Configuration
- `messages/en.json` - English messages
- `src/lib/paraglide/` - Generated runtime (don't edit)

## Message Files

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

## Usage in Components

```svelte
<script>
  import * as m from '$lib/paraglide/messages';
</script>

<h1>{m.site_title()}</h1>
<p>{m.welcome_message()}</p>
```

Messages are functions because they can accept parameters:

```json
{
  "greeting": "Hello, {name}!"
}
```

```svelte
{m.greeting({ name: 'Brandon' })}
```

## Route-Based Locale Detection

For SSG (static site generation), use route-based locales:

```text
/           → English (default)
/posts      → English posts
/ko         → Korean
/ko/posts   → Korean posts
```

### Layout for Locale Routes

```svelte
<!-- src/routes/ko/+layout.svelte -->
<script>
  import { setLanguageTag } from '$lib/paraglide/runtime';
  setLanguageTag('ko');
</script>

<slot />
```

## Language Toggle Component

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

## Vite Plugin Configuration

```typescript
// vite.config.ts
import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/lib/paraglide"
    })
  ]
});
```

## Key Points

- **Compile-time**: Messages are compiled to functions, no runtime parsing
- **Tree-shakeable**: Unused messages are removed from bundle
- **Type-safe**: TypeScript knows all available messages and parameters
- **SSG-friendly**: Route-based locales work with static site generation
- **No hydration issues**: Messages resolved at build time

---

## When to Use

- SvelteKit projects (especially SSG) needing lightweight i18n
- Projects where type safety for translation keys is important
- Small-to-medium translation sets (personal sites, blogs, portfolios)
- When bundle size is a priority and runtime overhead must be minimal

## When NOT to Use

- **Dynamic translations from CMS/database** -- Paraglide compiles messages at
  build time; if translations are managed in a CMS and change frequently without
  redeploying, a runtime library like i18next is more appropriate.
- **Large teams with non-technical translators** -- Paraglide uses JSON message
  files in the codebase; teams that need a translation management platform
  (Crowdin, Lokalise) may find i18next's ecosystem better integrated.
- **Complex ICU message syntax** -- If you need advanced pluralization rules,
  gender agreement, or nested selects beyond simple interpolation, i18next or
  FormatJS have more mature ICU support.
- **Non-SvelteKit frameworks** -- Paraglide's DX is optimized for SvelteKit; for
  React/Next.js or Vue/Nuxt, use framework-native i18n solutions.
