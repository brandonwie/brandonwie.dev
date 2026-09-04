# Threshold results — AC9

Results are judged against [`./thresholds.md`](./thresholds.md). Every row names
the bound it was measured against, and no bound was written after the
measurement that it judges.

Captured 2026-08-27 against the SvelteKit build of `main` HEAD `34aa7e7` —
Chrome 152 on macOS 15.7.9, devicePixelRatio 2, loopback server, no throttling.

## Accessibility — measured

Rubric: [`./thresholds.md`](./thresholds.md) § Accessibility rubric. Route set:
the eleven-route representative set in
[`./behavior-matrix.md`](./behavior-matrix.md), each at 390×844, 820×1180 and
1440×900.

| Metric                                            | Bound                                         | Measured                                                                                            | Result                        |
| ------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- |
| Critical findings                                 | 0 permitted                                   | **0** across all 11 routes × 3 viewports                                                            | PASS                          |
| Interactive elements with no accessible name      | 0 permitted (critical)                        | **0** — 36 / 199 / 52 / 52 / 36 / 994 / 20 / 37 / 22 / 18 focusables per route                      | PASS                          |
| Images with no `alt`                              | 0 permitted (critical)                        | **0** — including all 167 lazy card images on `/posts`                                              | PASS                          |
| Declared keyboard controls reachable and operable | all                                           | **8 of 8** sequences K1–K8 passed                                                                   | PASS                          |
| Serious findings                                  | enumerated, with an owner and a closing slice | **1** — A11Y-1, palette focus not restored after `Escape` (WCAG 2.4.3); owner: Slice 3 palette port | PASS (enumerated, not waived) |
| Horizontal overflow                               | none at any declared viewport                 | **none** — `scrollWidth` 382 / 812 / 1432 against 390 / 820 / 1440                                  | PASS                          |

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

| Half                     | Status                                                             |
| ------------------------ | ------------------------------------------------------------------ |
| Accessibility thresholds | MEASURED — 0 critical findings, 1 serious enumerated with an owner |
| Weight budgets           | WRITTEN; the candidate comparison is due at Slice 2                |
| Core Web Vitals proxies  | MEASURED — bounds frozen from the baseline, all ten routes pass    |

AC9 is satisfied for Slice 0: every threshold carries a metric, a numeric bound
and a route set; each bound was written before the result it judges; and every
result names the bound it was measured against. What remains open is coverage,
not method — one viewport rather than three, stated in § Threats to these
numbers.
