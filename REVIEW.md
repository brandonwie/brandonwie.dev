---
tags: [personal, reference]
created: 2026-10-09
updated: 2026-10-09
status: active
---

# Review guide

The single review standard for this repository. Every reviewer applies it:
people, Claude (`@claude review`, wired in
`.github/workflows/claude-code-review.yml` through the shared workflow
`brandonwie/claude-review`), Codex and any other agent. Where a general best
practice disagrees with this file, this file wins.

## What to report

Report problems a maintainer would act on:

- **Bugs** — wrong behavior, broken build or export, hydration errors,
  unhandled edge cases.
- **Security** — leaked secrets, injection through an HTML sink, unsafe
  defaults.
- **Category breaks** — anything in [Review categories](#review-categories).

Skip formatting and pure style, personal preference, speculative refactors,
restating what the diff does, and anything under
[Do not flag](#do-not-flag).

For each finding give `path:line`, the failure (input or state, then the wrong
result) and a suggested fix. Tag a severity:

| Severity | Meaning                                                             |
| -------- | ------------------------------------------------------------------- |
| P0       | Breaks the build or deploy, loses content, or opens a security hole |
| P1       | Wrong behavior a reader or a search engine will hit                 |
| P2       | Edge case, or a risk to the next change                             |

If nothing meets the bar, say so in one line rather than padding the review. A
PR that is purely cosmetic (whitespace, formatter output) or entirely
generated-file churn (such as `next/src/paraglide/`) gets one sentence
confirming its scope; skip the category checklist.

## Context

brandonwie.dev is a bilingual (EN/KO) personal blog and portfolio, deployed as
static files to Cloudflare Pages. The site is a Next.js 16 App Router static
export in the `next/` workspace package (`output: 'export'`, `distDir: 'build'`,
so the output and the Pages directory is `next/build/`). The stack is React 19,
Tailwind CSS v4 through `@tailwindcss/postcss`, Paraglide-JS (compiled into
`next/src/paraglide/`), an AST markdown pipeline under `next/src/markdown/`
with Shiki, Fuse.js and Pagefind. pnpm manages packages; deno runs only the
3B sync, snapshot, study-source and content-hash scripts under `scripts/`.

Some inputs stay at the repository root and `next/` imports them on purpose:
the EN/KO markdown corpus under `src/content/posts/`, `src/lib/seo.ts`,
`src/lib/data/`, `src/lib/plugins/remark-toc-extract.js`, `src/app.css` (design
tokens), `messages/{en,ko}.json`, `project.inlang/` and `public/` (every
`next/public` entry is a symlink into it).

SvelteKit was retired after the 2026-09-20 cutover. A `.svelte` file, a Vite
or Svelte config, or a Svelte package reappearing in a diff is a regression.

- **Command palette** — item model and search in `next/src/palette/`
  (`items.ts`, `fuzzy.ts`); the modal is
  `next/src/components/palette/FuzzyFinder.tsx`.
- **i18n** — `messages/{en,ko}.json` hold UI strings. Korean routes live under
  `next/app/(ko)/ko/`.
- **Content** — `next/src/content/article.tsx` renders the shared EN/KO detail
  page (JSON-LD Article, hreflang, Open Graph, reading progress). RSS
  (`next/app/(en)/rss.xml/`, `next/app/(ko)/ko/rss.xml/`) and
  `next/app/sitemap.xml/` are route handlers that run once at build time.
  Markdown renders as HAST converted to React elements, not an HTML string.

## Review categories

### Next and React changes

- **N1 Static export.** Flag request-time features: cookies, Server Actions,
  request-dependent handlers, rewrites, ISR, default image optimization.
  Dynamic routes are fully enumerated with `generateStaticParams`.
- **N2 Server/Client boundary.** Components are server-first and run at build
  time. Keep `'use client'` boundaries narrow, props serializable and browser
  APIs inside client code.
- **N3 Output contract.** Preserve canonical URLs, locale alternates,
  metadata, JSON-LD, RSS and sitemap, accessibility and hydration behavior.
  Compare generated artifacts, not JSX shape.
- **N4 Content rendering.** Preserve the guarded AST, typography, Shiki,
  headings, Mermaid, reading time and safe HTML/JSON-LD serialization.
- **N5 Accessibility.** Labels, `alt`, ARIA, focus management and keyboard
  equivalents for every interactive element.
- **N6 XSS and injection.** The sinks under `next/src/components/` and
  `next/src/content/` are the JSON-LD `<script>` blocks (`article.tsx`,
  `BlogHome.tsx`, `PostsListPage.tsx`), the hero and post-card cover HTML
  (`article.tsx`, `PostCard.tsx`), Pagefind excerpts (`SearchPage.tsx`) and
  Mermaid SVG (`Mermaid.tsx`). A new `dangerouslySetInnerHTML` or `innerHTML`
  use anywhere is a sink to review the same way. Injected values must be
  build-time content or the site's own schema, never user-controlled data.
- **N7 i18n integrity.** New UI strings go into BOTH `messages/en.json` and
  `messages/ko.json` (key parity) and are read through the generated Paraglide
  messages, not hardcoded.
- **N8 Tailwind v4.** Theme tokens live in `@theme {}` inside `src/app.css`
  (imported by `next/app/globals.css`). Tailwind runs through
  `next/postcss.config.mjs`; there is no `tailwind.config.*`. Custom utilities
  use `@utility`. Flag v3 patterns: `@tailwind base`, a JS config,
  `@layer components` for utilities.

### Markdown and content changes

- **C1 Frontmatter completeness.** Posts carry `title`, `description`, `date`,
  `updated`, `tags`, `category`, `lang` and `draft`. KO posts add
  `source_lang`, `source_slug`, `source_updated` and `translation_date`.
  `readingTime` is never set by hand:
  `next/src/markdown/plugins/remark-reading-time.ts` computes it at build time.
- **C2 EN/KO parity.** A KO post's `source_slug` resolves to a real EN slug;
  `category` and `tags` stay consistent across the pair.
- **C3 Mermaid.** Diagrams are standard `mermaid` code fences;
  `next/src/markdown/plugins/remark-mermaid-node.ts` turns them into the client
  Mermaid component before Shiki runs.
- **C4 Blog voice.** The blog shares; it does not lecture. Flag fabricated
  debugging narratives and "here's what I'll teach you" framing. KO
  translations use natural 해요/합니다, keep technical terms in English and do
  not over-formalize.

### All changes

- **A1 Conventional Commits.** PR title is `type(scope): description`,
  lowercase, no trailing period.
- **A2 Atomic scope.** Only files tied to the claimed change; flag unrelated
  drift.

## Do not flag

- `next/src/paraglide/` is generated by Paraglide-JS. Never call it duplicated
  code or suggest editing it directly.
- A Korean page rendering EN content behind the translation notice is the
  intended fallback (`isFallback` in `next/src/content/article.tsx`), not a
  missing translation to fix in code.
- The thin root package plus the `next/` workspace package is the current
  layout. Collapsing `next/` into the root is a tracked follow-up, not a
  finding, and the root-level shared inputs above are imported on purpose.
- Category filtering on `/posts` is client-side `useState` with no URL params,
  a deliberate static-export choice. Do not suggest server-side or URL-based
  filtering; it would force prerendering every category combination.
- Prerendered HTML and the Pagefind index under `next/build/` are expected
  build artifacts, not misconfiguration.
- `deno.lock` and `pnpm-lock.yaml` coexist on purpose: deno runs the 3B
  scripts, pnpm runs the app build. Not a "two package managers" mistake.

`docs` and `CLAUDE.md` are committed symlinks into the 3B repo. A PR should not
change them; if one does, that is the finding. `AGENTS.md` is a committed file
holding only the review pointer to this file; the Codex profile is the
git-ignored `AGENTS.override.md` symlink, which must never be committed.

## Verification

CI (`.github/workflows/ci.yml`) runs lint, format check, build, type check,
date validation and the 3B snapshot check on each PR to `main`. The pre-push
hook (`.husky/pre-push`) runs the same set except the snapshot check, plus a
`deno.lock` drift check. Name the gates the change needs:

| Area changed                             | Gate                                            |
| ---------------------------------------- | ----------------------------------------------- |
| Anything                                 | `pnpm run lint`, `pnpm run format:check`        |
| `next/`, shared root inputs, `messages/` | `pnpm run build`, `pnpm run check`              |
| `src/content/posts/`                     | `pnpm run validate:dates`, `pnpm run build`     |
| `src/lib/data/system-snapshot.json`      | `deno task snapshot:3b:check`                   |
| Root `package.json` dependencies         | `deno install --frozen --node-modules-dir=none` |

`build` is the Next build then Pagefind; `check` compiles Paraglide then runs
`tsc --noEmit` in `next/`. CI has no test suite. A change to
`scripts/audit-posts.ts` or `scripts/sync-from-3b.ts` runs the command in the
header of its `.test.ts` file.
