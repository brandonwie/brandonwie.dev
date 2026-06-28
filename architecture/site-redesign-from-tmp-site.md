---
tags: [architecture, documentation, renewal]
created: 2026-06-22
updated: 2026-06-22
status: draft
related:
  - ./README.md
  - ./decisions/0001-terminal-vs-command-palette.md
  - ../tmp/site/index.html
  - ../tmp/site/assets/terminal.css
  - ../tmp/site/assets/site.js
when_used: Read before implementing the tmp/site terminal redesign in SvelteKit.
---

# Site Redesign From `tmp/site`

Reviewer-mode brief for redesigning the full `brandonwie.dev` SvelteKit site
from the static terminal mock in `tmp/site`. This is analysis and planning only:
no implementation ownership is implied by this document.

## Evidence Base

- `tmp/site` contains 14 HTML pages and 2 shared assets: `assets/terminal.css`
  and `assets/site.js`.
- The live app is SvelteKit, not a static HTML site: scripts and dependencies
  in `package.json` include SvelteKit, mdsvex, Paraglide, Tailwind v4,
  Pagefind, `@xyflow/svelte`, `d3-shape`, and `fuse.js`.
- Existing shared surfaces are concentrated in `src/app.css`,
  `src/routes/+layout.svelte`, `src/lib/components/SiteHeader.svelte`,
  `src/lib/components/palette/FuzzyFinder.svelte`, page components under
  `src/lib/components`, and study components under
  `src/lib/components/study`.
- Existing EN routes cover home, posts, post detail, search, about, study,
  study DSA pages, `/system`, and `/system/3b`. The static mock additionally
  includes pages for projects, uses, now, tags, contact, and a top-level 404
  terminal treatment.
- Prior repo memory says public-site wording should stay source-bounded. Treat
  static mock copy as design input until claims are validated against current
  data sources.

## One-by-One `tmp/site` File Review

