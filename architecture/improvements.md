---
tags: [architecture, renewal, backlog, tech-debt, svelte-kit]
created: 2026-06-03
updated: 2026-06-03
status: in-progress
related:
  - ./structure.yaml
  - ./README.md
confidence: medium
---

# brandonwie.dev — Renewal Backlog

Improvement opportunities surfaced by orchestrated multi-agent analysis
(2026-06-03, commit `5e467d4`). Findings were deduped across five subsystem
analysts, then verified against the live tree. This is the **renewal work
queue** — not a commitment, a menu with honest trade-offs.

**Scoring**

- **Effort** — S (<2h) · M (half-day) · L (multi-day)
- **Risk** — chance the change breaks something or has hidden scope
- **Priority** — P0 correctness/security now · P1 high value · P2 maintainability · P3 polish

**Verification corrections** (claims dropped/adjusted before landing here):

- ❌ "Deno lockfile missing" — **false**, `deno.lock` present (3997 lines, v5). Dropped.
- 🔽 "mermaid/dagre bloat critical" — mermaid + `@xyflow/svelte` are **already lazy**
  (`await import` at `Mermaid.svelte:11`, `System3bGraph.svelte`), and the graph
  is route-split to `/system/3b`. Downgraded to a verify-only guard (PERF-2).

**Reviewer cross-check (2026-06-03).** An independent reviewer session's notes were merged: 7 findings added (`DEPS-1`, `ARCH-5/6`, `CONTENT-5/6/7`, `CI-4`), `DOC-1` + `SEC-1` expanded, and a **Product / strategic direction** section added. Every concrete claim was re-verified against the live tree.

---

## Summary

_The table lists the **41 active engineering findings** (P0–P3); each has a matching `###` detail section below — table ID set ≡ `###` finding-heading set. `PROD-1`/`PROD-2` (product decisions) and the 3 IDs superseded by [ADR-0001](./decisions/0001-terminal-vs-command-palette.md) are in their own sections, **excluded** from the 41 count._

