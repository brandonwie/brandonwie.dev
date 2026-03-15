# brandonwie.dev - Progress

## Milestones

- [x] Project initialized with 3B integration
- [x] Core terminal functionality complete
- [x] First deployment to Cloudflare Pages
- [x] 8 posts published (EN + KO)
- [x] 52 posts published (EN + KO) with full blog narratives
- [x] 94 EN posts published (42 new from 3B reference unblocking)
- [x] Full EN/KO parity — 94 EN + 94 KO posts
- [x] Sort-by-updated across all views + 79 posts resynced with latest 3B content
- [x] Custom domain live
- [x] Tailwind CSS v3 → v4 migration + PostDetail extraction + View Transitions
- [x] Shiki v1 → v4 + OG image generation for all posts
- [x] ESLint v9 + Prettier + GitHub Actions CI + Table of Contents + 8 posts expanded
- [x] Pagefind static search — full-text content search across 188 pages

## Session Log

### 2026-03-15 (Session 4)

**Pagefind Static Search Integration**

Added full-text content search to the blog using Pagefind. Users can now search
inside post body content, not just metadata (title, description, tags).

1. **Build pipeline**
   - Installed `pagefind` as devDependency
   - Chained `npx pagefind --site build` after `vite build`
   - 188 pages indexed, 2 filters (lang, category), 1 sort (date)

2. **Content indexing** (`PostDetail.svelte`)
   - `data-pagefind-body` on `<article>` (opt-in mode)
   - Hidden `<span data-pagefind-filter="lang">` for multi-language filtering
   - `data-pagefind-filter="category"` on category badge
   - `data-pagefind-sort="date[datetime]"` on `<time>` element
   - `data-pagefind-ignore` on ToC, fallback notice, Giscus comments
   - Fallback pages (KO showing EN content) correctly set lang to `"en"`

3. **Search page** (`SearchPage.svelte`)
   - Lazy-loads Pagefind WASM via indirected dynamic import
   - `debouncedSearch()` with 200ms debounce, lang filter
   - Dev mode fallback notice (Pagefind only exists after build)
   - Terminal-styled input with orange `>` prefix
   - Result cards with category badge, title, highlighted excerpt

4. **Routes & i18n**
   - `/search` (EN) and `/ko/search` (KO) routes
   - 6 i18n keys added to `messages/en.json` and `messages/ko.json`
   - Paraglide URL pattern added to `vite.config.ts`
   - Search icon links on BlogHome, `/posts`, `/ko/posts` headers

5. **Rollup build fix**
   - `import('/pagefind/pagefind.js')` fails: Rollup statically resolves it
   - Fix: indirected string variable makes path opaque to static analysis

**Build:** 0 errors, 0 warnings. 188 pages indexed by Pagefind.

**Next:** Newsletter signup, analytics, auto-sync

---

### 2026-03-15 (Session 3)

**4 Parallel Tasks: ESLint, CI, ToC, Blog Expansion**

Executed 4 high-priority backlog items simultaneously using TeamCreate (4 agents
in tmux split panes):

1. **ESLint v9 + Prettier**
   - Flat config with typescript-eslint, eslint-plugin-svelte, eslint-config-prettier
   - Prettier with svelte plugin (tabs, single quotes, 100 printWidth)
   - Formatted entire codebase, fixed unused import warnings
   - 0 errors, 13 warnings (all intentional)

2. **GitHub Actions CI**
   - `.github/workflows/ci.yml` — lint, format:check, build, svelte-check
   - Un-ignored `package-lock.json` for `npm ci`
   - Post-push fix: build before check (Paraglide Vite plugin ordering)

3. **Table of Contents sidebar**
   - `remark-toc-extract.js` — custom remark plugin for h2/h3 headings
   - `TableOfContents.svelte` — sticky sidebar (xl+), collapsible (mobile)
   - IntersectionObserver active heading tracking, orange highlight
   - Only shown for posts with 3+ headings

4. **Blog expansion (8 posts)**
   - vpc-networking, ecr-ecs-deployment, websocket-architecture, fastapi-di,
     traefik-keycloak, oauth2, docker-compose-cicd, pessimistic-locking
   - Added hooks, transitions, code explanations, practical conclusions

**Build:** 942 files, 0 errors, 0 warnings. 192 post pages prerendered.

**Commits:**

| Hash    | Description                                                |
| ------- | ---------------------------------------------------------- |
| e347e5c | chore(lint): add ESLint + Prettier with Svelte 5 support   |
| c8ebc8d | ci: add GitHub Actions workflow for build and lint checks  |
| a201010 | feat(blog): add table of contents sidebar for post pages   |
| 3d96037 | content: expand 8 reference posts to narrative blog format |
| 10eb4ff | fix(ci): run build before check for Paraglide generation   |

**Next:** Newsletter signup, analytics, static search, auto-sync

---

### 2026-03-15 (Session 2)

**Shiki v4 Migration + OG Image Generation**

Completed two high-priority backlog items:

1. **Shiki v1 → v4 Migration**
   - Zero-code migration — `createHighlighter` API is backward compatible
   - Build and type check pass without changes to `svelte.config.js`

