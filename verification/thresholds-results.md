# Threshold results — AC9

Results are judged against [`./thresholds.md`](./thresholds.md). Every row names
the bound it was measured against, and no bound was written after the
measurement that it judges.

Captured 2026-08-27 against the SvelteKit build of `main` HEAD `34aa7e7` —
Chrome 152 on macOS 15.7.9, devicePixelRatio 2, loopback server, no throttling.

## Accessibility — measured

Rubric: [`./thresholds.md`](./thresholds.md) § Accessibility rubric. Route set:
the ten-route viewport representative set in
[`./behavior-matrix.md`](./behavior-matrix.md), each at 390×844, 820×1180 and
1440×900. (The matrix's eleventh a11y row is the keyboard-only `Cmd+K` palette
row — no viewport measurement; the measured set is 10 routes.)

| Metric                                            | Bound                                         | Measured                                                                              | Result |
| ------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| Critical findings                                 | 0 permitted                                   | **0** across all 10 routes × 3 viewports                                              | PASS   |
| Interactive elements with no accessible name      | 0 permitted (critical)                        | **0** — 36 / 199 / 52 / 52 / 36 / 994 / 20 / 37 / 22 / 18 focusables per route        | PASS   |
| Images with no `alt`                              | 0 permitted (critical)                        | **0** — including all 167 lazy card images on `/posts`                                | PASS   |
| Declared keyboard controls reachable and operable | all                                           | **8 of 8** sequences K1–K8 passed                                                     | PASS   |
| Serious findings                                  | enumerated, with an owner and a closing slice | **0** — A11Y-1 closed in PR 2c (opener-capture focus restore on Escape/click-outside) | PASS   |
| Horizontal overflow                               | none at any declared viewport                 | **none** — `scrollWidth` 382 / 812 / 1432 against 390 / 820 / 1440                    | PASS   |

## Weight — measured, recorded not compared

Budgets and the reasoning behind them are in
[`./thresholds.md`](./thresholds.md) § Budgets for the Next.js candidate.

**Read the Candidate column as a partial port, not as a result.** The candidate
exports **12 pages against the baseline's 366**, so every total below is smaller
because most of the site does not exist yet. "42.4 MB against a budget of 86" is
not headroom; it is an unfinished build. Exactly one row is meaningful today —
the largest JS chunk, because it is a per-chunk measurement rather than a sum.
The CSS row is not: `next/app/globals.css` imports the whole of `src/app.css`,
but Tailwind generates utilities only for the classes it finds in `next/`, so
118 KB against 194 KB reflects twelve pages' worth of markup and will grow with
every ported surface.

| Measure                         | Svelte baseline | Candidate budget | Candidate at PR 2 (`0244565`) | Candidate at PR 3 (`2658b72`) |
| ------------------------------- | --------------- | ---------------- | ----------------------------- | ----------------------------- |
| Files (excluding `.br` / `.gz`) | 1,638           | —                | 508                           | 524                           |
| Total build weight              | 72.1 MB         | ≤ 86 MB          | 41.9 MB (partial)             | 42.4 MB (partial)             |
| HTML                            | 21,633 KB       | ≤ 25,900 KB      | 277 KB (partial)              | 371 KB (partial)              |
| JavaScript                      | 10,701 KB       | ≤ 13,900 KB      | 4,895 KB (partial)            | 5,039 KB (partial)            |
| CSS                             | 194 KB          | ≤ 250 KB         | 112 KB                        | 118 KB                        |
| Images                          | 35.7 MB         | ≤ 35.7 MB        | 35.7 MB — **identical**       | 35.7 MB — **identical**       |
| Largest JS chunk                | 662,650 B       | ≤ 860 KB         | 655,681 B                     | 655,681 B — **unchanged**     |

Two PR 3 movements are worth reading rather than skipping.