| ID        | Title                                            | Cat        | Effort | Risk | Priority |
| --------- | ------------------------------------------------ | ---------- | ------ | ---- | -------- |
| SEC-1     | Hardcoded Umami API key → env var                | security   | S      | low  | P1       |
| SEC-2     | `{@html}`/`innerHTML` sink audit (4 sites)       | security   | S–M    | low  | P1       |
| CONTENT-1 | Draft guard in `[slug]` loaders                  | bug        | S      | low  | P1       |
| I18N-1    | Verify + fix KO SSR locale                       | i18n/seo   | M      | med  | P1       |
| SEO-1     | Post 404 via `error(404)` not `throw Error`      | seo/dx     | S      | low  | P1       |
| SEO-2     | `entries()` for guaranteed prerender             | arch       | S      | low  | P1       |
| TEST-1    | Add Vitest (plugins, utils, scripts)             | testing    | L      | low  | P1       |
| CI-1      | OG image automation + coverage gate (45 missing) | ci         | M      | med  | P1       |
| A11Y-1    | `<html lang>` per locale                         | a11y/seo   | S      | low  | P1       |
| A11Y-2    | FuzzyFinder focus trap                           | a11y       | S      | low  | P1       |
| A11Y-4    | CategorySidebar `tablist`→`nav`/`aria-pressed`   | a11y       | S      | low  | P1       |
| A11Y-5    | ViewToggle `aria-label` i18n                     | a11y/i18n  | S      | low  | P1       |
| SEO-3     | Canonical + hreflang in post `<head>`            | seo        | M      | low  | P1       |
| ARCH-1    | Hydrate posts store site-wide                    | arch       | M      | med  | P1       |
| DEPS-1    | `pnpm audit`: 2 high + 15 moderate advisories    | deps       | M      | med  | P1       |
| DX-1      | Consolidate dual CSS variable system             | dx         | M      | low  | P2       |
| ARCH-2    | Extract shared content loader module             | arch/dx    | S      | low  | P2       |
| DX-2      | Command metadata in registry (kill `help` drift) | dx         | M      | low  | P2       |
| ARCH-4    | `open` internal nav via `goto`                   | arch       | S      | low  | P2       |
| ARCH-5    | Split domain types from UI stores (`posts.ts`)   | arch       | M      | med  | P2       |
| ARCH-6    | Extract shared sync/hash util (lockstep dup)     | arch       | S      | low  | P2       |
| DX-3      | Remove empty `ui/` or adopt shadcn               | dx         | S      | low  | P2       |
| DX-4      | `engines` field in package.json                  | dx         | S      | low  | P2       |
| CONTENT-2 | Reading time excludes code blocks                | content    | S      | low  | P2       |
| CI-2      | Cloudflare deploy as IaC (`wrangler.toml`)       | ci         | M      | low  | P2       |
| CI-3      | `sync:check` + snapshot freshness in CI/hook     | ci         | S      | low  | P2       |
| CONTENT-3 | Translation staleness detection                  | content    | S      | low  | P2       |
| CONTENT-5 | Runtime frontmatter schema/validation            | content/dx | M      | low  | P2       |
| CONTENT-6 | 3 ai-ml posts missing `source_content_hash`      | content    | S      | low  | P2       |
| DX-5      | Document mdsvex title/desc contract              | arch       | S      | low  | P2       |
| CONTENT-4 | `cleanBody` paragraph-aware stripping            | content    | S      | med  | P3       |
| PERF-1    | ToC IntersectionObserver nav race                | perf       | S      | low  | P3       |
| UX-2      | `copyLink` clipboard fallback                    | ux         | S      | low  | P3       |
| DX-6      | Remove `@ts-nocheck` from vite.config            | dx         | S      | low  | P3       |
| DX-7      | Split pre-push build for content-only commits    | dx         | S      | low  | P3       |
| UX-3      | FuzzyFinder default cap + empty state            | ux         | S      | low  | P3       |
| SEO-4     | Sitemap emits `/ko` for untranslated posts       | seo        | S      | low  | P3       |
| PERF-2    | Verify dagre stays route-split                   | perf       | S      | low  | P3       |
| CONTENT-7 | translate-create message drift                   | content    | S      | low  | P3       |
| CI-4      | `deno.json` sync missing `--allow-env`           | ci/dx      | S      | low  | P3       |
| DOC-1     | Reconcile CLAUDE.md + AGENTS.md with reality     | docs       | S      | low  | P1       |

---

## Superseded by ADR-0001 (Option B — retire terminal)

[ADR-0001](./decisions/0001-terminal-vs-command-palette.md) retires terminal mode, so these terminal-only fixes are moot — kept for rationale, **excluded** from the active count:

- **A11Y-3 · Terminal output `aria-live`** — terminal removed.
- **UX-1 · Terminal path tab-completion** — terminal removed.
- **ARCH-3 · Pure-function command model** — terminal commands removed/transformed.

**Replacement path:** the Cmd+P palette (`FuzzyFinder`) is extracted to a global mount and promoted to primary (ADR-0001 Phase 0); `A11Y-2` (palette focus trap) + `UX-3` stay active. **Security guard:** the `SEC-2` `Output.svelte` branch is _not_ resolved until the terminal code is deleted (Phase 2) — `SEC-2` stays open.

---

## P1 — High value (do first)

### SEC-1 · Hardcoded Umami API key → env var

- **Problem:** `src/lib/components/StatsPage.svelte:20` — `const API_KEY = 'api_…'` committed to source (used as `x-umami-api-key` header, line 81). No `PUBLIC_` env usage anywhere in `src/`.
- **Proposal:** Move to `$env/static/public` (`PUBLIC_UMAMI_API_KEY`, `PUBLIC_UMAMI_WEBSITE_ID`); inject via Cloudflare Pages env vars.
- **Pros:** No secret in git history going forward; rotatable without a commit; standard SvelteKit pattern.
- **Cons:** Key is client-exposed regardless (read-only public key); one-time Cloudflare config. Rotating the _current_ key requires also scrubbing git history if you care about the old value. A `PUBLIC_` var still ships to the browser — _truly_ hiding it needs a server boundary (CF Pages Functions), which conflicts with the pure-SSG model.
- **Effort:** S · **Risk:** low