2. **OG Image Generation**
   - Created `scripts/generate-og-images.ts` using Satori + @resvg/resvg-js
   - Terminal-themed design: dark bg, traffic light dots, category badge, title,
     prompt line with block cursor
   - 95 PNGs generated (94 posts + 1 default), ~2.7MB total
   - Added `og:image` + `twitter:image` meta tags to PostDetail + root layout
   - JetBrains Mono font bundled in `static/fonts/` for Satori rendering

**Build:** 921 files, 0 errors, 0 warnings.

**Commits:**

| Hash    | Description                                           |
| ------- | ----------------------------------------------------- |
| 1337413 | chore(deps): upgrade shiki v1 to v4                   |
| 0bed5b8 | feat(seo): add OG image generation for all blog posts |

**Next:** ESLint + Prettier, GitHub Actions CI, Table of Contents, blog expansion

---

### 2026-03-15

**Site-Wide Improvement Plan — P0 through P4**

Executed a comprehensive improvement plan across all layers:

1. **P0 — Quick Wins**
   - Enabled `precompress: true` for .br/.gz at build time (svelte.config.js)
   - Fixed KO RSS date sorting to use `effectiveDate` (was sorting by raw `date`)
   - Added JSDoc types to `remark-reading-time.js` plugin
   - Fixed slug property ordering in 4 page loaders (`{ ...metadata, slug }`)
   - Improved Terminal a11y: `tabindex="-1"` + `onkeydown` handler

2. **P1 — Dependency Updates** (semver-compatible)
   - SvelteKit 2.55.0, Svelte 5.53.12, svelte-check 4.4.5
   - Paraglide 2.15.0, @types/node 22.19.15

3. **P2.1 — Tailwind CSS v3 → v4 Migration**
   - Deleted `tailwind.config.ts`, `postcss.config.js`
   - Rewrote `app.css` with `@import "tailwindcss"`, `@plugin`, `@theme`, `@utility`
   - Added `@tailwindcss/vite` plugin to `vite.config.ts`
   - Removed `autoprefixer`, `postcss`, `@tailwindcss/postcss`
   - `prose-terminal` now `@utility` + plain CSS for element selectors

4. **P3.1 — JSON-LD + PostDetail Extraction**
   - Created `PostDetail.svelte` — shared component for EN/KO post pages
   - EN + KO detail pages reduced to thin wrappers (~8 lines each)
   - JSON-LD Article schema on all 188 post pages

5. **P4.1 — View Transitions API**
   - Added `onNavigate` hook in root layout (progressive enhancement)

6. **P4.3 — Reading Progress Indicator**
   - Created `ReadingProgress.svelte` — thin orange bar at top of post pages

**Build:** 921 files, 0 errors, 0 warnings. Precompressed output (~473 .br + .gz files).

### 2026-01-26

**Initial Build Session**

Built the complete personal blog with interactive terminal UI:

1. **Project Setup**
   - SvelteKit with adapter-static for SSG
   - Tailwind CSS with Claude Code terminal theme
   - mdsvex for markdown with Shiki syntax highlighting
   - JetBrains Mono font

2. **Terminal Core**
   - Virtual filesystem abstraction for posts
   - Svelte stores for terminal state (history, cwd, output)
   - Fuse.js integration for fuzzy search

3. **Commands Implemented**
   - Navigation: `ls`, `ll`, `cd`, `pwd`
   - Reading: `cat`, `read`
   - Search: `grep`, `search`, `find`
   - Info: `whoami`, `about`, `help`, `man`
   - Utility: `clear`, `history`, `open`, `echo`

4. **UI Components**
   - Terminal.svelte - Main container with header
   - CommandLine.svelte - Input with tab completion
   - Output.svelte - Render command results
   - FuzzyFinder.svelte - Ctrl+P/K search overlay

5. **SEO Features**
   - Direct post URLs (/posts/[slug])
   - RSS feed (/rss.xml)
   - Sitemap (/sitemap.xml)
   - Open Graph and Twitter meta tags

6. **Content Pipeline**
   - Sync script to transform 3B content
   - Sample post created for testing

**Commits:**

| Hash    | Description                  |
| ------- | ---------------------------- |
| 8811ecd | Project setup                |
| 8aeb926 | Terminal stores + filesystem |
| e57c7b4 | Terminal commands            |
| 7c683ab | Terminal UI + fuzzy finder   |
| 4ea2f07 | Content routes + SEO         |
| d565f6e | Build fixes + enhancements   |

**Next:** Deploy to Cloudflare Pages

---

### 2026-01-27

**Mobile UX Improvements**

Fixed mobile web issues and improved terminal responsiveness:

1. **Mobile Input Fix**
   - Added `z-10` to ensure input receives touch events
   - Added `font-size: 16px` to prevent iOS Safari zoom
   - Added `-webkit-text-fill-color: transparent` for better mobile compatibility
   - Added `autofocus` attribute for focus on page load

2. **Responsive Prompt**
   - Mobile: `~$` (short, fits on one line with input)
   - Desktop: `visitor@brandonwie.dev:~$` (full prompt)
   - Uses Tailwind responsive classes (`md:hidden`/`md:inline`)

3. **Click-to-Focus**
   - Clicking anywhere on terminal body focuses input
   - Exposed `focus()` method from CommandLine component
   - Better UX for both desktop and mobile

**Commits:**

