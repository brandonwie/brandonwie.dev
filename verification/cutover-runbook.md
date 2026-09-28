# Cutover runbook — Slice 6

The executed-production-promotion runbook for `plan.md` Slice 6. Mechanism
chosen 2026-09-20: **control-plane output-directory flip** (option 1), not a
root-script change. This document is the git-visible record of that config
drift — the flip itself is a dashboard change git cannot see.

## Current state (2026-09-29) — read this first

- **Monitoring window closed** 2026-09-29 by Brandon: no rollback in 9 days,
  15 successful Next production deploys since the flip (including the
  Phosphor Fade redesign), and the post-deploy probe passing 70/70 on the live
  domain and the `pages.dev` alias.
- **SvelteKit is retired** (branch `refactor/retire-svelte`). Root
  `pnpm run build` now runs only `build:next`, which emits `next/build` plus
  its Pagefind index. There is no root `build/` tree any more.
- **Pages build configuration is unchanged by the retirement:** build command
  `pnpm run build`, output directory `next/build`. Both values were verified
  live on 2026-09-20; confirm them in the dashboard before relying on them.
- **The two-step rollback below is void.** It restores a Svelte deployment
  and points `destination_dir` at a `build/` tree that `main` no longer
  produces. To roll back now, use the dashboard "Roll back" to an earlier
  **Next** deployment for an immediate fix, then `git revert` the offending
  commit on `main` so the next push does not redeploy it.
- The sections below are the historical cutover record; they are kept as
  evidence, not as instructions.

## Why this mechanism

- `pnpm run build` already emits both trees: `build:svelte` → `build/`,
  `build:next` → `next/build` (`output: 'export'`, `distDir: 'build'`,
  Pagefind-indexed). The flip points Pages at an output today's `main` build
  already produces. Zero code change.
- The alternative — making the root script emit Next into `build/` — collapses
  `build/` and `next/build/` into one tree, which voids
  `migration:verify:svelte` as a parity gate while Svelte sources still exist.
  That codification is **deferred to the commit that removes the Svelte
  sources** (`plan.md` slice-6 settlement), and only that commit.
- Rollback is stronger: the R1→R2→R1 rehearsal proved the REST rollback
  endpoint against this exact project shape; reverting a build-config value is
  a smaller blast radius than reverting a merged build-script commit plus a
  rebuild.

## Live inputs (verified 2026-09-20, all times UTC)

| Input              | Value                                                              |
| ------------------ | ------------------------------------------------------------------ |
| Project            | `brandonwie-dev` (GitHub-sourced `brandonwie/brandonwie.dev`)      |
| Production branch  | `main`                                                             |
| Build command      | `pnpm run build`                                                   |
| Output dir (old)   | `build`                                                            |
| Output dir (new)   | `next/build`                                                       |
| Domains            | `brandonwie.dev`, `www.brandonwie.dev`, `brandonwie-dev.pages.dev` |
| G4 rollback target | `a385230f-f57e-432e-b743-6f51ea1f9e44` @ `1a83ebd`                 |

Pre-flip production state at authoring: canonical deployment
`1b8e71f3-e8af-4984-965c-6025d6a409a8` @ `8f176dc` — the runbook commit itself
redeployed production (docs-only, still serving the Svelte `build/` tree),
displacing `5ec46cc7-55c2-484d-8f0b-0c3749476d87` @ `0d80b01` within a minute of
it being recorded here. That is the operational fact: **this project redeploys
production on every push to `main`, docs-only included.** After the flip, any
later `main` push serves Next — treat the flip as _arming_, not a one-shot
event, and keep `main` quiet until the post-deploy probe passes. Whichever
deployment is canonical at flip time becomes the recorded rollback target
below.

## Preconditions — re-verify at flip time, not from memory

- [ ] `git rev-parse main` equals the commit whose deployment is live; tree
      clean; `HEAD == origin/main`.
- [ ] Current canonical production deployment ID read live (dashboard or API)
      and written into the execution record below **before** the flip.
- [ ] Cloudflare token `249ae685…` revoked in the dashboard — outstanding
      since the AC8 rehearsal; cutover day is the wrong day to discover it is
      live.
- [ ] Executor: Brandon's hand on the dashboard. `wrangler` is logged out and
      write scopes were revoked — do not re-issue write credentials to
      automate the flip; the manual step is the control.

## Cutover steps

1. Record pre-flip canonical deployment ID + commit in the execution record.
2. Dashboard: Pages → `brandonwie-dev` → Settings → Build configuration → set
   `destination_dir` `build` → `next/build`. Save.
3. Trigger a new production deploy of `main` (dashboard retry/redeploy — the
   config change applies to **new** deployments only; the flip alone moves no
   traffic). Record the new deployment ID. **The cutover is the moment that
   deployment goes live**, not the moment the setting is saved.
4. Run the post-deploy probe (below) against `https://brandonwie.dev`.
5. Enter the monitoring window (below). Roll back on agreed threshold breach.

