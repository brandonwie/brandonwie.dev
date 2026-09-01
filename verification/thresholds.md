# Performance and weight thresholds

**Written before Slice 2, per AC9**, so the numbers a Next.js build is judged
against were chosen before that build existed. They are budgets, not
predictions.

## Measured Svelte baseline (`main` HEAD `34aa7e7`)

Captured by `pnpm migration:capture`; recorded in
`verification/baseline/svelte-34aa7e7.json` under `bundle`.

| Measure                         | Svelte baseline |
| ------------------------------- | --------------- |
| Files (excluding `.br` / `.gz`) | 1,638           |
| Total build weight              | 72.1 MB         |
| HTML                            | 21,626 KB       |
| JavaScript                      | 10,695 KB       |
| CSS                             | 194 KB          |
| Images                          | 35.7 MB         |
| Largest JS chunk                | 662,650 B       |
| Pagefind index (largest shard)  | 723,406 B       |

## Budgets for the Next.js candidate

| Measure          | Budget                  | Why this number                                                              |
| ---------------- | ----------------------- | ---------------------------------------------------------------------------- |
| Total JavaScript | ≤ 13,900 KB (+30%)      | React plus its runtime is heavier than Svelte's; 30% is the headroom allowed |
| Largest JS chunk | ≤ 860 KB (+30%)         | Same allowance applied to the single worst chunk                             |
| CSS              | ≤ 250 KB                | Tailwind v4 output should be comparable; a large rise means config drift     |
| Images           | ≤ 35.7 MB (no increase) | The same files move from `static/` to `public/`; growth means duplication    |
| HTML             | ≤ 25,900 KB (+20%)      | React hydration markup is larger; beyond 20% suggests over-hydration         |
| Total weight     | ≤ 86 MB (+20%)          | Envelope figure                                                              |

**These are not measured performance.** Weight is a proxy the static build can
produce without a browser. Core Web Vitals, keyboard flows and accessibility
findings need browser evidence and are **open Slice 0 work**, not covered here.

## How this is judged

`migration-verify` **records** bundle weights and does not compare them: a
framework swap changes chunk names and sizes by construction, so diffing them
would fail on every candidate for reasons that are not regressions. A person
compares the candidate's `bundle` block against the budgets above at the Slice 2
checkpoint. Exceeding a budget is not automatically a stop — it is a decision
that must be recorded with its reason.

---

## Browser evidence — method, fixed before capture

Everything below is written **before** any browser measurement exists, per AC9.
It fixes how the numbers are produced so a rerun reproduces them, and so a bound
can never be fitted to the result it judges.

### These are lab proxies, not field Core Web Vitals

