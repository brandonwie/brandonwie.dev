# brandonwie.dev - Progress

## Milestones

- [x] Project initialized with 3B integration
- [x] Core terminal functionality complete
- [x] First deployment to Cloudflare Pages
- [x] 8 posts published (EN + KO)
- [x] 52 posts published (EN + KO) with full blog narratives
- [x] Custom domain live

## Session Log

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