### SEC-2 · `{@html}` / `innerHTML` sink audit

- **Problem:** Three Svelte `{@html}` sinks plus one `innerHTML` sink:
  - `Output.svelte:129` — `{@html line.content}` on the `type:'html'` branch (currently **dead** but live; removed with the file in [ADR-0001](./decisions/0001-terminal-vs-command-palette.md) Phase 2 — **not** resolved before then, so `SEC-2` stays open).
  - `SearchPage.svelte:169` — `{@html result.excerpt}` from Pagefind (typed `any`).
  - `PostDetail.svelte:135` — `{@html}` for the JSON-LD `<script>` (author-controlled, `</script>` escaped — lowest risk).
  - `Mermaid.svelte:74` — `container.innerHTML = svg` with `securityLevel:'loose'` (`Mermaid.svelte:53`; a separate sink, not `{@html}`).
- **Proposal:** Delete the dead `html` branch + type from the `OutputLine` union; type the Pagefind result and/or `DOMPurify.sanitize` the excerpt; keep the PostDetail JSON-LD as-is (document the escape); set Mermaid `securityLevel:'strict'` (default, fine for these diagrams) after auditing for HTML-in-labels.
- **Pros:** Closes the XSS class before any future command/content activates it; defense-in-depth.
- **Cons:** Removing the `html` type is a tiny breaking change to the output API; `strict` mermaid breaks any diagram using HTML labels (audit first); DOMPurify adds ~7–20kB if tree-shaking misses.
- **Effort:** S–M · **Risk:** low

### CONTENT-1 · Draft guard in `[slug]` loaders