| Hash | Description                             |
| ---- | --------------------------------------- |
| TBD  | fix: mobile input and responsive prompt |

**Next:** Sync real content from 3B

---

### 2026-01-28

**i18n & Content Sync**

Added full internationalization support and synced real content from 3B:

1. **Paraglide-JS Internationalization**
   - Route-based locale detection (`/` = English, `/ko` = Korean)
   - Message files in `messages/en.json` and `messages/ko.json`
   - Language toggle component in terminal header
   - Fallback handling for untranslated posts

2. **Translation Workflow Scripts (Deno)**
   - `sync-from-3b.ts` - Syncs blog-ready posts from 3B knowledge base
   - `translation-status.ts` - Shows posts needing translation
   - `translation-create.ts` - Creates Korean template from English post

3. **Content Synced**
   - 8 English posts synced from 3B (aws, backend, devops, security, icalendar)
   - 8 Korean translations created manually
   - Removed placeholder redis-caching-patterns post

4. **FuzzyFinder Improvements**
   - Dynamic post loading via +page.ts (replaces hardcoded data)
   - Auto-scroll when navigating with ↑/↓ keys (uses $effect rune)
   - Detailed documentation comments

5. **Shiki Languages Added**
   - hcl, terraform, mermaid for code highlighting

6. **UI Fixes**
   - Terminal header cleanup (language toggle, hostname on mobile)
   - Code block background color removed
   - Error page added

**Commits:**

| Hash    | Description                                     |
| ------- | ----------------------------------------------- |
| 415ca9a | feat(i18n): add Paraglide internationalization  |
| 95f40ee | feat(i18n): add translation workflow scripts    |
| 01ab340 | docs: add README with i18n docs                 |
| a6df126 | fix: add error page                             |
| 56182a6 | fix(ui): integrate language toggle into headers |
| 4cc0f06 | fix(ui): show hostname on mobile                |
| 6b655ef | fix(ui): smaller font on mobile header          |
| 4086633 | fix(ui): remove code block background           |
| 7fd1f20 | feat: sync 8 posts with Korean translations     |

**Next:** Publish more posts, add newsletter signup

---

### 2026-01-28 (Session 2)

**Giscus Comments Integration**

Added GitHub Discussions-based comments using giscus:

1. **Giscus Setup**
   - Created `Blog Comments` category in GitHub Discussions
   - Configured giscus.app with repo-id and category-id
   - Selected "specific term" mapping for shared EN/KO threads

2. **Implementation**
   - Created `Giscus.svelte` component with dynamic script injection
   - Uses post slug as discussion term (not pathname)
   - Lazy loading, dark_dimmed theme, reactions enabled
   - Added i18n messages for comments section title

3. **Design Decision**
   - EN (`/posts/slug`) and KO (`/ko/posts/slug`) share same comment thread
   - Uses slug-based mapping so both languages contribute to one discussion

4. **Bug Fix**
   - Fixed Mermaid.svelte: `{variable}` in HTML comment was interpreted as Svelte expression
   - Removed curly braces from comment text to fix build error

**Commits:**

| Hash    | Description                             |
| ------- | --------------------------------------- |
| 847f7fb | feat: add Giscus comments to blog posts |

**Next:** Newsletter signup, more posts

---

### 2026-02-12

**Blog Publish Skill & Sync Fix**

Created `/blog-publish` skill to automate the full publish pipeline and fixed
a broken sync command:

1. **Sync Command Fix**
   - Added `--allow-env` to Deno flags in `package.json`
   - Script uses `Deno.env.get("HOME")` which requires env permission
   - `npm run sync -- --dry-run` now works correctly

2. **Blog Publish Skill** (`3b/.claude/skills/blog-publish/`)
   - 9-step pipeline: discover → select → fix blockers → sync → template
     → translate → build → report
   - Parses dry-run output into 3 categories (ready, updated, almost ready)
   - User checkpoints at selection and blocker-fixing stages
   - Includes standalone translation guide reference

3. **Translation Guide Reference**
   - Extracted from `docs/TRANSLATION.md` for standalone skill use
   - Covers tone, technical terms, common mistakes, quality checklist

**Files Created/Modified:**

| File                                                             | Action                                  |
| ---------------------------------------------------------------- | --------------------------------------- |
| `package.json`                                                   | Fixed sync script (added `--allow-env`) |
| `3b/.claude/skills/blog-publish/SKILL.md`                        | Created skill definition                |
| `3b/.claude/skills/blog-publish/references/translation-guide.md` | Created translation reference           |

**Next:** Test `/blog-publish` end-to-end, publish new posts

---

### 2026-02-12 (Session 2)

**Blog Post Recreation (1 of 8)**

Started recreating 8 published blog posts that read like raw reference material.
Expanded EN with narrative content and retranslated KO with natural 해요체:

1. **vpc-networking-fundamentals (EN)**
   - Added hook (past-self VPC confusion story)
   - Added context paragraphs from 3B Problem/Difficulties sections
   - Added transitions between all sections
   - Added "Practical Takeaway" conclusion (when-to-use / when-not-to-use)
   - Updated description and dates

2. **vpc-networking-fundamentals (KO)**
   - Full retranslation from expanded EN post
   - Natural 해요체 register throughout (no 합니다 mixing)
   - Korean SOV sentence restructure, removed nominalizations
   - Updated all frontmatter dates