The measurements come from one machine, over loopback, with no real-user
population behind them. Web Vitals guidance separates lab measurement from field
data, and a raw `PerformanceObserver` reading is not automatically the number a
field report would give (<https://web.dev/articles/vitals>). No row in
`thresholds-results.md` may be described as a Core Web Vitals pass. They are
lab proxies, useful for catching a regression between two builds measured the
same way.

### Fixed capture profile

| Setting              | Value                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server               | `node scripts/serve-build.mjs build 4173` — loopback, same resolution order as `scripts/migration-verify.ts` `resolveStatic()`: exact file, then `.html`, then `/index.html`, then `404.html` |
| Throttling           | none — no CPU throttle, no network throttle                                                                                                                                                   |
| Cache                | warm — one discarded priming load per route before the recorded runs                                                                                                                          |
| Runs                 | **5 per route**, median reported, min and max recorded                                                                                                                                        |
| Performance viewport | **1680x1072, top-level** — one viewport, for the reason below                                                                                                                                 |
| Structural viewports | 390x844, 820x1180, 1440x900, via a same-origin iframe                                                                                                                                         |
| Environment          | Chrome and OS version recorded with the results                                                                                                                                               |

### Two constraints of the automation surface, measured not assumed

Probed 2026-08-27, Chrome 152 on macOS 15.7.9.

1. **The window cannot be resized.** `resize_window` reported success for
   1440x900, 1200x672 and 300x500 in turn while `innerWidth`/`innerHeight` stayed
   `1680x1128` every time. Structural and responsive states are therefore
   captured in a same-origin iframe sized in exact CSS pixels, and every row
   records the frame's own `matchMedia` result rather than trusting a screenshot.

   **The iframe is not sound for CLS.** Measured the same pages both ways: the
   frame reported CLS 0.2121 on `/` and 0.4027 on `/posts`, against 0.0009 and
   0.000 top-level. The frame's own load and sizing sequence manufactures the
   shifts. So performance is measured **top-level only, at one viewport**, and
   viewport-sensitive LCP is a named gap in this baseline rather than a number
   nobody should trust.

2. **The tab is hidden unless its Chrome window is foreground and unoccluded.**
   Behind other windows, `document.visibilityState` read `"hidden"` on every tab
   including a freshly created one: Chrome does not paint a page it never
   displays, `requestAnimationFrame` never fired, and no paint entry was
   produced. Forcing a render with a screenshot then produced **FCP = 33,456 ms**
   on `/about` — the delay until the harness looked, not the page's speed. With
   the window brought to the front the same probe reads `visible`, rAF fires,
   and FCP is **428 ms**.

   **Therefore performance capture requires a foreground, unoccluded window, and
   the run must assert it.** Every recorded A3a run checked
   `visibilityState === "visible"`. Structural and accessibility capture are
   unaffected — those were taken while hidden, and the accessible-name and
   overflow results were re-checked after.

   The same cause explains three things a screenshot alone would have misread:
   `loading="lazy"` images never fetch while hidden (167 of them on `/posts`),
   hydration does not complete until the first paint (`Cmd+K` was inert until
   then), and the GSAP deck leaves slide content at `opacity: 0` because its
   entrance animation never runs.

### Metric algorithms

- **LCP proxy** — the last `largest-contentful-paint` entry observed before the
  first user interaction or scroll; `startTime`, in milliseconds.
- **CLS proxy** — `layout-shift` entries with `hadRecentInput === false`,
  grouped into session windows (at most 1 s between entries, at most 5 s per
  window). The score is the **maximum** window, not the naive sum of all shifts.
- **Interaction latency proxy** — for each scripted interaction, the maximum
  `event` entry `duration` with `durationThreshold: 16`; the route's value is
  the worst interaction in that run. This is a proxy, not INP: INP is a field
  metric over a real interaction distribution, which a scripted pass does not
  have.

### Bound formula

> bound = **max**( the "good" threshold, median Svelte baseline × 1.20 )

with the good thresholds pinned as **LCP ≤ 2,500 ms**, **CLS ≤ 0.10**, and
**interaction latency ≤ 200 ms**. The 1.20 factor is the same headroom shape the
weight budgets above already use.

Ordering, so no bound was fitted to what it judges — both steps are done:

1. **A3a (done 2026-08-27)** — measured the _Svelte_ baseline under the profile
   above and recorded the medians. AC9 sets Slice 0 thresholds _from the
   recaptured baseline_, so this measurement was the input, not a result.
2. **A3b (done 2026-08-27)** — applied the formula once, wrote each bound into
   the table below as a literal number, and froze it. No Next.js code existed at
   either step, so the candidate could not influence them.

A frozen bound is never rewritten. Exceeding one later is a decision that must be
recorded with its reason — the same rule this file already applies to weights.

### Frozen performance bounds

**Frozen 2026-08-27 from the A3a Svelte baseline.** Measured top-level at
1680x1072, 5 warm runs per route, median reported. Applying
`max(floor, median x 1.20)` to every route in the representative set:

| Route set                  | Metric                    | Baseline (worst route median)  | Frozen bound | Binds because                               |
| -------------------------- | ------------------------- | ------------------------------ | ------------ | ------------------------------------------- |
| Slice 0 representative set | LCP proxy                 | 1,068 ms (`/posts`)            | **2,500 ms** | floor — 1,068 x 1.20 = 1,282 ms is below it |
| Slice 0 representative set | CLS proxy                 | 0.000 (every route)            | **0.10**     | floor                                       |
| Slice 0 representative set | interaction latency proxy | 72 ms (deck, discrete presses) | **200 ms**   | floor — 72 x 1.20 = 86 ms is below it       |

The floor wins on all three, which means the site is comfortably inside the
"good" thresholds today and the bound cannot tighten below them by construction.

**Advisory per-route regression guard.** An absolute 2,500 ms bound cannot see a
route going from 244 ms to 2,400 ms, which would be a tenfold regression and a
pass. So the per-route `median x 1.20` figures are recorded as an advisory
guard: exceeding one is not a failure, it is a signal that something changed and
should be explained. The binding rule stays the frozen bound above; nothing here
loosens it.

| Route                                    | Baseline median | min | max   | Advisory guard (median x 1.20) |
| ---------------------------------------- | --------------- | --- | ----- | ------------------------------ |
| `/`                                      | 480 ms          | 340 | 512   | 576 ms                         |
| `/posts`                                 | 1,068 ms        | 916 | 1,464 | 1,282 ms                       |
| `/posts/giscus-sveltekit-integration`    | 864 ms          | 828 | 1,216 | 1,037 ms                       |
| `/ko/posts/giscus-sveltekit-integration` | 820 ms          | 784 | 1,064 | 984 ms                         |
| `/ko`                                    | 296 ms          | 276 | 316   | 355 ms                         |
| `/tags`                                  | 436 ms          | 416 | 452   | 523 ms                         |
| `/search`                                | 244 ms          | 236 | 276   | 293 ms                         |
| `/study/dsa-ii`                          | 304 ms          | 284 | 332   | 365 ms                         |
| `/system/3b`                             | 364 ms          | 328 | 396   | 437 ms                         |
| `/talks/my-career`                       | 864 ms          | 852 | 968   | 1,037 ms                       |

A frozen bound is never rewritten. Exceeding one later is a recorded decision
with its reason, not an automatic stop.

**Viewport coverage.** These bounds come from one viewport (1680x1072), for the
reason recorded under § Two constraints. Viewport-sensitive LCP — the largest
element differs at 390 px — is **not** covered by this baseline and is a named
gap, not an oversight.

### Accessibility rubric

Fixed before capture so a finding cannot be graded after the fact.

| Severity         | Definition                                                                                                        | Bound                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| critical         | A declared control is unreachable or inoperable by keyboard, or an interactive element exposes no accessible name | **zero permitted**                                               |
| serious          | A WCAG 2.1 AA criterion fails but the task remains completable — contrast, heading order, landmark gaps           | enumerated with an owner and a closing slice; never counted away |
| moderate / minor | Advisory                                                                                                          | recorded only                                                    |

Findings come from a Chrome accessibility-tree read plus a declared WCAG 2.1 AA
checklist, per route and per viewport.