**HTML grew 94 KB across two new pages**, which is far more than two pages of
markup. Almost all of it is `/migration-fixture/palette`: the palette needs
every post as a searchable item, the page is a Server Component, and the
serialized props for 167 posts travel to the client inside the exported HTML.
That is a real property of the port, not fixture overhead — the palette is
mounted globally in the Svelte shell, so at Slice 3 the same payload would ride
on **every** page unless the item set is fetched rather than embedded. It is
recorded here so the decision is made deliberately rather than discovered by a
budget.

**The largest chunk did not move at all.** 655,681 B before GSAP and 655,681 B
after is the dynamic-import boundary working: `gsap`, `gsap/Flip` and
`gsap/DrawSVGPlugin` land in three chunks the exported page does not reference,
which row S5 of `migration:gsap-palette` asserts directly. JavaScript still grew
144 KB in total, because those lazy chunks are still files in the build.

Both columns come from the same `bundle` block computed by `bundleWeights()` in
`scripts/migration-verify.ts`, which excludes `.br` and `.gz` and counts real
file sizes. The Candidate column was produced by running the capture path
against `next/build` into a throwaway file, never against
`verification/baseline/` — a re-capture of the baseline is forbidden and
`pnpm migration:projection` enforces it. Svelte column source:
`verification/baseline/svelte-e23e808.json`.

Three notes the numbers do not carry on their own:

- **Images are byte-identical**, 37,464,994 in both columns. The budget for this
  row is "no increase", which is a comparison rather than a ceiling, and it
  holds by construction: `next/public` reaches the same `static/` tree the
  Svelte build serves rather than owning a copy.
- **The largest chunk is already within 31 KB of Svelte's** with a fraction of
  the routes ported. It is the mermaid runtime, and no exported document
  references it — it is a dynamic import, fetched only once a page with a
  diagram asks for it. So the number is not a page-load cost today, but it is
  the row to watch: the budget is a per-chunk ceiling, and this chunk is not
  going to get smaller.
- **An earlier revision of this section, and PR #40's description, reported
  these on a `du` basis** — 58.7 MB, 5,328 KB JS, 704 KB largest chunk. `du`
  reports allocated blocks and counts the precompressed `.br` / `.gz` copies
  the bundle block deliberately excludes, so those figures are not comparable
  with the Svelte column. This is the same basis-consistency error this slice
  already corrected once in its line-ratio numbers; the table above is the one
  to cite.

The source line previously named `verification/baseline/svelte-34aa7e7.json`,
which is no longer in the repository — the baseline moved to measured
generation 3 (`svelte-e23e808.json`, tag
`migration-baseline-svelte-e23e808-v1`). Two Svelte cells moved with it: HTML
21,626 to 21,633 KB and JavaScript 10,695 to 10,701 KB. Corrected here rather
than left pointing at a file nobody can open.

## Performance — measured

Lab proxies, not field Core Web Vitals. Top-level navigations at 1680x1072, 5
warm runs per route after a discarded priming load, median reported with min and
max. Every run asserted `document.visibilityState === "visible"`; the window was
brought to the foreground first, and a gate probe required `visible`, a firing
`requestAnimationFrame`, and credible paint entries (FCP 428 ms) before any run
was recorded.

### LCP proxy

Bound: **2,500 ms** (frozen). Advisory guard: the route's own median x 1.20.

| Route                                    | Median   | min | max   | Bound    | Advisory guard | Result |
| ---------------------------------------- | -------- | --- | ----- | -------- | -------------- | ------ |
| `/`                                      | 480 ms   | 340 | 512   | 2,500 ms | 576 ms         | PASS   |
| `/posts`                                 | 1,068 ms | 916 | 1,464 | 2,500 ms | 1,282 ms       | PASS   |
| `/posts/giscus-sveltekit-integration`    | 864 ms   | 828 | 1,216 | 2,500 ms | 1,037 ms       | PASS   |
| `/ko/posts/giscus-sveltekit-integration` | 820 ms   | 784 | 1,064 | 2,500 ms | 984 ms         | PASS   |
| `/ko`                                    | 296 ms   | 276 | 316   | 2,500 ms | 355 ms         | PASS   |
| `/tags`                                  | 436 ms   | 416 | 452   | 2,500 ms | 523 ms         | PASS   |
| `/search`                                | 244 ms   | 236 | 276   | 2,500 ms | 293 ms         | PASS   |
| `/study/dsa-ii`                          | 304 ms   | 284 | 332   | 2,500 ms | 365 ms         | PASS   |
| `/system/3b`                             | 364 ms   | 328 | 396   | 2,500 ms | 437 ms         | PASS   |
| `/talks/my-career`                       | 864 ms   | 852 | 968   | 2,500 ms | 1,037 ms       | PASS   |