**Files Modified:**

| File                                                      | Action                  |
| --------------------------------------------------------- | ----------------------- |
| `src/content/posts/en/aws/vpc-networking-fundamentals.md` | Expanded with narrative |
| `src/content/posts/ko/aws/vpc-networking-fundamentals.md` | Retranslated            |

**Next:** Continue with remaining 7 posts (security-groups-fundamentals next)

---

### 2026-02-12 (Session 3)

**Mass Blog Publish — 44 New Posts (EN+KO)**

Completed the full blog publish pipeline, going from 8 to 52 posts:

1. **Parallel Expansion (10 agents)**
   - 44 new posts expanded from 3B knowledge to narrative blog format
   - 8 existing posts re-expanded with richer narrative
   - 44 new Korean translations + 8 Korean retranslations
   - All using blog-writing-guide.md and translation-guide.md

2. **Build Fixes (4 iterations)**
   - Added 6 missing Shiki languages (css, html, svelte, toml, ini, tsx)
   - Escaped bare `<` characters in markdown (Svelte tag parsing)
   - Removed tsx grammar (Oniguruma regex crash)
   - **Critical fix:** Shiki singleton pattern — mdsvex was creating 700+
     highlighter instances, exhausting Oniguruma WASM memory

3. **Final State**
   - 52 EN posts + 52 KO posts across 9 categories
   - 106 files committed, 20,033 lines added
   - Build succeeds in 22s

**Categories:** backend(15), devops(13), general(8), aws(4), frontend(4),
security(4), icalendar(2), ai-ml(1), data(1)

**Commits:**

| Hash    | Description                                                 |
| ------- | ----------------------------------------------------------- |
| e53bc2e | content: publish 44 new blog posts (EN+KO) with build fixes |

**Next:** Monitor Cloudflare deployment, spot-check rendered posts

---

### 2026-02-19

**Blog/Terminal Dual-View Toggle + Performance & Cursor Fixes**

Completed the dual-view toggle feature and fixed several UX issues:

1. **Blog/Terminal View Toggle** (13 files)
   - `ViewToggle.svelte` — Blog/CLI toggle button with orange highlight
   - `viewMode.ts` — localStorage-persisted writable store
   - `BlogHome.svelte` — Full blog-style homepage with i18n
   - Conditional rendering on home pages (EN + KO)
   - Context-aware back labels on post list and detail pages
   - Added 4 new i18n keys (en.json + ko.json)

2. **Performance Fix** — Slow page load (~10s)
   - Root cause: `import.meta.glob` loading full compiled mdsvex modules
     (52+ sequential async imports)
   - Fix: `{ import: 'metadata', eager: true }` across 4 listing loaders
   - Changed async load functions to synchronous

3. **Terminal Cursor Fix** — Block cursor invisible
   - Debugged via Playwright MCP (screenshots, DOM evaluation)
   - Root cause: hidden input (`z-10`) painted on top of cursor overlay
   - CSS fixes: `display: inline-block`, `min-width: 1ch`,
     `height: 1.2em`, `vertical-align: text-bottom` in `.cursor-block`
   - Final fix: `relative z-20` on cursor overlay div in CommandLine.svelte

4. **Name Format Update**
   - "Brandon (Seokhyun) Wie" in BlogHome header/footer + whoami command

**Commits:**

| Hash    | Description                                     |
| ------- | ----------------------------------------------- |
| b896c9e | feat(ui): add blog/terminal dual-view toggle    |
| cb8338b | perf: use eager metadata-only glob for listings |
| adefc2d | fix(ui): add ViewToggle to terminal header      |
| d8138e0 | fix(ui): show full name in visible content      |
| 5a669a2 | fix(ui): make terminal block cursor visible     |

**Next:** Category sidebar, continue recreating remaining 7 blog posts

---

### 2026-02-19 (Session 2)

**Category Sidebar + Korean Date Fix**

Added category filtering to blog mode and fixed Korean date formatting:

1. **Category Sidebar** (`CategorySidebar.svelte`)
   - Desktop (lg+): vertical `<nav>` sidebar, 192px, inside flex layout
   - Mobile (<lg): horizontal scrollable pill bar with `scrollbar-none`
   - Client-side `$state` filtering — no URL changes, instant filtering
   - `getCategoriesWithCounts()` helper in `posts.ts` (shared EN/KO)
   - Categories sorted by count descending (backend 15 → ai-ml 1)
   - Not on BlogHome — only on `/posts` and `/ko/posts`
   - Layout widened from `max-w-4xl` to `max-w-6xl` to fit sidebar
   - 2 new i18n keys: `all_categories`, `category_filter`

2. **Korean Date Format Fix**
   - `toLocaleDateString('ko-KR')` produced `2026년 2월 11일` — too wide,
     line-breaks on `일` in post cards
   - Changed to manual `YYYY.MM.DD` format (Korean convention with dots)
   - Applied to all 5 `formatDate` instances: BlogHome, posts list (EN/KO),
     post detail (EN/KO)

3. **Documentation Updates**
   - CLAUDE.md: added dual-view architecture, category sidebar design
     decisions, date formatting rationale, updated repo structure tree
   - todos.md: updated session context, added completed items
   - PROGRESS.md: this entry