| Source file                        | Evidence anchors                                                                                                                  | What it contributes                                                                                                                                                                | Implementation implication                                                                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tmp/site/3b.html`                 | `nav:33`, `h1:51`, `section:62`, `footer:101`, controls at `42-43`                                                                | 3B system overview with layered stats, subsystem cards, and blog-series progress.                                                                                                  | Map to existing `/system/3b` rather than creating a duplicate `/3b` route unless a redirect is explicitly wanted. Reuse `System3bPage.svelte` data and graph work instead of porting static cards blindly. |
| `tmp/site/404.html`                | `nav:25`, `h1:47`, `footer:65`, controls at `34-35,51`                                                                            | Terminal-styled error state with recovery links and command palette entry.                                                                                                         | Replace current `src/routes/+error.svelte` visual treatment while preserving existing SvelteKit error semantics and metadata.                                                                              |
| `tmp/site/about.html`              | `nav:49`, `h1:72`, `section:84`, `footer:161`, controls at `58-59`                                                                | About narrative, career arc, operating principles, stats, terminal panels, and external profile links.                                                                             | Re-skin `AboutPage.svelte` and `src/lib/data/about.ts`; validate every career/project claim before copying.                                                                                                |
| `tmp/site/computed-backlinks.html` | `nav:38`, `h1:56`, `section:65`, `footer:113`, controls at `47-48`                                                                | Article page pattern with prose, pullouts, badges, and related-series cards.                                                                                                       | Port as a generic `PostDetail.svelte` treatment; do not create a special-case article component for one post.                                                                                              |
| `tmp/site/contact.html`            | `nav:30`, `h1:48`, `section:53`, `footer:80`, form at `59-62`                                                                     | Contact page with channel cards and a lightweight form shell.                                                                                                                      | Requires a new route and a decision on form behavior. If no backend exists, use mailto/social channels and make any form visibly non-submitting or omit it.                                                |
| `tmp/site/dsa-i.html`              | `nav:59`, `h1:77`, `section:87`, `footer:160`, controls at `108-115`                                                              | DSA I study page with roadmap, Big-O controls, array insert controls, and self-checks.                                                                                             | Re-skin existing `DsaIStudyPage.svelte` and visualizers. Do not replace existing Svelte interactive components with static JS.                                                                             |
| `tmp/site/dsa-ii.html`             | `nav:53`, `h1:71`, `section:81`, `footer:150`, controls at `104,125,141-143`                                                      | DSA II study page with BST insert, heap controls, and self-checks.                                                                                                                 | Re-skin existing `DsaIIStudyPage.svelte`, `HeapVisualizer.svelte`, and related study components.                                                                                                           |
| `tmp/site/index.html`              | `nav:46`, `h1:68`, `section:86`, `footer:140`, controls at `55-56,73`                                                             | Home page with hero terminal prompt, selected systems, recent log, and currently section.                                                                                          | Rework `BlogHome.svelte` and home route composition; keep the data-driven recent-post feed.                                                                                                                |
| `tmp/site/now.html`                | `nav:20`, `h1:38`, `section:44`, `footer:56`, controls at `29-30`                                                                 | Compact now page with current focus cards.                                                                                                                                         | New route. Needs a durable data source or an explicit manual-content owner before shipping.                                                                                                                |
| `tmp/site/posts.html`              | `nav:29`, `h1:47`, `section:52`, `footer:100`, filters at `56-61`                                                                 | Post listing with terminal log rows and category chips.                                                                                                                            | Re-skin `src/routes/posts/+page.svelte` and the Korean mirror. Category filtering should use existing post store/sidebar state, not static DOM filtering.                                                  |
| `tmp/site/projects.html`           | `nav:31`, `h1:49`, `section:54`, `footer:149`, controls at `40-41`                                                                | Projects page with project case cards, metrics/facts, tags, and work-principle cards.                                                                                              | New route and probably a new `src/lib/data/projects.ts`. Validate all project wording and links before publishing.                                                                                         |
| `tmp/site/study.html`              | `nav:32`, `h1:50`, `section:55`, `footer:104`, controls at `41-42`                                                                | Study index with approach text and course cards for DSA I/II.                                                                                                                      | Re-skin `StudyIndexPage.svelte` while preserving `study.ts` and source-drift checks.                                                                                                                       |
| `tmp/site/tags.html`               | `nav:25`, `h1:43`, `section:48`, `footer:80`, controls at `34-35`                                                                 | Tag/category landing page with top-category cards and all-tags grid.                                                                                                               | New route. Prefer deriving counts from post metadata instead of hard-coding static counts.                                                                                                                 |
| `tmp/site/uses.html`               | `nav:21`, `h1:39`, `section:44`, `footer:80`, controls at `30-31`                                                                 | Uses page with grouped tool stack cards.                                                                                                                                           | New route and a small data module if the content should stay maintainable.                                                                                                                                 |
| `tmp/site/assets/terminal.css`     | token root at `4`, nav at `29`, page header around `48`, sections at `56`, terminal panel at `66`, cards at `78`, buttons at `98` | Terminal design system: Rose Pine-like palette, mono/sans fonts, global grid background, wrappers, nav, page heads, panels, cards, stats, buttons, prose, footer, progress, toast. | Translate into `src/app.css` and Svelte components. Avoid a one-shot CSS paste if it duplicates existing Tailwind tokens and theme variables.                                                              |
| `tmp/site/assets/site.js`          | reveal at `31`, progress at `46`, command palette at `56`, language toggle at `116`, wiring at `133`, DOM ready at `142`          | Progressive interactions: reveal-on-scroll, card pointer glow, reading progress, command palette, language toggle placeholder, toast feedback.                                     | Reuse existing `FuzzyFinder.svelte`, `ThemeToggle.svelte`, `LanguageToggle.svelte`, and Svelte lifecycle. Do not transplant DOM-query JS wholesale.                                                        |

## Current App Touchpoints

| Current surface                                 | Evidence anchors                                                          | Redesign role                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/app.css`                                   | style/theme starts at `4`; current file has 431 lines and Tailwind import | Central place for tokens, terminal primitives, typography, and global reset.                      |
| `src/routes/+layout.svelte`                     | script at `30`, metadata around `39`, layout markup around `80`           | Owns shell, metadata, command palette mount, language/theme controls, and page container.         |
| `src/lib/components/SiteHeader.svelte`          | script at `1`, imports around `12`, header/nav around `3-6`               | Replace with terminal nav from the mock while keeping route-aware active states and i18n labels.  |
| `src/lib/components/palette/FuzzyFinder.svelte` | script at `13`, palette references around `2`, header around `71`         | Existing command palette should become the implementation target for `data-cmdk` behavior.        |
| `src/lib/components/BlogHome.svelte`            | script at `1`, layout around `95`, 291 lines                              | Home redesign target. Preserve post data hydration and SEO.                                       |
| `src/routes/posts/+page.svelte`                 | script at `11`, SEO at `17`, layout around `73`, 134 lines                | Post list redesign target, with category chips mapped to current filter state.                    |
| `src/lib/components/PostDetail.svelte`          | script at `1`, layout around `168`, header around `199`, 270 lines        | Article/prose redesign target. Preserve ToC, Giscus, JSON-LD, hreflang, and mdsvex output.        |
| `src/lib/components/AboutPage.svelte`           | script at `1`, layout around `49`, 211 lines                              | About redesign target, backed by `src/lib/data/about.ts`.                                         |
| `src/lib/components/study/*`                    | DSA I page: 120 lines; DSA II page: 118 lines; shell: 19 lines            | Study redesign target. Keep existing Svelte visualizer modules and reduced-motion helpers.        |
| `src/lib/components/System3bPage.svelte`        | script at `15`, SEO at `18`, layout around `129`, 322 lines               | 3B redesign target. Keep current graph/system data rather than flattening to static mock content. |
| `src/lib/data/nav.ts`                           | route/navigation data around `2-12`, 94 lines                             | Add route labels for new pages and reconcile `/system/3b` vs mock `3b.html`.                      |

