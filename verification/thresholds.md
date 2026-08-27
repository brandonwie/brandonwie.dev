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

| Setting     | Value                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server      | `build/` served over loopback with the same resolution order as `scripts/migration-verify.ts` `resolveStatic()` — exact file, then `.html`, then `/index.html`, then `404.html` |
| Throttling  | none — no CPU throttle, no network throttle                                                                                                                                     |
| Cache       | warm (one discarded priming load per route before the recorded runs)                                                                                                            |
| Runs        | **5 per route per viewport**; median reported, min and max also recorded                                                                                                        |
| Viewports   | 390×844 (mobile), 820×1180 (tablet), 1440×900 (desktop)                                                                                                                         |
| Environment | Chrome version and OS version recorded per run block                                                                                                                            |

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

Ordering, so no bound is fitted to what it judges:

1. **A3a** — measure the _Svelte_ baseline under the fixed profile above and
   record the medians. AC9 sets Slice 0 thresholds _from the recaptured
   baseline_, so this measurement is the input, not a result.
2. **A3b** — apply the formula once, write each bound into the table below as a
   literal number, and freeze it. The Next.js candidate does not exist yet and
   cannot influence either step.

A frozen bound is never rewritten. Exceeding one later is a decision that must be
recorded with its reason — the same rule this file already applies to weights.

### Frozen performance bounds

**Status: BLOCKED — the floor is pinned, the baseline-derived half cannot be
measured in this environment.** The formula's lower half is a fixed number and is
frozen now. Its upper half needs A3a's Svelte medians, and A3a cannot run while
the tab never paints (constraint 2 above): the only paint entry this environment
produced was FCP = 33,456 ms on `/about`, which measures when the harness forced
a render, not the page. That number is discarded, not recorded.

| Route set                                             | Metric                    | Floor (frozen) | Baseline median | Effective bound          |
| ----------------------------------------------------- | ------------------------- | -------------- | --------------- | ------------------------ |
| Slice 0 representative set (see `behavior-matrix.md`) | LCP proxy                 | 2,500 ms       | blocked         | >= 2,500 ms, pending A3a |
| Slice 0 representative set                            | CLS proxy                 | 0.10           | blocked         | >= 0.10, pending A3a     |
| Slice 0 representative set                            | interaction latency proxy | 200 ms         | blocked         | >= 200 ms, pending A3a   |

Because the formula is `max(floor, median x 1.20)`, the floors above already
bind: a candidate worse than 2,500 ms / 0.10 / 200 ms fails whatever A3a
eventually measures. What is not yet known is whether the bound should be
_tighter_ than the floor — that is what the Svelte medians would decide.

**Slice 0 does not close on this half.**
[`./thresholds-results.md`](./thresholds-results.md) records the blocker, its
evidence, and the two ways to unblock it.

### Accessibility rubric

Fixed before capture so a finding cannot be graded after the fact.

| Severity         | Definition                                                                                                        | Bound                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| critical         | A declared control is unreachable or inoperable by keyboard, or an interactive element exposes no accessible name | **zero permitted**                                               |
| serious          | A WCAG 2.1 AA criterion fails but the task remains completable — contrast, heading order, landmark gaps           | enumerated with an owner and a closing slice; never counted away |
| moderate / minor | Advisory                                                                                                          | recorded only                                                    |

Findings come from a Chrome accessibility-tree read plus a declared WCAG 2.1 AA
checklist, per route and per viewport.