**Files Modified:**

| File                                        | Change                                    |
| ------------------------------------------- | ----------------------------------------- |
| `src/lib/components/CategorySidebar.svelte` | Created                                   |
| `src/lib/stores/posts.ts`                   | Added `getCategoriesWithCounts()`         |
| `src/routes/posts/+page.svelte`             | Sidebar + filtering + date fix            |
| `src/routes/ko/posts/+page.svelte`          | Sidebar + filtering + date fix            |
| `src/lib/components/BlogHome.svelte`        | Korean date fix                           |
| `src/routes/posts/[slug]/+page.svelte`      | Korean date fix                           |
| `src/routes/ko/posts/[slug]/+page.svelte`   | Korean date fix                           |
| `src/app.css`                               | Added `.scrollbar-none` utility           |
| `messages/en.json`                          | Added `all_categories`, `category_filter` |
| `messages/ko.json`                          | Added `all_categories`, `category_filter` |

**Next:** Continue recreating remaining 7 blog posts

---

### 2026-02-12 (Session 4)

**Friction Feedback Loop for Claude Config**

Implemented the "Reinforced Learning" system — a feedback loop
for self-improving Claude configuration. No brandonwie.dev code
changes; all work was on 3B infrastructure.

1. **Friction-log system** (7 artifacts)
   - `friction-log.json` persistent store with 5W1H observation
     schema
   - `[FRICTION]` buffer format for tagging friction events
   - Step 4.6 (Friction Analysis) added to /wrap skill
   - `friction-analysis.md` reference with full extraction,
     pattern matching, and verification rules
   - Stop hook extended with friction reminder
   - Global CLAUDE.md template updated with Friction Capture
     section

2. **ADR-001** — First Architecture Decision Record in
   claude-forge documenting the design choice

**Next:** Test friction capture during real sessions, continue
blog post recreation

---

### 2026-02-25

**Codebase Audit Implementation**

Implemented a 5-step improvement plan from a full codebase audit (3 exploration
agents + 3 plan agents):

1. **Fixed broken link + strict build**
   - Removed broken `./ecs-autoscaling-patterns.md` reference in
     `ecs-autoscaling-deep-dive.md` (3B cross-reference leaked through sync)
   - Changed `handleHttpError: "warn"` → `"fail"` (broken links now fail build)

2. **Enabled 404 fallback page**
   - `fallback: undefined` → `'404.html'` in adapter-static config
   - `+error.svelte` already existed with terminal-themed ASCII art
   - Cloudflare Pages now serves it for unmatched routes

3. **Extracted `formatDate` utility**
   - Created `src/lib/utils/date.ts` with `formatDateShort()` + `formatDateLong()`
   - Replaced local `formatDate` in 5 files (was copy-pasted everywhere)
   - Both variants use `getLocale()` internally for Korean `YYYY.MM.DD` format

4. **Added `aria-label` to terminal hidden input**
   - `CommandLine.svelte` hidden input now has `aria-label="Terminal command input"`
   - Screen readers no longer announce unlabeled text field

5. **Fixed sync script word-boundary truncation**
   - `sync-from-3b.ts` now uses `lastIndexOf(' ', 157)` instead of hard cut at 157
   - Prevents SEO descriptions from cutting words mid-syllable

**Files Modified:**

| File                                                    | Change                                            |
| ------------------------------------------------------- | ------------------------------------------------- |
| `src/content/posts/en/aws/ecs-autoscaling-deep-dive.md` | Removed broken link                               |
| `svelte.config.js`                                      | `handleHttpError: "fail"`, `fallback: '404.html'` |
| `src/lib/utils/date.ts`                                 | Created shared date formatting utility            |
| `src/lib/components/BlogHome.svelte`                    | Import `formatDateShort`                          |
| `src/routes/posts/+page.svelte`                         | Import `formatDateShort`                          |
| `src/routes/ko/posts/+page.svelte`                      | Import `formatDateShort`                          |
| `src/routes/posts/[slug]/+page.svelte`                  | Import `formatDateLong`                           |
| `src/routes/ko/posts/[slug]/+page.svelte`               | Import `formatDateLong`                           |
| `src/lib/components/terminal/CommandLine.svelte`        | Added `aria-label`                                |
| `scripts/sync-from-3b.ts`                               | Word-boundary truncation                          |

**Next:** OG image for social sharing, ESLint + Prettier, GitHub Actions CI

---

### 2026-02-25 (Session 2)

**Blog Resync — 8 Enriched Posts**

Resynced 8 posts flagged `needs_resync: true` in 3B (enriched since last
publish). Updated both EN and KO versions. Fixed pre-existing build errors.

1. **Synced 8 enriched posts** (EN)
   - `npm run sync` pulled all 52 posts; 8 had enriched content from 3B
   - Fixed dangling description fragments in 6 EN frontmatter blocks
   - `needs_resync` flags cleared by sync script

2. **Updated 8 Korean translations**
   - 4 parallel agents translated new/changed sections
   - Posts: posttooluse-hooks, shared-personal-config, oauth2-implementation,
     redis-queue, agent-teams, ecr-ecs-deployment, vpc-networking, ecs-autoscaling

