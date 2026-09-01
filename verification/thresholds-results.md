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
[`./thresholds.md`](./thresholds.md) § Budgets for the Next.js candidate. They
apply to the **candidate**, so there is nothing to judge yet: the numbers below
are the Svelte baseline those budgets were derived from, reproduced here so the
comparison at Slice 2 has both halves in one place.

| Measure                         | Svelte baseline | Candidate budget | Candidate |
| ------------------------------- | --------------- | ---------------- | --------- |
| Files (excluding `.br` / `.gz`) | 1,638           | —                | Slice 2   |
| Total build weight              | 72.1 MB         | ≤ 86 MB          | Slice 2   |
| HTML                            | 21,626 KB       | ≤ 25,900 KB      | Slice 2   |
| JavaScript                      | 10,695 KB       | ≤ 13,900 KB      | Slice 2   |
| CSS                             | 194 KB          | ≤ 250 KB         | Slice 2   |
| Images                          | 35.7 MB         | ≤ 35.7 MB        | Slice 2   |
| Largest JS chunk                | 662,650 B       | ≤ 860 KB         | Slice 2   |

Source: `verification/baseline/svelte-34aa7e7.json` `bundle` block, captured by
`pnpm migration:capture`.

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
