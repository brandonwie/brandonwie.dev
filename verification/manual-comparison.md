# Manual comparison — Slice 5

The human-eyes layer of the AC7 matrix / Slice 5 comparison: paired probe +
screenshot captures of the Svelte baseline (`build/`, tagged `547a840` lineage)
and the Next candidate (`next/build` @ `64b6d19`), served locally — never
production. Facts in `manual-comparison.json`, JPEG pairs in
`screenshots/manual-compare/{baseline,candidate}/<route>@<vp>.jpg` (54 per side:
27 routes × 1440x900 + 390x844). Driver: `scripts/capture/manual-compare.mjs`,
same dependency-free CDP harness as the AC7/AC9 captures.

Captured 2026-09-19 — headless Chrome 153, Node v24.21.0, loopback, no
throttling. Numbers are the probe's own DOM reads; "identical" claims below are
backed by the JSON, not the screenshots.

## Per-surface verdicts

| Surface                      | Routes probed                                                             | Result | Evidence                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Home EN/KO                   | `/`, `/ko`                                                                | PASS   | identical `lang`/`h1`/img counts (10, 0 missing alt); screenshots match modulo the candidate's subtle grid background                                                                                                    |
| Lists                        | `/posts`, `/ko/posts`                                                     | PASS   | 167 card images both sides, 0 missing `alt`                                                                                                                                                                              |
| Post detail + comments shell | `/posts/giscus-sveltekit-integration` + KO twin                           | PASS¹  | 4 `pre` blocks both; giscus iframe `src` identical modulo origin (`term`/`lang`/`repo` params preserved); ¹thread render flagged below                                                                                   |
| Post detail + Mermaid        | `/posts/ai-code-review-patterns` + KO twin                                | PASS   | baseline `mermaid-container` → 1 rendered svg; candidate renders `svg#mermaid-…` with identical flowchart content (verified by direct DOM inspection after the probe's class-based selector missed the id-marked markup) |
| Tags EN/KO                   | `/tags`, `/ko/tags`                                                       | PASS   | `/ko/tags` `lang=ko` + h1 `태그` — the **approved C13 correction** (baseline shipped `lang="en"` there; ledger `ea1ff0e0…`)                                                                                              |
| Search EN/KO                 | `/search`, `/ko/search`                                                   | PASS   | pagefind UI present both; functional search covered by `migration:browser:search`                                                                                                                                        |
| Study index + detail EN/KO   | `/study`, `/ko/study`, `/study/dsa-i`, `/ko/study/dsa-i`, `/study/dsa-iv` | PASS   | localized h1s match; mobile pair eyeballed — same accordion/cards, no overflow                                                                                                                                           |
| `@xyflow` graph EN/KO        | `/system`, `/system/3b`, `/ko/system/3b`                                  | PASS   | **17 nodes / 42 edges on both stacks** after hydration mount — matches the PR-C probe                                                                                                                                    |
| Deck                         | `/talks/my-career`                                                        | PASS   | slide chrome + counter `1 / 20` render; key walks covered by `migration:browser:ac7` K-rows                                                                                                                              |
| Document-shell surfaces      | `/about`, `/ko/about`, `/contact`, `/projects`, `/feed`                   | PASS   | all render; shell diffs are the approved C13 prefetch/`lang` classes                                                                                                                                                     |
| 404                          | `/404` (+ runtime `/does-not-exist-xyz`, `/ko/does-not-exist`)            | PASS   | copy diff is ledger-approved (baseline capture was the empty pre-hydration frame); F1 fixed — `migration:browser:notfound` asserts 0 errors + 0 toggles on all three paths                                               |

## Cross-cutting observations

- **No horizontal overflow anywhere** — `scrollW` 1432/1440 identical on all 27
  routes at 1440, and the 390px shots show none.
- **Uniform focusables delta of −2** on every page: the baseline carries an
  extra `en`/`ko` anchor pair (a second locale control) that the candidate
  consolidates into the single `EN/KR` toggle. Consistent with the approved
  shell/nav consolidation classes — recorded here so the number is explained,
  not just observed.
- **Post pages are net +3 to +5 focusables** — the approved post-header
  redesign adds share/back controls.
- **Zero candidate console errors on 27/27 routes post-F1-fix** (26/27 at
  capture; the 27th was F1, now fixed). The baseline itself emits two errors
  the candidate does not (`deck`: Svelte `$set` unhandled rejection; `/404`:
  `Not found: /404` log) — the candidate is quieter, not noisier.

## Findings flagged for Brandon

| #   | Finding                                                                | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Asks                                                                                             |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| F1  | ~~**React hydration error #418 on every candidate 404**~~ **RESOLVED** | Root cause: `404.html` renders with pathname `/_not-found` (in `ENGLISH_ONLY_PREFIXES` → no toggle), while the client hydrates with the real unmatched URL (`hasLocaleVariant` → true → toggle mounts → DOM mismatch). Fixed by threading `suppressLocaleToggle` from `global-not-found.tsx`/`global-error.tsx` through `SiteShell` → `SiteHeader` → `HeaderControls` → `LanguageToggle`; both renders now agree on the no-toggle output. Guarded by `migration:browser:notfound` (NF-01..03: 0 errors + 0 toggles on `/404`, `/does-not-exist-xyz`, `/ko/does-not-exist`) and its controls (NFC-01..03). `manual-comparison.json` retains the pre-fix capture. | Brandon chose fix-before-cutover; done                                                           |
| F2  | **Giscus live-thread render is cross-origin**                          | iframe mounts on both builds with identical `src` (`term=<slug>`, `lang` per locale, `repo`, `theme=dark_dimmed`, `inputPosition=top`). The DOM probe cannot assert the thread's rendered content inside the frame. C10 already asserted `data-term`=slug + one-thread-per-locale at build time.                                                                                                                                                                                                                                                                                                                                                                | One human look at a post's comments in a real browser, or accept iframe+src parity as sufficient |

## Verdict

Manual layer: **PASS** — F1 resolved pre-cutover with a permanent regression
guard (`migration:browser:notfound`); F2 awaits one human look at the local
candidate. Everything else matches the baseline or sits inside an
already-approved ledger class.