3. **Fixed pre-existing build errors**
   - Added `tsx`/`jsx` to Shiki language list (`svelte.config.js`)
   - Escaped bare `<` as `&lt;` in 4 posts (mdsvex parses as Svelte tags)
   - Wrapped `{PROJECT_ID}` in backticks (mdsvex evaluates as expression)
   - Replaced 3 broken relative `.md` links with "coming soon" text

**Stats:** 52 EN posts, 52 KO translations. Build passes.

**Next:** OG image for social sharing, ESLint + Prettier, GitHub Actions CI

---

### 2026-02-27

**Portfolio Link — Featured Project + Footer**

Added a link to Project Crucio (crucio.brandonwie.dev) in two locations:

1. **Featured Project section** on BlogHome
   - Between tagline and "Recent Posts"
   - Same hover pattern as post rows (`group hover:bg-terminal-bg-hover`)
   - i18n subtitle + description (EN + KO)

2. **Footer link**
   - "Portfolio" text link between LinkedIn and RSS
   - Same style as existing footer links

3. **i18n keys added**
   - `featured_project`, `portfolio_subtitle`, `portfolio_description`
   - Both `messages/en.json` and `messages/ko.json`

**Files Modified:**

| File                                 | Change                         |
| ------------------------------------ | ------------------------------ |
| `messages/en.json`                   | Added 3 i18n keys              |
| `messages/ko.json`                   | Added 3 Korean translations    |
| `src/lib/components/BlogHome.svelte` | Featured section + footer link |

**Next:** OG image for social sharing, ESLint + Prettier, GitHub Actions CI

---

### 2026-03-04

**Mass Publish — 52 to 94 EN Posts + Shiki Singleton Fix**

Unblocked 43 3B knowledge entries, scaled blog from 52 to 94 EN posts, and
fixed a critical Shiki async race condition:

1. **Resynced claude-code-multi-profile-hud**
   - Expanded EN post from raw 3B reference to narrative blog post
   - Delta-translated KO with 6 new difficulty paragraphs + HUD config section
   - Updated frontmatter dates and references

2. **Unblocked 43 posts in 3B**
   - 37 "needs-references": added official/authoritative URLs via 4 parallel
     research agents
   - 4 "needs-external-reference": added missing external references
   - 2 "needs-review": flipped publishable flags after quality check
   - All updated with `publishable: true`, `ready: true`

3. **Fixed Shiki singleton race condition** (critical)
   - Root cause: `svelte.config.js` cached resolved value, not the promise
   - Concurrent mdsvex calls all saw `undefined` → 880+ instances created
   - Fix: cache the promise (`_highlighterPromise`), not the resolved value
   - Result: 0 Shiki warnings, build time 8.5s

4. **Fixed build errors at 94 posts**
   - Bare `<` in prose: datasource-vs-repo, airflow-dag, amplitude-export
   - `{PROJECT_ID}` Svelte expression: wrapped in inline code
   - 4 relative `.md` links: converted to `/posts/slug` format
   - Fixed both blog AND 3B sources to prevent sync re-introduction

**Stats:** 94 EN posts, 52 KO posts. Build passes cleanly in 8.5s.

**Key Files Modified:**

| File                                                            | Change                          |
| --------------------------------------------------------------- | ------------------------------- |
| `svelte.config.js`                                              | Shiki promise caching singleton |
| `src/content/posts/en/` (94 files)                              | 42 new + content fixes          |
| `src/content/posts/en/general/claude-code-multi-profile-hud.md` | Expanded narrative              |
| `src/content/posts/ko/general/claude-code-multi-profile-hud.md` | Delta-translated                |

**Next:** KO translations for 42 new posts, sync script link transformation,
OG image, ESLint + Prettier, GitHub Actions CI

---

### 2026-03-04 (Session 2)

**Full EN/KO Parity — 42 Korean Translations**

Translated all 42 remaining EN posts to Korean using 3 parallel agent
teammates, achieving full EN/KO parity:

1. **Parallel translation (3 agents)**
   - translator-1: ai-ml(1), aws(7), backend(6) — 14 posts
   - translator-2: backend(6), devops(8) — 14 posts
   - translator-3: devops(4), general(2), google(4), icalendar(2),
     payments(1), security(1) — 14 posts
   - All followed 해요체 register, voice calibration, Toss.tech style

2. **New KO category directories created**
   - `ko/google/` (4 posts)
   - `ko/payments/` (1 post)

3. **Build verification**
   - 94 EN + 94 KO posts, 0 untranslated
   - Build passes in 9.78s with zero errors

**Stats:** 94 EN posts, 94 KO posts. Full parity. Build 9.78s.

**Commits:**

| Hash    | Description                                                       |
| ------- | ----------------------------------------------------------------- |
| c511e3f | feat(i18n): add KO translations for 42 posts, achieve full parity |

**Next:** Sync script link transformation, OG image, ESLint + Prettier,
GitHub Actions CI

---

### 2026-03-10

**Blog Resync — 8 Enriched Posts (Round 2)**

Resynced 8 posts flagged `needs_resync: true` in 3B (enriched since last
publish on 2026-03-03). Re-expanded EN narratives and delta-translated KO.

