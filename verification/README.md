# Parity verification

Slice 0 of the Next.js migration. Nothing here is Next.js code; this is the
evidence apparatus every later slice is accepted against.

| Path                                      | What it is                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `baseline/svelte-34aa7e7.json`            | The SvelteKit baseline captured from a fresh production build          |
| `exception-ledger.json`                   | Approved differences. Closed format, empty until something is approved |
| `../scripts/migration-verify.ts`          | The comparator                                                         |
| `../scripts/migration-verify-controls.ts` | Its negative controls                                                  |

```bash
pnpm migration:capture    # rebuild the baseline from build/
pnpm migration:controls   # prove the harness fails closed
pnpm migration:verify compare verification/baseline/svelte-34aa7e7.json build
```

The baseline covers 366 pages, 4 site artifacts (`sitemap.xml`, `rss.xml`,
`ko/rss.xml`, `_redirects`), 344 Pagefind fragments, bundle weights, and the
**served HTTP status of every URL** — 366×200 plus deliberate misses returning
404, taken from a real static server over the build tree rather than inferred.
Captured at `main` HEAD `34aa7e7`.

**It is stable across rebuilds, and that was not free.** Two build-to-build
differences showed up as false positives before it was: the feeds carry a
`<lastBuildDate>`, and `404.html` embeds content-hashed `_app/immutable/*` URLs.
Feeds are now compared semantically (item counts, links, titles) and `404.html`
is compared as the page `/404` rather than as bytes. Two consecutive production
builds now compare with zero differences.

## What the harness does not check

Screenshots, keyboard flows, accessibility findings and performance
measurements. That is a boundary of what a build-artifact comparator can see,
not a gap to be closed in this file — those obligations are carried by separate
artifacts:

| Obligation          | Artifact                                             | Status                                                                                                                          |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| AC7 behavior matrix | [`./behavior-matrix.md`](./behavior-matrix.md)       | Captured 2026-08-27 for a declared 11-route representative set; every uncovered surface is inventoried there as a `pending` row |
| AC9 accessibility   | [`./thresholds-results.md`](./thresholds-results.md) | Measured — 0 critical findings, 1 serious enumerated with an owner                                                              |
| AC9 weight budgets  | [`./thresholds.md`](./thresholds.md)                 | Written; the candidate comparison is due at Slice 2                                                                             |
| AC9 Core Web Vitals | [`./thresholds-results.md`](./thresholds-results.md) | Measured 2026-08-27 — bounds frozen from the Svelte baseline, all ten routes pass; coverage is one viewport, stated there       |

Capture tooling lives in `../scripts/`: `serve-build.mjs` (loopback server plus
the `/__viewport` frame harness) and `capture/` (the probes injected into the
page, served at `/__probe/<name>.js` so the browser runs the tracked copy).
Screenshots are kept under `./screenshots/baseline-34aa7e7/` for the life of
this branch and are deleted at task archive with it.

Whitespace is normalized before the text of a page is hashed, so a Prettier
reflow is invisible to the comparator. The feed build timestamp is excluded for
the same reason. Both are deliberate — the alternative reports every formatting
run and every rebuild as a change — and controls 6 and 8 mark exactly where the
blindness starts, while controls 9 and 10 prove the feed and the 404 page are
still compared.

Twenty controls run via `pnpm migration:controls`, in two kinds that prove
opposite things. **Defect controls** (16) must exit 1: the harness rejects a
known-bad input. **Invariance controls** (4) must exit 0: the harness ignores a
benign change on purpose. Every invariance control is paired with a defect
control over the same surface, so a blindness can never be the only thing
proven about a field.