Slowest route is `/posts` at 1,068 ms, which is the 167-card grid; the fastest
is `/search` at 244 ms, which is an empty input. Both are within the bound with
room to spare, which is why the floor rather than the baseline sets it.

### CLS proxy

Bound: **0.10** (frozen).

| Route set      | Median    | Bound | Result |
| -------------- | --------- | ----- | ------ |
| All ten routes | **0.000** | 0.10  | PASS   |

Every route measured zero at every run but one (`/posts`, a single run at
0.0025). This is a static, server-rendered site with sized media; the result is
what that should look like.

The iframe harness reported CLS 0.2121 on `/` and 0.4027 on `/posts` for the
same builds. Those numbers are the frame's own load sequence, not the page, and
they are recorded here only so nobody reruns the frame path and believes them.

### Interaction latency proxy

Bound: **200 ms** (frozen). Source: `event` entries, `durationThreshold: 16`,
worst per interaction.

| Flow                                                | Presses        | Durations                        | Worst     | Bound  | Result          |
| --------------------------------------------------- | -------------- | -------------------------------- | --------- | ------ | --------------- |
| `/` — `Cmd+K` open, `Escape` close, x5              | discrete       | all at the 16 ms reporting floor | 16 ms     | 200 ms | PASS            |
| `/talks/my-career` — `ArrowRight`, x5 with 3 s gaps | discrete       | 48, 48, 72, 48 ms                | **72 ms** | 200 ms | PASS            |
| `/talks/my-career` — `ArrowRight` x5 with no gap    | **key repeat** | 496–520 ms                       | 520 ms    | —      | **not counted** |

The last row is recorded because it was measured first and it is misleading.
Sending five arrow presses back to back queues them behind the running GSAP
transition, and the event durations then include waiting for it. That is the
harness's key repeat, not a user, so it is not a result. It is worth carrying
into the migration anyway: an input queued behind a transition is a real user
scenario, and React's scheduling would not necessarily queue it the same way.

## Threats to these numbers

Stated so a reader can discount them correctly.

- **One viewport.** 1680x1072 only — the window cannot be resized and the iframe
  distorts CLS. LCP at 390 px, where the largest element differs, is not covered.
- **Loopback, no throttling, warm cache.** These are floor numbers. A real
  visitor on a slow network over Cloudflare will be slower, and the gap between
  the two is not measured here.
- **One machine, one session.** No cross-machine variance, and n = 5 per route.
- **Lab, not field.** No real-user distribution stands behind any of it, which is
  why the interaction row is labelled a proxy rather than INP.

## Slice 0 status against AC9

| Half                     | Status                                                                      |
| ------------------------ | --------------------------------------------------------------------------- |
| Accessibility thresholds | MEASURED — 0 critical findings, 0 serious findings (A11Y-1 closed in PR 2c) |
| Weight budgets           | WRITTEN; the candidate comparison is due at Slice 2                         |
| Core Web Vitals proxies  | MEASURED — bounds frozen from the baseline, all ten routes pass             |

AC9 is satisfied for Slice 0: every threshold carries a metric, a numeric bound
and a route set; each bound was written before the result it judges; and every
result names the bound it was measured against. What remains open is coverage,
not method — one viewport rather than three, stated in § Threats to these
numbers.

---

# Slice 5 candidate — measured

