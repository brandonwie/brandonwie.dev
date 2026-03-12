---
title: Giscus SvelteKit Integration
description: Adding a comment system to a statically generated SvelteKit blog without
date: 2026-01-28T00:00:00.000Z
updated: 2026-01-28T00:00:00.000Z
tags:
  - frontend
  - svelte
  - comments
category: frontend
draft: false
lang: en
references:
  - url: 'https://giscus.app'
    title: giscus - A comment system powered by GitHub Discussions
    type: official
  - url: 'https://github.com/giscus/giscus'
    title: giscus GitHub repository
    type: official
source_content_hash: c8d25b6c33a3729b99b71a66b9aab57cc8d87debf0592f46f03418007d987ef5
---

introducing a database, authentication backend, or paid service. Blog readers
are developers who already have GitHub accounts, so a solution leveraging GitHub
infrastructure was ideal.

---

## Difficulties Encountered

- **Mapping strategy confusion** -- Giscus offers multiple mapping modes
  (pathname, URL, title, specific term) and the docs don't clarify which works
  best for multilingual sites where EN/KO paths differ but should share one
  comment thread.
- **Localhost comments leaking to production** -- Discovered that comments made
  during local development appear on the live site because Giscus maps by slug,
  not by domain. This was not obvious from the docs.
- **Svelte curly brace parsing** -- Svelte interprets `{anything}` in HTML
  comments as reactive expressions, causing cryptic build errors when
  documenting giscus config values in code comments.
- **Theme synchronization** -- Getting the giscus iframe theme to match the
  site's dark mode required trial and error with theme name strings
  (`dark_dimmed` vs `dark` vs `transparent_dark`).

---

## Options Considered

| Option                       | Pros                                                   | Cons                                                  |
| ---------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Giscus (GitHub Discussions)  | Free, no DB, GitHub auth, privacy-focused, open source | Requires GitHub account to comment                    |
| Disqus                       | Widely used, easy setup                                | Ads, tracking, heavy JS bundle, privacy concerns      |
| Utterances (GitHub Issues)   | Similar to Giscus, simple                              | Uses Issues (not designed for comments), no reactions |
| Self-hosted (e.g., Commento) | Full control, no third-party                           | Requires server, database, maintenance                |

## Why This Approach

Chose Giscus because the audience is developers (already have GitHub accounts),
it requires zero infrastructure, respects user privacy (no tracking/GDPR
concerns), and uses Discussions (purpose-built for conversations) rather than
Issues. The compile-time integration with SvelteKit is straightforward.

---

## Why Giscus

| Feature         | Benefit                               |
| --------------- | ------------------------------------- |
| GitHub auth     | Readers already have accounts         |
| No database     | Comments stored in GitHub Discussions |
| Privacy-focused | No tracking, GDPR compliant           |
| Free            | Open source, no cost                  |
| Theming         | Customizable to match site theme      |

## Setup Steps

### 1. Enable GitHub Discussions

1. Go to repository Settings → Features
2. Check "Discussions"
3. Create a category (e.g., "Blog Comments") with Announcements type

### 2. Configure at giscus.app

Visit [giscus.app](https://giscus.app) and configure:

- **Repository:** `owner/repo`
- **Mapping:** "Discussion title contains a specific term" (for shared threads)
- **Category:** Select your category
- **Features:** Enable reactions, lazy loading
- **Theme:** `dark_dimmed` for dark sites

Copy the generated `data-repo-id` and `data-category-id`.

### 3. Create Svelte Component

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    slug: string;
    lang?: 'en' | 'ko';
  }

  let { slug, lang = 'en' }: Props = $props();
  let containerRef: HTMLDivElement;

  onMount(() => {
    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.crossOrigin = 'anonymous';

    // Configuration from giscus.app
    script.dataset.repo = 'owner/repo';
    script.dataset.repoId = 'R_xxxxx';
    script.dataset.category = 'Blog Comments';
    script.dataset.categoryId = 'DIC_xxxxx';
    script.dataset.mapping = 'specific';
    script.dataset.term = slug;  // Use slug for shared EN/KO threads
    script.dataset.strict = '0';
    script.dataset.reactionsEnabled = '1';
    script.dataset.emitMetadata = '0';
    script.dataset.inputPosition = 'top';
    script.dataset.theme = 'dark_dimmed';
    script.dataset.lang = lang;
    script.dataset.loading = 'lazy';

    containerRef.appendChild(script);
  });
</script>

<section class="comments-section">
  <h2>Comments</h2>
  <div bind:this={containerRef}></div>
</section>
```

## Key Design Decisions

### Shared Comments Between Languages

Use the post slug (not full pathname) as the discussion term:

```javascript
script.dataset.term = slug; // "my-post" not "/ko/posts/my-post"
```

This way `/posts/my-post` and `/ko/posts/my-post` share the same comment thread.

### Localhost Comments Appear in Production

Giscus uses the same GitHub Discussion regardless of domain. Comments made on
localhost will appear in production because they use the same slug.

Options if this is unwanted:

1. Delete test comments from GitHub Discussions
2. Use environment-specific term prefix:

   ```javascript
   const isDev = import.meta.env.DEV;
   script.dataset.term = isDev ? `dev-${slug}` : slug;
   ```

## Common Gotcha: Svelte Curly Braces

Svelte interprets `{anything}` as an expression, even in HTML comments.

```svelte
<!-- BAD: Causes "variable is not defined" error -->
<!-- Note: {variable} will be interpreted -->

<!-- GOOD: Avoid curly braces in comments -->
<!-- Note: curly braces will be interpreted -->
```

This can cause mysterious build errors if you have example code in comments.

---

## When to Use

- Developer-audience blog or documentation site where readers have GitHub
  accounts
- Static sites (SSG) that cannot run a comment backend
- Projects that want zero-cost, zero-maintenance comments
- Sites where privacy and no-tracking are priorities

## When NOT to Use

- **Non-developer audiences** -- Requiring a GitHub account to comment excludes
  most general-audience readers
- **High-volume comment sites** -- GitHub Discussions API has rate limits; sites
  expecting thousands of comments per post need a dedicated system
- **Offline-first or self-hosted requirements** -- Giscus depends on GitHub
  infrastructure; if GitHub is down, comments are unavailable
- **Need for moderation tools** -- GitHub Discussions moderation is basic
  compared to Disqus or custom solutions (no spam filters, no keyword blocks)
- **Private repositories** -- Giscus requires a public repo for the Discussions
  backend