## Reusable Component Model

Build reusable Svelte primitives first, then port pages onto them. The static
mock repeats enough structure to justify a small component layer.

| Component         | Inputs                                                         | Source patterns                                             | Current destination                                                    |
| ----------------- | -------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| `TerminalShell`   | children, optional compact/full width                          | global grid, `.wrap`, page background, progress/toast hooks | `src/routes/+layout.svelte`, `src/app.css`                             |
| `TerminalNav`     | nav items, active route, locale links, command-palette trigger | all HTML files repeat `nav` and `data-cmdk`                 | `SiteHeader.svelte`, `nav.ts`, `FuzzyFinder.svelte`                    |
| `PageHead`        | crumb, eyebrow, title, lede, actions                           | `page-head` appears on most pages                           | New shared component used by about/posts/study/system/new static pages |
| `SectionBlock`    | hash label, title, meta/action, layout density                 | `sec`, `sec.tight`, `sec-head`                              | New shared component or Svelte snippet pattern                         |
| `TerminalPanel`   | title, prompt/body, tone                                       | 404, about, contact, study, home terminal treatments        | Shared component for hero/error/contact/study explainers               |
| `TerminalCard`    | title, badge, description, href, tags, variant                 | `card`, `course-card`, `proj`, `ucard`                      | Shared card primitive with variants kept small                         |
| `StatsStrip`      | metrics array                                                  | home/about/3B/project stats                                 | Shared data-driven row                                                 |
| `ChipList`        | chips, active state, click handler                             | tags, filters, course modules, project tags                 | Posts filter and presentational tags                                   |
| `PostLogList`     | posts, category, locale                                        | `posts.html` log rows and home recent log                   | `posts/+page.svelte`, `BlogHome.svelte`                                |
| `ArticleShell`    | post data, prose slot, related posts, TOC                      | `computed-backlinks.html` article/prose cards               | `PostDetail.svelte`                                                    |
| `StudyCourseCard` | course metadata, modules, demos                                | `study.html` course cards                                   | `StudyIndexPage.svelte`                                                |
| `StudyDemoFrame`  | title, controls slot, visualizer slot, notes                   | DSA I/II demo sections                                      | Existing visualizer pages                                              |
| `ContactChannels` | channels array                                                 | `contact.html` channel list                                 | New contact route                                                      |
| `ProjectCaseCard` | project facts, links, tags, status                             | `projects.html` project articles                            | New projects route                                                     |
| `UsesGroup`       | group title, key/value rows                                    | `uses.html` grouped stack cards                             | New uses route                                                         |
| `TagIndex`        | derived counts and category metadata                           | `tags.html` categories/hash grid                            | New tags route from post metadata                                      |

Do not create a component per mock class. The useful abstraction boundary is the
repeated page structure and data-driven content shape, not every CSS selector.