## Post-deploy probe

Assert on the live domain immediately after the new deployment:

- [ ] `200` on `/`, `/posts/<known slug>`, `/ko`, `/ko/posts/<slug>`, `/feed`,
      `/search`, `/system/3b`; `/404` returns `404` with the not-found page.
- [ ] `lang="en"` on EN routes, `lang="ko"` on KO routes.
- [ ] `<link rel="canonical">` points at `https://brandonwie.dev` on sampled
      pages.
- [ ] `x-robots-tag: noindex` present **only** on `/talks/my-career` — the sole
      intended noindex in the tree (`next/app/(en)/talks/my-career/page.tsx`).
      (`/search` and `/ko/search` also carry an intended
      `<meta name="robots" content="noindex,follow">` from
      `next/src/seo/metadata.ts`; a probe that reads meta tags must allow it.)
      No `_headers`/`_routes` file is tracked in the repo, so the rehearsal's
      noindex marker cannot leak — assert that absence on live anyway, on the
      root domain AND `brandonwie-dev.pages.dev` alias.
- [ ] Feeds valid (`/rss.xml`, `/ko/rss.xml` — the site's only feed paths;
      `/feed.xml` 404s on both stacks), `robots.txt` intact, Pagefind entry
      JSON serves on `/pagefind/pagefind-entry.json`.
- [ ] Fresh `*.pages.dev` hash subdomains may serve ~60 s of TLS lag after
      first deploy (rehearsal observation) — not an error; retry before
      flagging.

## Rollback — TWO steps, ordered (historical; void after 2026-09-29)

On threshold breach or probe failure:

1. **Assets first.** Dashboard "Roll back" (or REST
   `POST …/pages/projects/brandonwie-dev/deployments/<id>/rollback`) to the
   deployment ID recorded under **Pre-flip deployment ID** in the execution
   record below — read live and written there at step 1 of the cutover, never
   copied from this paragraph. Fallback if that entry is empty or
   unreachable: the G4-era target `a385230f-f57e-432e-b743-6f51ea1f9e44` @
   `1a83ebd`. This restores Svelte assets immediately.
2. **Config second.** `destination_dir` back to `build`. Without this, the
   next push to `main` re-deploys Next — the flip alone survives an asset
   rollback.

Ordering matters: a config-first revert leaves live traffic on the failed
deployment until the next build completes.

## Monitoring window

Per `plan.md` Slice 6: Search Console, analytics, errors, feeds, Core Web
Vitals. Roll back on an agreed threshold breach (error rate >2× baseline,
p95 latency >50% above baseline, new client JS error types >0.1% of sessions,
user-reported breakage, feed/search regression).

## Execution record (fill at execution time)

| Field                     | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flip executed by / at     | Brandon (dashboard) / 2026-09-20 ~23:1x UTC                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Pre-flip deployment ID    | `93a3f41a-b21a-46a6-88a8-f9f6cec48468` (canonical at flip time, read live)                                                                                                                                                                                                                                                                                                                                                                                             |
| Pre-flip commit           | `37887e2`                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Post-flip deployment ID   | `b8593022-8477-4813-bbce-b64b27ebc1e8` — completed 2026-09-20T23:22:40Z                                                                                                                                                                                                                                                                                                                                                                                                |
| Post-flip commit          | `37887e2`                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| destination_dir old → new | `build` → `next/build`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Probe result              | **PASS** (live 2026-09-20 ~23:25 UTC): 15 routes 200, unmatched path → real 404; `lang` en/ko correct; canonicals → `brandonwie.dev`; `noindex` only on `/talks/my-career` (meta robots), absent on `/`, `/ko`, `/posts` and the `pages.dev` alias; `/rss.xml` + `/ko/rss.xml` `application/xml` 200, `robots.txt`/`sitemap.xml` 200, `/pagefind/pagefind-entry.json` 200; `giscus.app` + canonical on post pages; live root shows `_next` markers (cutover confirmed) |
| Token `249ae685…` revoked | yes — Brandon, 2026-09-20                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Monitoring window opened  | 2026-09-20T23:25Z — Search Console / analytics / errors / feeds / CWV                                                                                                                                                                                                                                                                                                                                                                                                  |
| Monitoring window closed  | 2026-09-29 — Brandon, on 9 days without rollback, 15 successful Next production deploys and a 70/70 live probe; SvelteKit retired afterwards (`refactor/retire-svelte`)                                                                                                                                                                                                                                                                                                |

Note: committing this record pushes to `main`, which post-flip redeploys
production as Next (the arming warning, operational). Expected and harmless —
content is the same reviewed tree.

## Discipline

Every production-touching step runs alone, with a separate explicit confirm —
no chained pushes or deploys. Documentation-only commits (like this file) need
no confirm. Deferred items stay out of Slice 6 scope: issue #65 (flight-payload
weight), BC-07 child-PID wait, C11 sentinel-naming advisory.
