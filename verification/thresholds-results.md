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

## Performance (LCP / CLS / interaction latency) — BLOCKED, not measured

**No number is reported here, because no honest number could be produced in this
environment.**

The automation surface never makes the tab visible: `document.visibilityState`
reads `"hidden"` on every tab, including a freshly created one. Chrome does not
paint a page it never displays, so:

- `performance.getEntriesByType('paint')` is **empty** after a completed
  navigation — `domContentLoadedEventEnd` was 58–89 ms on the same loads,
  so the document parsed fine; it simply never rendered.
- `requestAnimationFrame` **never fires**: a callback registered with an 800 ms
  window did not run, twice, on a fully loaded page.
- Forcing a render with a screenshot does produce entries — and produced
  **FCP = 33,456 ms** on `/about`, which is the delay until the screenshot was
  taken, not the page's speed. A metric whose value is set by when the harness
  chose to look is not a measurement.

`thresholds.md` pins the bounds (LCP ≤ 2,500 ms, CLS ≤ 0.10, interaction
latency ≤ 200 ms, each `max(good threshold, baseline median × 1.20)`), the
capture profile, and the algorithms. What is missing is a browser that renders.

**To unblock, one of:**

1. A Chrome session where the automated tab is genuinely foreground and visible,
   then run the A3a capture unchanged — 5 runs per route per viewport, median
   reported with min and max.
2. An authorized headless measurement tool run against the same loopback server
   (Lighthouse would do it, and would supply CLS and LCP with the standard
   algorithms). This adds a dependency and needs an explicit decision, which is
   why it was not taken unilaterally.

Until then AC9's performance half is **open**, and Slice 0 does not close on it.
The accessibility half above is measured and passing.

## Slice 0 status against AC9

| Half                     | Status                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Accessibility thresholds | MEASURED — 0 critical, 1 serious enumerated                                            |
| Weight budgets           | WRITTEN, candidate comparison due at Slice 2                                           |
| Core Web Vitals proxies  | **BLOCKED** — environment cannot paint; bounds are written and frozen, results are not |