## Route and Content Mapping

| Mock source               | Proposed Svelte route                                     | Status                                                                |
| ------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| `index.html`              | `/` and `/ko`                                             | Existing route, redesign only.                                        |
| `about.html`              | `/about` and `/ko/about`                                  | Existing route, redesign only.                                        |
| `posts.html`              | `/posts` and `/ko/posts`                                  | Existing route, redesign only.                                        |
| `computed-backlinks.html` | `/posts/[slug]` and `/ko/posts/[slug]`                    | Existing route pattern, redesign only.                                |
| `study.html`              | `/study` and `/ko/study`                                  | Existing route, redesign only.                                        |
| `dsa-i.html`              | `/study/dsa-i` and `/ko/study/dsa-i`                      | Existing route, redesign only.                                        |
| `dsa-ii.html`             | `/study/dsa-ii` and `/ko/study/dsa-ii`                    | Existing route, redesign only.                                        |
| `3b.html`                 | `/system/3b` and `/ko/system/3b`; optional `/3b` redirect | Existing route has different public path. Decide redirect separately. |
| `404.html`                | SvelteKit `+error.svelte`                                 | Existing route, redesign only.                                        |
| `projects.html`           | `/projects` and maybe `/ko/projects`                      | New route and data source.                                            |
| `uses.html`               | `/uses` and maybe `/ko/uses`                              | New route and data source.                                            |
| `now.html`                | `/now` and maybe `/ko/now`                                | New route and content owner needed.                                   |
| `tags.html`               | `/tags` and maybe `/ko/tags`                              | New route derived from posts.                                         |
| `contact.html`            | `/contact` and maybe `/ko/contact`                        | New route; form behavior unresolved.                                  |

## Subtasks

1. Confirm route contract and decide whether mock-only pages ship now or stay
   behind a feature flag.
2. Audit static mock copy against current content sources; mark unverified
   project, career, metric, and "now" claims before implementation.
3. Convert `terminal.css` tokens into the existing `src/app.css` theme model.
4. Build the shared terminal component primitives listed above.
5. Rework the app shell: nav, footer, progress indicator, command-palette
   trigger, language/theme controls, and skip-link behavior.
6. Redesign existing primary pages: home, about, posts, post detail, study
   index, DSA I, DSA II, system/3B, search, and error page.
7. Add new content/data modules for projects, uses, now, tags, and contact if
   those pages are approved.
8. Implement new routes with EN first, then add `/ko` mirrors or explicit
   fallback rules.
9. Reconcile command-palette items and nav metadata in `src/lib/data/nav.ts`
   and `src/lib/palette/items.ts`.
10. Preserve SEO behavior in `src/lib/seo.ts`, route metadata, feeds, sitemap,
    OG image generation, JSON-LD, hreflang, and Pagefind indexing.
11. Preserve accessibility: keyboard command palette, focus rings, reduced
    motion, semantic landmarks, form labels, color contrast, and mobile layout.
12. Run visual QA across desktop and mobile, comparing against `tmp/site` while
    validating actual Svelte routes rather than static HTML.
13. Run repo checks: `pnpm check`, `pnpm lint`, `pnpm build`, `pnpm study:check`,
    and any project-specific sync/status checks required by the touched files.
14. Prepare a reviewer checkpoint before broad page migration and another before
    shipping, because this is a full-site visual refactor with high regression
    surface.

## Step-by-Step Plan

### Phase 0 - Decision Gate

1. Confirm public route inventory: whether `/projects`, `/uses`, `/now`,
   `/tags`, and `/contact` should ship in this redesign.
2. Decide top-level `/3b` behavior: canonical route, redirect, or nav alias to
   `/system/3b`.
3. Decide whether the contact form is real, mailto-only, or removed.
4. Freeze a copy-validation list for public claims before code migration.

Exit criteria: approved route table, content-source decision, and known
non-goals.

### Phase 1 - Foundation

1. Translate mock tokens from `tmp/site/assets/terminal.css` into `src/app.css`.
2. Add terminal primitives with stable dimensions and responsive constraints:
   shell, nav, page head, section, panel, card, chips, stats, buttons, prose.
3. Wire the command-palette trigger to the existing `FuzzyFinder.svelte`.
4. Keep interaction behavior in Svelte components and stores; do not port
   `site.js` as global DOM-query code.

