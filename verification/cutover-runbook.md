# Cutover runbook — Slice 6

The executed-production-promotion runbook for `plan.md` Slice 6. Mechanism
chosen 2026-09-20: **control-plane output-directory flip** (option 1), not a
root-script change. This document is the git-visible record of that config
drift — the flip itself is a dashboard change git cannot see.

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
`5ec46cc7-55c2-484d-8f0b-0c3749476d87` @ `0d80b01` (post-merge build, still
serving the Svelte `build/` tree). This is a fresher Svelte rollback candidate
than the G4-recorded `a385230f`; whichever deployment is canonical at flip time
becomes the recorded rollback target below.

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
      No `_headers`/`_routes` file is tracked in the repo, so the rehearsal's
      noindex marker cannot leak — assert that absence on live anyway, on the
      root domain AND `brandonwie-dev.pages.dev` alias.
- [ ] Feeds valid (`/feed.xml`, `/ko/feed.xml`), `robots.txt` intact,
      Pagefind search functional on `/search`.
- [ ] Fresh `*.pages.dev` hash subdomains may serve ~60 s of TLS lag after
      first deploy (rehearsal observation) — not an error; retry before
      flagging.

## Rollback — TWO steps, ordered

On threshold breach or probe failure:

1. **Assets first.** Dashboard "Roll back" (or REST
   `POST …/pages/projects/brandonwie-dev/deployments/<id>/rollback`) to the
   recorded pre-flip deployment (`5ec46cc7…` @ `0d80b01`, or the G4 target
   `a385230f…` @ `1a83ebd` if so decided). This restores Svelte assets
   immediately.
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

| Field                     | Value                  |
| ------------------------- | ---------------------- |
| Flip executed by / at     | _pending_              |
| Pre-flip deployment ID    | _pending_ (read live)  |
| Pre-flip commit           | _pending_              |
| Post-flip deployment ID   | _pending_              |
| Post-flip commit          | _pending_              |
| destination_dir old → new | `build` → `next/build` |
| Probe result              | _pending_              |
| Token `249ae685…` revoked | _pending_              |
| Monitoring window opened  | _pending_              |

## Discipline

Every production-touching step runs alone, with a separate explicit confirm —
no chained pushes or deploys. Documentation-only commits (like this file) need
no confirm. Deferred items stay out of Slice 6 scope: issue #65 (flight-payload
weight), BC-07 child-PID wait, C11 sentinel-naming advisory.
