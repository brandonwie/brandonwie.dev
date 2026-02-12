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
  - url: "https://giscus.app"
    title: giscus - A comment system powered by GitHub Discussions
    type: official
  - url: "https://github.com/giscus/giscus"
    title: giscus GitHub repository
    type: official
---

I wanted comments on my blog. Not a database, not an auth backend, not a monthly
bill from some SaaS. My readers are developers who already have GitHub accounts,
so the answer was sitting right there: GitHub Discussions as a comment backend.

That is exactly what Giscus does. It turns GitHub Discussions into a comment
widget you embed with a script tag. No server, no database, no tracking. But
wiring it into a multilingual SvelteKit static site had a few sharp edges that
the docs did not warn me about.

## Why Giscus Over the Alternatives

I evaluated four options before settling on Giscus.

| Option                       | Pros                                                   | Cons                                                  |
| ---------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Giscus (GitHub Discussions)  | Free, no DB, GitHub auth, privacy-focused, open source | Requires GitHub account to comment                    |
| Disqus                       | Widely used, easy setup                                | Ads, tracking, heavy JS bundle, privacy concerns      |
| Utterances (GitHub Issues)   | Similar to Giscus, simple                              | Uses Issues (not designed for comments), no reactions |
| Self-hosted (e.g., Commento) | Full control, no third-party                           | Requires server, database, maintenance                |

Disqus was out immediately. I am not injecting ads and tracking scripts into a
personal blog. Utterances was close, but it hijacks GitHub Issues for something
they were not designed for, and it lacks reaction support. Self-hosted meant
maintaining infrastructure I did not want.

Giscus won because the audience is developers (already have GitHub accounts), it
requires zero infrastructure, respects user privacy (no tracking, GDPR
compliant), and uses Discussions, which are purpose-built for conversations.

| Feature         | Benefit                               |
| --------------- | ------------------------------------- |
| GitHub auth     | Readers already have accounts         |
| No database     | Comments stored in GitHub Discussions |
| Privacy-focused | No tracking, GDPR compliant           |
| Free            | Open source, no cost                  |
| Theming         | Customizable to match site theme      |

## Setting It Up

### 1. Enable GitHub Discussions

1. Go to repository Settings, then Features
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

### 3. Create the Svelte Component

Here is the component I built. It dynamically injects the Giscus script on
mount:

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

The key line is `script.dataset.term = slug`. This is what makes multilingual
comment sharing work, which I will explain next.

## The Multilingual Problem (and the Fix)

My blog has English and Korean versions of each post at different paths:
`/posts/my-post` and `/ko/posts/my-post`. Without careful configuration, Giscus
would create two separate Discussion threads for the same content.

The fix is to use the post slug (not the full pathname) as the discussion term:

```javascript
script.dataset.term = slug; // "my-post" not "/ko/posts/my-post"
```

This way `/posts/my-post` and `/ko/posts/my-post` share the same comment
thread. English and Korean readers see the same conversation.

## Localhost Comments Leak to Production

This one surprised me. Comments I made during local development showed up on the
live site. Giscus maps by slug, not by domain. So `localhost:5173/posts/my-post`
and `brandonwie.dev/posts/my-post` hit the same Discussion thread.

If this is a problem, you have two options:

1. Delete test comments from GitHub Discussions manually
2. Use an environment-specific term prefix:

```javascript
const isDev = import.meta.env.DEV;
script.dataset.term = isDev ? `dev-${slug}` : slug;
```

I went with option 1 because I rarely test comments locally, but option 2 is
cleaner if you test frequently.

## Watch Out: Svelte Curly Braces

Svelte interprets `{anything}` as an expression, even inside HTML comments. If
you write something like this in a `.svelte` file:

```svelte
<!-- BAD: Causes "variable is not defined" error -->
<!-- Note: {variable} will be interpreted -->

<!-- GOOD: Avoid curly braces in comments -->
<!-- Note: curly braces will be interpreted -->
```

This caused a cryptic build error when I was documenting Giscus config values in
code comments. The fix is to avoid curly braces in Svelte HTML comments
entirely. Use backtick code blocks or move the documentation outside the
template.

## Theme Synchronization

Getting the Giscus iframe to match my dark terminal theme took some trial and
error. The theme name strings are not intuitive: `dark_dimmed` is different from
`dark` and `transparent_dark`. I ended up with `dark_dimmed` because it blends
best with the `#1a1a1a` background of this site.

## When to Use Giscus

- Developer-audience blog or documentation site where readers have GitHub
  accounts
- Static sites (SSG) that cannot run a comment backend
- Projects that want zero-cost, zero-maintenance comments
- Sites where privacy and no-tracking are priorities

## When NOT to Use Giscus

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

## Practical Takeaway

Giscus is the path of least resistance for adding comments to a developer blog.
Setup takes about 15 minutes: enable Discussions, configure at giscus.app, drop
in a Svelte component. The two gotchas to remember are: use the slug (not the
full path) for multilingual comment sharing, and be aware that localhost comments
leak to production unless you prefix the term.