Exit criteria: primitives render in isolation or on one low-risk page, and
keyboard/focus behavior is intact.

### Phase 2 - Shared Shell Migration

1. Replace global header/footer treatment in `+layout.svelte` and
   `SiteHeader.svelte`.
2. Preserve metadata setup, language links, theme state, command palette mount,
   and skip-link behavior.
3. Redesign `+error.svelte` with the mock 404 terminal state.

Exit criteria: all existing routes still navigate, active states are correct,
and no generated Paraglide output is hand-edited.

### Phase 3 - Existing Page Migration

1. Port home from `index.html` into `BlogHome.svelte` using existing post data.
2. Port about from `about.html` into `AboutPage.svelte` using `about.ts`.
3. Port post list from `posts.html` into `posts/+page.svelte` and `/ko/posts`.
4. Port article layout from `computed-backlinks.html` into `PostDetail.svelte`.
5. Port study index and DSA pages while preserving existing visualizers.
6. Port 3B visual language into `System3bPage.svelte` without removing graph
   data and interactions.

Exit criteria: existing page functionality is preserved with the new terminal
visual language.

### Phase 4 - New Page Build

1. Create data-backed `/projects`, `/uses`, `/now`, `/tags`, and `/contact`
   pages only after Phase 0 approval.
2. Derive tags from current post metadata, not static mock counts.
3. Add route metadata and command-palette entries for approved pages.
4. Add Korean mirrors only where translation/content policy is clear.

Exit criteria: new pages are discoverable from nav and command palette, and
their content sources are explicit.

### Phase 5 - Verification

1. Static checks: `pnpm check`, `pnpm lint`, `pnpm study:check`.
2. Build checks: `pnpm build`; if Pagefind or OG output changes, inspect the
   build log and generated routes.
3. Visual checks: Playwright screenshots for desktop and mobile on home, posts,
   post detail, study, DSA I, DSA II, system/3B, about, error, and any new
   approved pages.
4. Interaction checks: command palette, language toggle, theme toggle, post
   filters, search, study controls, article ToC, and reduced-motion mode.
5. SEO checks: canonical, title/description, hreflang, sitemap/feed output,
   JSON-LD where currently present, and Pagefind indexing.

Exit criteria: checks pass, screenshots match the terminal design intent, and
no source-bounded content claim remains unverified.

## Acceptance Criteria

- Every page keeps semantic landmarks, keyboard navigation, and visible focus.
- The terminal design system is reusable, not copy-pasted per route.
- Existing data-driven behavior remains data-driven: posts, tags, study
  sources, system snapshot, command palette, SEO metadata, and locale routing.
- New pages have explicit data ownership and do not ship unverifiable claims.
- `/ko` behavior is intentionally handled for every added route.
- The final diff does not hand-edit generated files under
  `src/lib/paraglide/**`, build output, or `tmp/site/**`.
- Visual QA covers at least one desktop and one mobile viewport per route
  family.

## Reviewer Risks and Objections

- The mock uses static HTML paths such as `3b.html`; the live app has
  `/system/3b`. Shipping both without a redirect decision risks duplicate
  content and SEO confusion.
- `tmp/site/assets/site.js` is DOM-query code. Porting it wholesale would fight
  Svelte state and duplicate the existing command palette and language controls.
- The mock includes new public pages and claims. Publishing them without source
  validation would violate the site's source-bounded content posture.
- Static tag counts in `tags.html` will drift unless derived from post metadata.
- The contact form needs a real submission path or a visibly honest fallback.
- Full-site styling changes can break MDX output, Pagefind search, Giscus,
  Mermaid blocks, ToC anchors, and study visualizers even when ordinary route
  screenshots look fine.

## Open Questions

1. Should `/projects`, `/uses`, `/now`, `/tags`, and `/contact` ship as part of
   this redesign, or should the first PR only redesign existing routes?
2. Should `/3b` become a public redirect/alias to `/system/3b`?
3. What is the canonical source for projects, now-page content, uses/tooling,
   and contact-channel metadata?
4. Should Korean mirrors be authored for every new page immediately, or should
   the nav hide untranslated pages until content exists?
5. Should the terminal design keep the Google Fonts import from the mock, or
   map to existing local/static font handling?