Captured 2026-09-19 against the **Next.js candidate build of `d2827b4`**
(`feat/slice5-comparison`, generation-6 baseline comparison HEAD) —
HeadlessChrome 153 (`--headless=new`) on macOS, Node v24.21.0, pnpm 10.32.1,
`serve-build.mjs` loopback, no throttling. Driver:
`scripts/capture/ac9-candidate.mjs`, which reuses the same `frame-probe.js` /
`perf-probe.js` and the same fixed capture profile the baseline used.

**Environment delta, stated not hidden.** The baseline ran through a headed,
foreground Chrome because its automation surface could not paint an occluded
tab. This run is `--headless=new`, where the page paints and rAF fires by
construction. The metric contract is unchanged: a gate probe required
`visibilityState === "visible"`, a firing `requestAnimationFrame`, and a
credible paint entry (FCP 308 ms) before any run was recorded, and every
recorded sample carries `visible: true`. These remain **lab proxies**, not
field Core Web Vitals — same caveat as the baseline half.

## Accessibility — candidate

Rubric: [`./thresholds.md`](./thresholds.md) § Accessibility rubric. Route set:
the same representative set, each at 390×844, 820×1180 and 1440×900 inside
`/__viewport`.

| Metric                                            | Bound                                         | Measured                                                                                 | Result |
| ------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| Critical findings                                 | 0 permitted                                   | **0** across all 10 routes × 3 viewports                                                 | PASS   |
| Interactive elements with no accessible name      | 0 permitted (critical)                        | **0** — 34 / 197 / 55 / 55 / 34 / 992 / 18 / 35 / 20 / 18 focusables per route           | PASS   |
| Images with no `alt`                              | 0 permitted (critical)                        | **0** — including all 167 lazy card images on `/posts` (5 loaded at 390px, rest lazy)    | PASS   |
| Declared keyboard controls reachable and operable | all                                           | **8 of 8** sequences K1–K8 passed (table below)                                          | PASS   |
| Serious findings                                  | enumerated, with an owner and a closing slice | **0** — Escape-close returns focus to the opener (`BUTTON`), the A11Y-1 fix carries over | PASS   |
| Horizontal overflow                               | none at any declared viewport                 | **none** — `scrollWidth` ≤ `innerWidth` at 390 / 820 / 1440 on every route               | PASS   |
| `lang` contract                                   | `ko` on KO routes, `en` elsewhere             | `ko` on `/ko` + `/ko/posts/…`, `en` on the other eight                                   | PASS   |
| Breakpoint correctness                            | frame's own `matchMedia` agrees with its size | all four queries correct at all 30 route×viewport cells                                  | PASS   |

Focusable counts sit within 0–3 of the Svelte baseline's
36 / 199 / 52 / 52 / 36 / 994 / 20 / 37 / 22 / 18 — the small deltas are the
already-ledgered post-header / shell redesign classes, not new unnamed or
inoperable controls (the count is 0 either way).

### Keyboard flows — candidate

Same sequences as the baseline matrix, sent as real CDP key events.

| #   | Route                            | Sequence        | Observed on candidate                                                                                       | Result |
| --- | -------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| K1  | `/`                              | `Cmd+K`         | `[role=dialog]` present, 23 `[role=option]`, `activeElement` = `INPUT` "Search posts and commands…"         | PASS   |
| K2  | `/` palette                      | `ArrowDown` ×2  | `aria-activedescendant` = `cmdk-option-2`, option "◫ Study /study"                                          | PASS   |
| K3  | `/` palette                      | type `redis`    | 23 → 9 options; "Redis and BullMQ Queue Patterns…" first among post results (option 2, after a command row) | PASS   |
| K4  | `/` palette                      | `Escape`        | dialog gone, `pathname` still `/`, focus restored to the `BUTTON` opener                                    | PASS   |
| K5  | `/posts/claude-code-agent-teams` | `Backspace`     | navigated to `/posts`, title "All Posts \| Brandon Wie"                                                     | PASS   |
| K6  | `/talks/my-career`               | `ArrowRight` ×6 | URL walked `?page=2&step=1` → `?page=4&step=2` — same step/slide advance shape as baseline                  | PASS   |
| K7  | `/talks/my-career`               | `ArrowLeft`     | stepped back to `?page=1&step=1`                                                                            | PASS   |
| K8  | `/posts/claude-code-agent-teams` | scroll to 50 %  | `[role=progressbar]` `aria-valuenow="56"` at `scrollY` 4,743 of 9,486                                       | PASS   |