- **Problem:** `posts/[slug]/+page.ts` and `ko/posts/[slug]/+page.ts` resolve **any** matching slug via lazy glob — `draft:true` posts are reachable by direct URL even though list views filter them.
- **Proposal:** `if (post.metadata.draft) throw error(404, …)` in both detail loaders.
- **Pros:** No accidental draft exposure; list/detail behavior consistent.
- **Cons:** None significant (drafts aren't linked, so not prerendered under `strict:true`).
- **Effort:** S · **Risk:** low

### I18N-1 · Verify + fix KO SSR locale

- **Problem:** `ko/+layout.svelte:14` sets locale in `onMount` (client). If prerendered KO HTML carries EN `m.*()` strings, that hurts SEO + first paint. **But** `vite.config.ts` Paraglide `strategy:['url',…]` may already resolve locale per-URL at prerender — so the `onMount` call could be redundant rather than the bug.
- **Proposal:** **Verify first** — `curl` a built `/ko/posts/*` page and grep for Korean UI strings. If EN: move locale resolution to a server `+layout.ts`/hook. If KO: delete the redundant `onMount` call and document.
- **Pros:** Correct language in server HTML for crawlers + no flash; or removes dead code.
- **Cons:** Server boundary can complicate the pure-SSG model; needs Paraglide-v2-specific API knowledge. _Confidence: medium — two agents flagged it, but the url strategy muddies it._
- **Effort:** M · **Risk:** med

### SEO-1 · Post 404 via `error(404)`

- **Problem:** `posts/[slug]/+page.ts:45` and `ko/posts/[slug]/+page.ts:72` use `throw new Error(...)` → error boundary sees a generic 500, not 404.
- **Proposal:** `import { error } from '@sveltejs/kit'; throw error(404, …)`.
- **Pros:** Correct HTTP status for crawlers; `+error.svelte` renders the right state.
- **Cons:** None (2-line change).
- **Effort:** S · **Risk:** low

### SEO-2 · `entries()` for guaranteed prerender

- **Problem:** No `entries()` anywhere — `adapter-static strict:true` discovers `[slug]` pages purely by crawling links. An unlinked post is silently never built.
- **Proposal:** Export `entries()` from both `[slug]/+page.ts` returning all non-draft slugs from the glob.
- **Pros:** Every post prerendered regardless of navigation; explicit + testable enumeration.
- **Cons:** ~10 lines per file; tiny build overhead.
- **Effort:** S · **Risk:** low

### TEST-1 · Add Vitest

- **Problem:** Zero tests, no framework. CI only lints + type-checks.
- **Proposal:** Vitest (Vite-native) for the 3 remark plugins (fixture `.md`), `fuzzy.ts`, `filesystem.ts` (`resolvePath` incl. the `..` bug), `validate-dates.ts`, `sync-from-3b` `cleanBody`.
- **Pros:** Catches plugin/pipeline regressions at commit; makes CI meaningful; unblocks `@testing-library/svelte` later.
- **Cons:** Initial suite is real effort; remark fixtures take setup.
- **Effort:** L · **Risk:** low

### CI-1 · OG image automation + coverage gate

- **Problem:** `static/og/` has **95 PNGs (94 post-specific + 1 `default`) for 139 EN posts → 45 posts lack a slug OG image** — `og:generate` is manual and outside `pnpm build`; new posts ship without OG images, no failure.
- **Proposal:** Either `"prebuild": "tsx scripts/generate-og-images.ts"` (auto, skips existing) or a CI check asserting `static/og/{slug}.png` exists per EN post.
- **Pros:** No silent missing-OG deploys; removes a manual content step.
- **Cons:** +5–30s/new post in build (Satori+resvg); CI needs the font asset available.
- **Effort:** M · **Risk:** med

### A11Y-1 · `<html lang>` per locale

- **Problem:** `app.html:2` hardcodes `lang="en"`; `/ko/*` served as English to assistive tech + search.
- **Proposal:** Set `lang` per locale via `hooks.server.ts` `transformPageChunk` (`%lang%` placeholder) or layout.
- **Pros:** WCAG 3.1.1; correct language classification.
- **Cons:** `app.html` has no route context — needs a hook.
- **Effort:** S · **Risk:** low

### A11Y-2 · FuzzyFinder focus trap

- **Problem:** `FuzzyFinder.svelte` has `role="dialog"`/`aria-modal` but no Tab trap; `CommandLine` blur-refocus (10ms) can also steal focus.
- **Proposal:** Trap Tab/Shift+Tab within the modal; suspend CommandLine refocus while open.
- **Pros:** Keyboard + SR users can navigate results (WCAG 2.1.2).
- **Cons:** ~20 lines of keyboard logic.
- **Effort:** S · **Risk:** low

### A11Y-4 · CategorySidebar role semantics

- **Problem:** `CategorySidebar.svelte:54–83` mobile uses `role="tablist"`/`role="tab"` but there are no tabpanels — it filters in place.
- **Proposal:** Mobile → `<nav aria-label>` + buttons with `aria-pressed` (or `aria-current`).
- **Pros:** Correct semantics; no visual change.
- **Cons:** None.
- **Effort:** S · **Risk:** low

### A11Y-5 · ViewToggle `aria-label` i18n

- **Problem:** `ViewToggle.svelte:8` hardcodes English `aria-label`; KO users get English label.
- **Proposal:** `m.switch_to_terminal()` / `m.switch_to_blog()` keys in both message files.
- **Pros:** Full KO SR support; consistent with i18n approach.
- **Cons:** 2 new keys.
- **Effort:** S · **Risk:** low

### SEO-3 · Canonical + hreflang in post `<head>`

- **Problem:** No `<link rel="canonical">` in post pages; on KO fallback the same content lives at `/posts/{slug}` and `/ko/posts/{slug}` with no canonical signal (hreflang only in sitemap).
- **Proposal:** In `PostDetail.svelte`, emit canonical (EN for fallback, self for real KO) + paired hreflang `<link>`s.
- **Pros:** Prevents duplicate-content ambiguity; Google's recommended pattern.
- **Cons:** Touches the shared component; augments (not replaces) sitemap hreflang.
- **Effort:** M · **Risk:** low

### ARCH-1 · Hydrate posts store site-wide

- **Problem:** `posts` store is set only in home `onMount` (`+page.svelte:13`). Deep-linking to `/posts/*` leaves it empty → terminal `grep`/fuzzy nonfunctional until home is visited.
- **Proposal:** Populate in root `+layout.ts` `load()` and pass through `data`; or guard terminal commands on empty store.
- **Pros:** Removes the deep-link failure mode; unifies data access.
- **Cons:** Layout-level glob adds a little weight to non-home routes.
- **Effort:** M · **Risk:** med

### DOC-1 · Reconcile CLAUDE.md + AGENTS.md with reality

- **Problem:** Project `CLAUDE.md` drifted hard (see `structure.yaml › known_drift`): post counts, whole subsystems, plugins, toolchain all stale. Also `AGENTS.md` (Codex SoT) still calls the repo "Next.js + content/MDX pipeline" (lines 14, 22) — wrong framework entirely.
- **Proposal:** Update CLAUDE.md from `structure.yaml`; add a "keep in sync with architecture/" note.
- **Pros:** New contributors/agents get accurate context; less misdirection.
- **Cons:** CLAUDE.md is a 3B symlink — edit the SoT at `3b/.claude/project-claude/brandonwie.dev.md`, not the target.
- **Effort:** S · **Risk:** low

### DEPS-1 · Dependency audit + scheduled renewal

- **Problem:** Reviewer-reported `pnpm audit --prod` (2026-06-03): **2 high + 15 moderate** advisories. Fast-moving stack (Svelte 5, Vite 8, Tailwind 4, Paraglide, Mermaid, Pagefind).
- **Proposal:** Triage the 2 high now; add a recurring `pnpm audit` (CI or cron) + a dependency-renewal cadence.
- **Pros:** Avoids security/compat backlog; isolates framework/plugin regressions early.
- **Cons:** Frequent migration churn on a personal-site repo.
- **Effort:** M · **Risk:** med — _reviewer-reported; re-run `pnpm audit` to confirm current counts._

---

## P2 — Maintainability / DX

### DX-1 · Consolidate dual CSS variable system

- **Problem:** Palette defined as `@theme --color-terminal-*` tokens **and** `:root` bare vars (`app.css:54–71`) **and** hardcoded in `System3bFlow/Node` + `Mermaid` scoped styles — 4–5 sync points per color.
- **Proposal:** `@theme` as the only source; reference `var(--color-terminal-*)` in scoped styles; drop the `:root` block.
- **Pros / Cons:** Single source of truth · scoped styles need the prefixed var names; verify Tailwind v4 exposes `@theme` as standard CSS vars (it does). **Effort:** M · **Risk:** low

### ARCH-2 · Extract shared content loader

- **Problem:** The `import.meta.glob` + `path.split('/').pop().replace('.md','')` pattern is copy-pasted in 5 `+page.ts` files.
- **Proposal:** `src/lib/content/loader.ts` exporting resolved EN/KO maps + `resolve{En,Ko}Post(slug)`. (Globs must stay literal strings inside the module — Vite static-analysis constraint.)
- **Pros / Cons:** One change-point; ends slug-extraction dup · module must hardcode both glob roots. **Effort:** S · **Risk:** low

### DX-2 · Command metadata in registry

- **Problem:** `help.ts` keeps a hand-maintained `commandHelp` dict separate from the registry → `ll`, `cls`, `about`, `man` are registered but missing from help; drift is silent.
- **Proposal:** `registerCommand(name, handler, meta?)` storing `{usage, description, examples}`; `help`/`man` read it.
- **Pros / Cons:** Single source of truth; impossible to ship undocumented commands · touches 18 call sites (meta optional → back-compat). **Effort:** M · **Risk:** low

### ARCH-4 · `open` internal nav via `goto`

- **Problem:** `open.ts:67–68` uses `window.location.href` for internal paths → full reload, bypasses View Transitions/client routing.
- **Proposal:** Add `navigateTo(path)` to context (`goto`); use for `/`-paths, `window.open` for external.
- **Pros / Cons:** Soft nav + transitions; no `window` in handlers · one more context field. **Effort:** S · **Risk:** low

### DX-3 · Remove empty `ui/` or adopt shadcn

- **Problem:** `src/lib/components/ui/` is an **empty** dir (shadcn-svelte scaffold), no files, no imports — and CLAUDE.md implies shadcn is in use.
- **Proposal:** Delete it, or actually install shadcn-svelte primitives if the renewal wants them.
- **Pros / Cons:** Removes dead scaffold + doc confusion · trivial. **Effort:** S · **Risk:** low

### DX-4 · `engines` field

- **Problem:** No `engines.node`; only `.node-version` (24) pins it — invisible to most installers.
- **Proposal:** `"engines": { "node": ">=24", "pnpm": ">=10.32.1" }`.
- **Pros / Cons:** Fail-fast on wrong runtime; self-documenting · none. **Effort:** S · **Risk:** low

### CONTENT-2 · Reading time excludes code blocks

- **Problem:** `remark-reading-time.js:9–11` `toString(tree)` counts code blocks → code-heavy posts over-estimate by 1+ min.
- **Proposal:** Visit prose nodes only (skip `code`/`inlineCode`).
- **Pros / Cons:** More accurate · minor under-count where narrative is interleaved; touches a tested plugin. **Effort:** S · **Risk:** low

### CI-2 · Cloudflare deploy as IaC

- **Problem:** No `wrangler.toml`, no deploy workflow — all config lives in the CF dashboard; drift is undetectable from the repo.
- **Proposal:** Commit `wrangler.toml` (build cmd, output `build/`) and/or a `wrangler pages deploy` workflow.
- **Pros / Cons:** IaC, PR previews, explicit Node version · needs a CF API token secret. **Effort:** M · **Risk:** low

### CI-3 · `sync:check` + snapshot freshness in CI/hook

- **Problem:** `sync:check` (hash guard on `expanded` posts) runs in no hook/CI; `snapshot:3b:check` validates schema not freshness — stale `system-snapshot.json` passes.
- **Proposal:** Add `sync:check` to pre-push or CI; document a snapshot-refresh step.
- **Pros / Cons:** Catches upstream 3B drift on protected posts · pre-push latency (mitigated — only `expanded` posts hashed). **Effort:** S · **Risk:** low

### CONTENT-3 · Translation staleness detection

- **Problem:** `translation-status.ts` compares slug presence only → reports 100% even when a KO translation predates the EN post's `updated`. Stale translations are invisible.
- **Proposal:** Compare KO `source_updated` vs EN `updated`; flag `source_updated < en.updated` as stale.
- **Pros / Cons:** Surfaces drift; actionable · must read both frontmatters (~50 LOC). **Effort:** S · **Risk:** low

### DX-5 · Document mdsvex title/desc contract

- **Problem:** No mdsvex `layout` → `PostDetail` renders `meta.title`/`description`, and `sync-from-3b.cleanBody` strips the H1 + first paragraph to avoid duplication. Implicit, unenforced contract.
- **Proposal:** Comment both sides; or add a post-sync validation that synced `.md` doesn't start with an H1. (Full mdsvex-layout migration is the clean fix — larger.)
- **Pros / Cons:** Stops future H1-duplication regressions · doc/validation is a band-aid vs. real layout migration (L). **Effort:** S · **Risk:** low

### ARCH-5 · Split domain types from UI stores

- **Problem:** `src/lib/stores/posts.ts` holds both the post **domain types** (`PostMetadata`, `Post`) and the **Svelte UI stores** (`posts`, derived). Terminal, filesystem, fuzzy, and routes all depend on it, so the module is both domain model and UI state. No `src/lib/types` or `src/lib/server` exists.
- **Proposal:** Extract types to `src/lib/types/posts.ts` (or `src/lib/content/posts.ts`); keep stores thin.
- **Pros:** Clarifies pure domain/content helpers vs UI state; easier to review terminal/route/search deps.
- **Cons:** Import churn across many modules; keep mdsvex metadata types compatible.
- **Effort:** M · **Risk:** med

### ARCH-6 · Extract shared sync/hash util

- **Problem:** `scripts/compute-content-hash.ts` mirrors the clean-body + hashing logic of `scripts/sync-from-3b.ts` and self-warns it must change in lockstep — manual-drift hazard.
- **Proposal:** Extract a shared Deno module both scripts import.
- **Pros:** Removes lockstep drift; hash/resync behavior becomes testable.
- **Cons:** Shared module must stay compatible with existing Deno task commands + permissions.
- **Effort:** S · **Risk:** low

### CONTENT-5 · Runtime frontmatter schema/validation

- **Problem:** `src/app.d.ts:17` declares markdown `metadata` as `Record<string, unknown>`; route loaders cast it to `PostMetadata`. No single runtime schema for title/date/updated/category/tags/draft/headings/sync fields — clean today, unguarded tomorrow.
- **Proposal:** One shared validator (zod/valibot or dependency-free) used by sync scripts + route loaders; fail fast on bad frontmatter.
- **Pros:** Catches bad sync/template output before render; one shared contract for scripts + routes.
- **Cons:** Decide where validation lives (Node tooling vs Deno scripts vs SvelteKit vs shared module); upkeep as fields evolve.
- **Effort:** M · **Risk:** low

### CONTENT-6 · Posts missing `source_content_hash`

- **Problem:** Exactly 3 EN posts lack `source_content_hash` (`ai-ml/karpathy-llm-knowledge-bases`, `ai-ml/next-intelligence-explosion-social`, `ai-ml/six-papers-zero-applied`) — invisible to `sync:check` drift detection.
- **Proposal:** Triage against 3B source; either add hash metadata or mark them explicitly manual/legacy.
- **Pros:** Makes `sync:check` coverage unambiguous; prevents silent 3B↔published drift.
- **Cons:** Legacy posts need triage against source material.
- **Effort:** S · **Risk:** low

---

## P3 — Polish

### CONTENT-4 · `cleanBody` paragraph-aware stripping

- **Problem / fix:** `sync-from-3b.ts:253–307` strips one _line_ as the description; multi-line intro paragraphs leave orphan lines at post top. Make it paragraph-aware.
- **Effort:** S · **Risk:** med — could change body output; hash guard alerts on non-expanded posts.

### PERF-1 · ToC IntersectionObserver nav race

- **Problem / fix:** `TableOfContents.svelte:16–37` `$effect` may `getElementById` before the DOM reflects new headings on SPA nav. `await tick()` / `requestAnimationFrame` before observing.
- **Effort:** S · **Risk:** low

### UX-2 · `copyLink` clipboard fallback

- **Problem / fix:** `PostDetail.svelte:52–55` `navigator.clipboard` has no try/catch; fails silently on HTTP/denied permission. Add `execCommand` fallback + error state.
- **Effort:** S · **Risk:** low

### DX-6 · Remove `@ts-nocheck` from vite.config

- **Problem / fix:** `vite.config.ts:1` silences the whole file (Deno dual-typedef workaround). Retest under Deno 2.x `nodeModulesDir:auto`; narrow to a targeted ignore or remove.
- **Effort:** S · **Risk:** low

### DX-7 · Split pre-push build for content-only commits

- **Problem / fix:** full `build` (30–60s) + `handleHttpError:'fail'` runs even on content-only commits. Run `build` only when `src/` changed (keep build before any `src/` push).
- **Effort:** S · **Risk:** low

### UX-3 · FuzzyFinder default cap + empty state

- **Problem / fix:** `FuzzyFinder.svelte:109` shows all posts on open; cap to ~15 recent + add an empty-state suggestion. The unused `markdown` output type also renders as plain text inside a prose wrapper — wire it or remove it.
- **Effort:** S · **Risk:** low

### PERF-2 · Verify dagre stays route-split

- **Problem / fix:** `@dagrejs/dagre` is used by `utils/system3b-graph.ts` + `System3bGraph.svelte`; confirm it never enters a site-wide bundle (it shouldn't — SvelteKit route-splits `/system/3b`). Verify only.
- **Effort:** S · **Risk:** low

### SEO-4 · Sitemap emits `/ko` for untranslated posts

- **Problem / fix:** `sitemap.xml:90–101` emits `/ko/posts/{slug}` for every EN post and never uses its own `hasKorean` flag. Currently moot (100% KO coverage) but will matter if coverage drops.
- **Effort:** S · **Risk:** low

### CONTENT-7 · translation-create message drift

- **Problem / fix:** `scripts/translation-create.ts:99` comments that it avoids HTML instruction comments (they break mdsvex), yet its console output (`:118`) tells the user to "Remove the instruction comment block." Align the message.
- **Effort:** S · **Risk:** low

### CI-4 · `deno.json` sync task missing `--allow-env`

- **Problem / fix:** `deno.json:7` `sync` lacks the `--allow-env` that `package.json:15` `sync` has, though `sync-from-3b.ts` reads env; `deno task sync` and `pnpm sync` diverge.
- **Effort:** S · **Risk:** low

---

## Product / strategic direction

_Reviewer-surfaced — user-preference + product-strategy signals, not repo defects. Decide these **before** investing in terminal-mode polish that may be cut._

**PROD-1 · Visual mood / palette**

- **Question:** The terminal-dark palette (`app.css` `--color-terminal-*`, site permanently dark) may read too dark/sad for a personal site.
- **Direction:** Evaluate a brighter, calmer palette while keeping enough technical identity.
- **Pros:** More inviting; better long-form reading + portfolio browsing.
- **Cons:** A lighter palette may weaken the terminal/Claude-Code brand; needs visual QA across markdown, code blocks, graph pages, search.
- **Effort:** M–L · **Risk:** med (brand) · **Priority:** decide first

**PROD-2 · Terminal view scope vs Cmd+P**

- **Question:** Is the full terminal view worth maintaining, or is it novelty > utility?
- **Direction:** Consider promoting the Cmd+P / control panel (FuzzyFinder) to the primary power-user surface; reduce or retire full terminal mode.
- **Pros:** Keeps the command/nav affordance without a full alternate UI; cuts state/command/a11y upkeep; fits browsing better than "the whole site is a shell."
- **Cons:** Loses a distinctive brand interaction if cut too hard; must decide which terminal commands become palette actions, links, or are deleted.
- **Effort:** L · **Risk:** med · **Priority:** decide first — gates A11Y-2/3, UX-1/3, ARCH-3/4
- **ADR:** [`decisions/0001-terminal-vs-command-palette`](./decisions/0001-terminal-vs-command-palette.md) — full options, consequences, and recommendation (retire terminal → promote palette).

---

## Renewal themes (how to sequence)

1. **Trust & correctness pass** (SEC-1/2, CONTENT-1, SEO-1/2, I18N-1) — small, high-confidence, ships safety + SEO wins fast.
2. **Accessibility sweep** (A11Y-1…5) — all S, all independent; batch into one PR.
3. **Foundations for change** (TEST-1, DOC-1, ARCH-2) — tests + accurate docs + dedup make every later change cheaper and safer.
4. **Pipeline hardening** (CI-1/2/3, CONTENT-3) — automate the manual content/deploy steps that currently fail silently.
5. **Maintainability** (DX-1…5, ARCH-1/3/4, UX-1) — pay down structural debt once tests exist to catch regressions.
6. **Polish** (P3) — opportunistic.

> **Product-direction track (parallel).** `PROD-1`/`PROD-2` are strategy calls for you, not sequenced engineering work. Decide `PROD-2` (terminal vs Cmd+P) **before** spending on terminal-mode polish (`A11Y-2`, `A11Y-3`, `UX-1`, `UX-3`, `ARCH-3/4`) — that effort is wasted if terminal mode is cut.