1. **Synced 94 posts** (EN)
   - `npm run sync` pulled all 94 posts; 8 had enriched content
   - `needs_resync` flags cleared by sync script

2. **Re-expanded 8 posts** (EN) — 4 parallel agents
   - `devops/claude-code-shared-personal-config` — +2 sections (settings
     consolidation, per-profile settings.json)
   - `general/recharts-dark-theme-customization` — full narrative expansion +
     v3 gotcha
   - `general/claude-code-multi-profile-hud` — +429 race condition, lock
     mechanism, Midnight Aurora theme
   - `google/google-meet-link-creation` — +Clearing Meet Links section
     (conferenceData = null, three-state semantics)
   - `backend/alembic-async-sqlalchemy` — +PostgreSQL enum DDL-only pitfall
   - `backend/redis-queue-patterns` — +Error Handling & DLQ Patterns section
   - `ai-ml/claude-code-agent-teams` — +TeamCreate deferred tool difficulty
   - `ai-ml/ai-code-review-patterns` — +2 new patterns (Intentional Design,
     YAGNI Suggestion)

3. **Delta-translated 8 Korean posts** — 4 parallel agents
   - Translated only new/changed sections, preserved existing translations
   - Updated `translation_date` and `source_updated` in all 8 KO frontmatters

4. **Fixed pre-existing build errors**
   - 4 broken cross-post `.md` links → `/posts/slug` URLs
   - Files: batch-processing-trade-offs, ecs-autoscaling-deep-dive (×2),
     infrastructure-hardening-checklist

**Stats:** 94 EN posts, 94 KO posts. Full parity. Build passes.

**Next:** Sync script link transformation, OG image, ESLint + Prettier,
GitHub Actions CI

---

### 2026-03-10 (Session 2)

**Reading Time & Share Link**

Added reading time display and "Copy link" button to all blog post detail pages:

1. **Remark plugin** (`src/lib/plugins/remark-reading-time.js`)
   - Extracts text from MDAST via `mdast-util-to-string`
   - Computes `Math.ceil(words / 200)` minutes, injected into `vFile.data.fm`
   - Auto-applied to all 188 posts at build time — no manual frontmatter needed

2. **UI changes** (EN + KO post detail pages)
   - Reading time shown after date: "5 min read" / "4분 읽기"
   - "Copy link" button with 2s "Copied!" feedback via `$page.url.href`
   - `flex-wrap` added for mobile responsiveness

3. **i18n** — 3 new keys: `reading_time`, `copy_link`, `copied`

4. **Documentation** — CLAUDE.md (repo structure, tech stack, frontmatter note),
   blog-publish SKILL.md (auto-computed note)

**Files Modified:**

| File                                      | Change                         |
| ----------------------------------------- | ------------------------------ |
| `src/lib/plugins/remark-reading-time.js`  | Created — remark plugin        |
| `svelte.config.js`                        | Registered plugin              |
| `package.json`                            | Added mdast-util-to-string     |
| `messages/en.json`                        | 3 i18n keys                    |
| `messages/ko.json`                        | 3 i18n keys                    |
| `src/routes/posts/[slug]/+page.ts`        | readingTime in PostModule type |
| `src/routes/ko/posts/[slug]/+page.ts`     | readingTime in PostModule type |
| `src/routes/posts/[slug]/+page.svelte`    | Reading time + copy link UI    |
| `src/routes/ko/posts/[slug]/+page.svelte` | Reading time + copy link UI    |
| `CLAUDE.md`                               | Plugin docs                    |

**Next:** Sync script link transformation, OG image, ESLint + Prettier,
GitHub Actions CI

---

### 2026-03-12

**Hash Guard Verification + Agent Teams Split-Pane Testing**

Verified the hash guard implementation and tested iTerm2 agent teams:

1. **Hash guard verification** — All 8 steps of the Hash Guard + Wrap-Time
   Detection plan confirmed already implemented in `sync-from-3b.ts`:
   `expanded` field, `source_content_hash`, `computeContentHash()`, absolute
   paths, `--check` mode, `--diff` mode, npm scripts, blog-publish skill
   integration.