## Weight — candidate, full build

Budgets: [`./thresholds.md`](./thresholds.md) § Budgets for the Next.js
candidate. The earlier "partial port" caveat no longer applies — this column is
the complete candidate at `d2827b4`, all 373 exported pages. Same
`bundleWeights()` basis as both prior columns: real file sizes, `.br`/`.gz`
excluded.

| Measure                       | Svelte baseline | Candidate budget | Candidate `d2827b4` (full) | Result                       |
| ----------------------------- | --------------- | ---------------- | -------------------------- | ---------------------------- |
| Files (excluding `.br`/`.gz`) | 1,638           | —                | 3,095                      | recorded                     |
| Total build weight            | 72.1 MB         | ≤ 86 MB          | **216.8 MB**               | **EXCEEDS — decision below** |
| HTML                          | 21,633 KB       | ≤ 25,900 KB      | **56,321 KB**              | **EXCEEDS — decision below** |
| JavaScript                    | 10,701 KB       | ≤ 13,900 KB      | 5,375 KB                   | PASS                         |
| CSS                           | 194 KB          | ≤ 250 KB         | 194 KB                     | PASS                         |
| Images                        | 35.7 MB         | ≤ 35.7 MB        | 35.7 MB — identical        | PASS                         |
| Largest JS chunk              | 662,650 B       | ≤ 860 KB         | 655,681 B                  | PASS                         |
| Pagefind largest shard        | 723,406 B       | — (recorded)     | 698,198 B                  | recorded                     |

