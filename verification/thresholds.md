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
