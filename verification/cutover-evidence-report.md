# Cutover evidence report — Slice 5 → G4

The single document Brandon reviews for the G4 cutover gate. Every claim links
to its artifact; nothing here is narrative-only. Candidate under test:
`next/build` @ `64b6d19` (`feat/slice5-comparison`), compared against the
Svelte generation-6 baseline.

## Baseline identity (generation 6)

| Field         | Value                                                           |
| ------------- | --------------------------------------------------------------- |
| Source commit | `547a840` (production `main`, live canonical deploy `c2ab2f16`) |
| Baseline file | `verification/baseline/svelte-e23e808.json` (blob `dfea6e11`)   |
| Annotated tag | `migration-baseline-svelte-547a840-v2` (tag object `a13465850`) |

Note: the separate C3 resynchronization lane will re-key the baseline to
generation 7 when it resolves; this report's evidence is generation-6 keyed and
does not carry over verbatim.

## Evidence lanes

### AC2–AC6, C1–C13 — automated parity + exception ledger

- `pnpm migration:verify` (verify:next): **373 pages + 4 site artifacts, 0
  unapproved differences** against the generation-6 baseline.
- `verification/diff-classification-manifest.json`: 695 classified
  differences, 11 classes, 0 unclassified, rebuild-stable (`--check`).
- `verification/exception-ledger.json`: **1,071 approved rows** — all approved
  by Brandon 2026-09-19 (commit `72d4e4f` added the 695 permanent rows).
- Approved classes include KO-localization corrections, candidate-localized
  404, post-header redesign, nested Mermaid, CommonMark escaping, reading-time.
- Contracts C1–C13 closed under `verification/contracts/`; defect-control
  fixtures report expected `exit 1` and are green as controls.
- `pnpm migration:all` exit 0 at `d2827b4` and again at `3f3e4c0`.

### AC7 — behavior matrix

- `verification/behavior-matrix.md`: every pending row closed by the Slice 4
  captures — PR-C (`migration:browser:xyflow`: 17 nodes / 42 edges, hover dim,
  drill-down, KO copy) and PR-D (`migration:browser:ac7`: 12 study routes +
  deck, 3-viewport sweeps, K6/K7 deck keys, SlideVideo pause window, `?print`,
  `?page=N` restore, 39 screenshots).
- Keyboard flows K1–K8 green (palette open/filter/escape-restore, backspace
  nav, deck walk, reading-progress).

### AC8 — deployment isolation + rollback rehearsal

`verification/cutover-rehearsal.md` (executed 2026-09-19):

- Mechanism proven on isolated `brandonwie-dev-next`: R1
  `6efab272-511b-40e9-a106-9bccb069c85b` → R2 `ebe1e65a-9289-4de7-b8a3-c4910b3b9efa`
  → rollback → marker reads `R1`, canonical flipped back, `noindex` intact.
- `X-Robots-Tag: noindex` asserted (not assumed) on project URL, deployment-hash
  URL, and deep routes — injected via scratch `_headers`, never committed.
- Production `brandonwie-dev` probed read-only throughout; canonical stayed
  `c2ab2f16` @ `547a840`. Real rollback target recorded: `a385230f` @ `1a83ebd`.
- Production control plane settled: `pnpm run build` → `build`, branch `main`.
- Rehearsal project deleted; GET → 404.

### AC9 — thresholds

`verification/thresholds-results.md` (candidate section, measured @ `d2827b4`):

- PASS: total JS (5,375 KB ≤ 13,900), largest chunk (655,681 B ≤ 860 KB), CSS
  (194 KB ≤ 250), images (35.7 MB identical), LCP proxy ≤ 2,500 ms on all 10
  routes, CLS 0.000 ≤ 0.10, interaction ≤ 32 ms ≤ 200, accessibility 0
  critical / 0 serious.
- **Accepted overruns (Brandon, 2026-09-19):** HTML 56,321 KB vs 25,900 and
  total weight 216.8 MB vs 86 — driven by `.txt` RSC flight payloads (~116 MB)
  plus inline `__next_f` duplication. Follow-up:
  [issue #65](https://github.com/brandonwie/brandonwie.dev/issues/65).
- Lab proxies, not field CWV; environment deltas disclosed in the file.

### Manual comparison

`verification/manual-comparison.md` + `manual-comparison.json` + 108
screenshots (paired, 27 routes × 2 viewports × 2 builds):

- PASS on every surface: home, lists, post detail, tags, search, study (incl.
  KO), xyflow (17/42 identical), deck, document-shell routes, 404.
- All divergences trace to approved ledger classes (`ko/tags` lang correction,
  −2 locale-pair consolidation, post-header focusables).
- **F1 resolved pre-cutover (Brandon's call: fix, not accept):** the 404's
  server render (`/_not-found`) and client render (real unmatched URL)
  disagreed on the language toggle → hydration error #418. Fixed by threading
  `suppressLocaleToggle` through `SiteShell` → `SiteHeader` →
  `HeaderControls` → `LanguageToggle`; permanently guarded by
  `migration:browser:notfound` (0 errors + 0 toggles on `/404`,
  `/does-not-exist-xyz`, `/ko/does-not-exist`) plus defect controls NFC-01..03.
- **F2 open:** Giscus live-thread render is cross-origin — needs one human
  look on the local candidate, or accept iframe+src parity (C10 already
  asserted `data-term`+locale).

## Known accepted decisions and residual risks

| #   | Item                                                 | Status                                                                     |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| D1  | HTML + total-weight budget overruns                  | accepted 2026-09-19; mitigation tracked in #65                             |
| D2  | Candidate-localized 404 copy                         | approved ledger class                                                      |
| D3  | Post-header redesign (+3..+5 focusables)             | approved ledger class                                                      |
| D4  | KO localization corrections (`ko/tags` `lang`, etc.) | approved ledger class — baseline bugs corrected                            |
| F1  | 404 hydration error #418                             | resolved — `suppressLocaleToggle` fix + `migration:browser:notfound` guard |
| F2  | Giscus live thread                                   | **open — one human look or accept iframe parity**                          |
| R1  | Fresh `pages.dev` hash subdomain needs ~60 s for TLS | noted in rehearsal doc; relevant to Slice 6 verification timing            |
| R2  | C3 resync lane will re-key baseline to generation 7  | separate lane; do not carry this evidence verbatim                         |

## Gate

G4 is Brandon's explicit approval, recorded by him in
`verification/approvals/G4-cutover.md`. This report does not create or imply
that approval. Slice 6 production promotion runs only after it exists.