**Why HTML and total exceed.** Both rows are the same cause, not two problems.
Next's static export ships the React Server Component flight payload twice:
once inline in each HTML page (`self.__next_f.push` scripts, ~150 KB/page vs
Svelte's ~59 KB/page — that alone is the 2.6× HTML figure) and again as
standalone per-route prefetch payloads — **1,860 `.txt` files totalling
116 MB**, roughly five variants per route (`<route>.txt`, `__next._full.txt`,
`__PAGE__.txt`, localized twins). Those `.txt` files are what carry total
weight past the envelope: without them the build is ~100 MB, still over 86, but
the dominant single bucket is the flight payload set, which the client router
needs for instant navigations. This is inherent to the App Router export
architecture, not a defect — per `thresholds.md`, exceeding a budget is a
decision recorded with its reason, and this is the reason. The per-chunk and
per-resource budgets that could not be architecture-inflated — JS total,
largest chunk, CSS, images — all pass with headroom.

**Decision (Brandon, 2026-09-19): accepted, with follow-up.** The duplication
is accepted for the cutover and tracked by issue
[#65](https://github.com/brandonwie/brandonwie.dev/issues/65) —
investigate trimming the per-route `.txt` variants and the inline `__next_f`
payload. The per-page reader cost is ~150 KB of HTML against Svelte's ~59 KB,
while every frozen UX bound (LCP, CLS, interaction) passes with headroom.

## Performance — candidate

Lab proxies, not field Core Web Vitals. Top-level navigations at 1680×1072
(dpr 2), 5 warm runs per route after a discarded priming load, median reported
with min and max. `--headless=new`; the visibility/paint gate probe passed
before capture (see header).

### LCP proxy — candidate

Bound: **2,500 ms** (frozen). Advisory guard: the route's own baseline median ×
1.20.

| Route                                    | Median | min | max | Bound    | Advisory guard | Result |
| ---------------------------------------- | ------ | --- | --- | -------- | -------------- | ------ |
| `/`                                      | 40 ms  | 32  | 44  | 2,500 ms | 576 ms         | PASS   |
| `/posts`                                 | 72 ms  | 72  | 92  | 2,500 ms | 1,282 ms       | PASS   |
| `/posts/giscus-sveltekit-integration`    | 44 ms  | 36  | 52  | 2,500 ms | 1,037 ms       | PASS   |
| `/ko/posts/giscus-sveltekit-integration` | 40 ms  | 36  | 52  | 2,500 ms | 984 ms         | PASS   |
| `/ko`                                    | 44 ms  | 36  | 48  | 2,500 ms | 355 ms         | PASS   |
| `/tags`                                  | 72 ms  | 52  | 76  | 2,500 ms | 523 ms         | PASS   |
| `/search`                                | 36 ms  | 24  | 48  | 2,500 ms | 293 ms         | PASS   |
| `/study/dsa-ii`                          | 48 ms  | 40  | 52  | 2,500 ms | 365 ms         | PASS   |
| `/system/3b`                             | 44 ms  | 32  | 48  | 2,500 ms | 437 ms         | PASS   |
| `/talks/my-career`                       | 176 ms | 164 | 192 | 2,500 ms | 1,037 ms       | PASS   |

Every route is inside both the frozen bound and its advisory guard. The
candidate's medians are uniformly lower than the Svelte baseline's (baseline
`/posts` 1,068 ms vs candidate 72 ms); the same probe, profile and loopback
server produced both sets, and the gap is recorded rather than explained —
loopback lab proxies measure the build's paint path, not the network, and
hydration timing is not part of this metric.

### CLS proxy — candidate

Bound: **0.10** (frozen).

| Route set      | Median    | Bound | Result |
| -------------- | --------- | ----- | ------ |
| All ten routes | **0.000** | 0.10  | PASS   |

Every run of every route measured zero layout shift (60/60 samples).

### Interaction latency proxy — candidate

Bound: **200 ms** (frozen). Source: `event` entries, `durationThreshold: 16`,
recorded live by a collector installed before navigation (not the post-hoc
buffer).

| Flow                                               | Presses  | Durations                                             | Worst   | Bound  | Result |
| -------------------------------------------------- | -------- | ----------------------------------------------------- | ------- | ------ | ------ |
| `/` — `Cmd+K` open, `Escape` close, ×5             | discrete | **all below the 16 ms floor** — zero entries recorded | < 16 ms | 200 ms | PASS   |
| `/talks/my-career` — `ArrowRight` ×5 with 3 s gaps | discrete | 24–32 ms                                              | 32 ms   | 200 ms | PASS   |

Zero recorded events on the palette row means every keydown/keyup pair
completed under the 16 ms reporting floor — the collector was verified live by
the deck row's 10 entries (keydown + keyup per press), so an empty set is a
fast measurement, not a broken probe. The baseline's key-repeat caveat applies
unchanged: back-to-back arrow presses queue behind the GSAP transition and are
not counted, per the same rule.

## Threats to these numbers — candidate half

In addition to the baseline's threats (one viewport, loopback, warm cache,
n = 5, lab not field):

- **`--headless=new` vs headed Chrome 152.** Candidate ran HeadlessChrome 153.
  The visibility gate plus identical probes keep the metric contract, but the
  two builds were produced by different Chrome major versions — treat exact
  numbers as comparable-in-method, not identical-in-environment.
- **Interaction floor.** Candidate palette interactions fall below the 16 ms
  `event` threshold entirely; PASS is inferred from "no entry ≥ 16 ms", which
  is the same reading the baseline's at-floor row produced.

## Slice 5 status against AC9

| Half                     | Status                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Accessibility thresholds | MEASURED on the full candidate — 0 critical, 0 serious, 8/8 keyboard flows, no overflow                             |
| Weight budgets           | MEASURED on the full candidate — 4 PASS, 2 exceed (HTML, total) — **accepted by Brandon 2026-09-19, follow-up #65** |
| CWV proxies              | MEASURED on the full candidate — all 10 routes inside frozen bound and advisory guard                               |