2. **iTerm2 split-pane testing** — 5 rounds of testing agent teams with
   `teammateMode: "auto"` and `"tmux"`. Discovered `captureTeammateModeSnapshot()`
   reads settings once at session start (mid-session changes have no effect).
   Confirmed ITermBackend is broken (GitHub #24301) — never activates despite
   `it2` CLI being available.

3. **Configured `tmux -CC` workaround** — Set iTerm2 "Send text at start" to
   `tmux -CC a || tmux -CC\n`. Agent teams' `tmux split-window` works
   transparently through iTerm2 control mode.

4. **Corrected 2 knowledge entries** — Fixed incorrect ITermBackend claims in
   `claude-code-agent-teams.md` and `tmux-iterm2-control-mode.md`.

**No brandonwie.dev code changes** — all updates were to 3B knowledge and
settings.

**Next:** Blog resync (6 entries), OG image, ESLint + Prettier, GitHub Actions CI

---

### Session: 2026-03-10 — validate-pr-reviews taxonomy refinement (3B skill)

**Goal:** Split OPTIONAL classification into GOOD-TO-HAVE and CONTROVERSIAL

**Summary:** Refined validate-pr-reviews skill taxonomy. OPTIONAL was too vague
— it conflated priority decisions (clearly correct but minor) with correctness
decisions (uncertain/debatable). Split into GOOD-TO-HAVE (Fix/Skip/Defer) and
CONTROVERSIAL (discuss For/Against/Context/Confidence → re-classify). Updated
5 files across validate-pr-reviews and review-pr skills.

**Files changed (3B repo):**

| File                                          | Change                              |
| --------------------------------------------- | ----------------------------------- |
| `validate-pr-reviews/SKILL.md`                | v1.4.0→1.5.0, full taxonomy rewrite |
| `validate-pr-reviews/references/templates.md` | Discussion Log section, metrics     |
| `validate-pr-reviews/references/examples.md`  | 3 CONTROVERSIAL flow examples       |
| `review-pr/references/output-format.md`       | Severity mapping update             |
| `review-pr/SKILL.md`                          | Quick ref severity mapping          |

**Next:** Sync script link transformation, OG image, ESLint + Prettier,
GitHub Actions CI

---

### 2026-03-11

**Arch Calendar — Work Section + Terminal Commands**

Added Arch Calendar as the primary entry in a new "Work" section (replacing
"Featured Project") and updated terminal commands with accurate role/scale info:

1. **Blog "Work" section** (`BlogHome.svelte`)
   - Renamed "Featured Project" → "Work" (leerob.io-style)
   - Arch Calendar first (Lead Backend), Crucio second (Creator)
   - Each entry has role tag (subtle, 60% opacity)
   - Footer: two project links (Arch Calendar + Crucio)

2. **i18n** (`messages/en.json`, `messages/ko.json`)
   - `work_section`, `archcalendar_subtitle`, `archcalendar_description`,
     `archcalendar_role`, `crucio_role`

3. **Terminal `whoami` fixes** (`whoami.ts`)
   - Fixed typo: "Archi Calendar" → "Arch Calendar"
   - Role: "Co-Lead Backend" → "Lead Backend"
   - Scale: "6M+" → "10M+"
   - Career line simplified
   - Added `arch → archcalendar.com` link

4. **Terminal `open` command** (`open.ts`)
   - Added aliases: `archcalendar`, `arch`, `moba`
   - Updated help text and error fallback

5. **Terminal `help` command** (`help.ts`)
   - Updated `open` description and examples

**Files Modified:**

| File                                 | Change                              |
| ------------------------------------ | ----------------------------------- |
| `messages/en.json`                   | 5 new i18n keys, renamed 1          |
| `messages/ko.json`                   | 5 new i18n keys, renamed 1          |
| `src/lib/components/BlogHome.svelte` | Work section + footer links         |
| `src/lib/commands/open.ts`           | 3 new aliases + help text           |
| `src/lib/commands/whoami.ts`         | Typo fix, role/scale update, link   |
| `src/lib/commands/help.ts`           | Updated open description + examples |

**Commits:**

| Hash    | Description                                                   |
| ------- | ------------------------------------------------------------- |
| fe151e2 | feat: add Arch Calendar to Work section and terminal commands |

**Next:** Sort-by-updated, blog resync, OG image, ESLint + Prettier,
GitHub Actions CI

---

### 2026-03-13

**Sort-by-Updated + 79 Post Resync + Hash Mismatch Resolution**

Implemented sort-by-updated across all views and resynced 79 posts with latest
3B content. Resolved 2 hash-mismatch expanded posts.

1. **Sort by updated date** (Part 1 — completed in prior session)
   - `effectiveDate()` helper in `src/lib/utils/date.ts`
   - All 6 sort locations updated (4 page loaders + posts store + RSS)
   - "(updated)" badge on `/posts` and `/ko/posts` list pages
   - "↻" icon with tooltip on `BlogHome.svelte`
   - RSS `<pubDate>` uses effective date
   - `m.updated()` i18n key already existed in both locales

2. **79 posts synced from 3B** (Part 2)
   - `npm run sync` pulled latest content for all blog-ready entries
   - 79 non-expanded posts updated with current 3B source + hashes
   - All 94 EN posts `draft: false`, build passes

3. **2 hash-mismatch expanded posts resolved**
   - `general/claude-code-multi-profile-hud`:
     - Added 4 new difficulties (marketplace paths, statusline height,
       stale cache after upgrade, API failure cache overwrite)
     - Updated patch table to v0.0.9 (9 patches, down from 30 at v0.0.6)
     - Added "clear caches after patching" pitfall
     - Hash updated to `e7568f59...`
   - `ai-ml/claude-code-agent-teams`:
     - Added iTerm2 `ITermBackend` broken bug (#24301)
     - Updated setup to `teammateMode: "tmux"` with `tmux -CC` workaround
     - Updated limitations (replaced old #24292 config parsing bug)
     - Hash updated to `9ea3366f...`

4. **Hash guard report**: 15/15 expanded posts match (0 mismatches)

**Stats:** 94 EN posts, 94 KO posts. Build passes in 9.28s.

**Next:** Expand 5-8 high-value posts to narrative format (top candidates:
traefik-keycloak-forwardauth, ecr-ecs-deployment, vpc-networking, oauth2,
websocket-architecture). Then: OG image, ESLint + Prettier, GitHub Actions CI
