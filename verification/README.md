# Parity verification

Slice 0 of the Next.js migration. Nothing here is Next.js code; this is the
evidence apparatus every later slice is accepted against.

| Path                                      | What it is                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `baseline/svelte-d06939c.json`            | The SvelteKit baseline captured from a fresh production build          |
| `exception-ledger.json`                   | Approved differences. Closed format, empty until something is approved |
| `../scripts/migration-verify.ts`          | The comparator                                                         |
| `../scripts/migration-verify-controls.ts` | Its negative controls                                                  |

```bash
pnpm migration:capture    # RE-MEASURE the baseline from build/ -- see the rule below
pnpm migration:controls   # prove the harness fails closed
pnpm migration:projection # prove the committed baseline is exactly the frozen measurement
pnpm migration:verify compare verification/baseline/svelte-d06939c.json build
```

**Widening the schema is a projection, never a re-capture.** When a new field is
added to `PageFields`, graft it onto the committed baseline and change nothing
else. Do not run `migration:capture` to get it: the SvelteKit build is not
byte-reproducible, and a re-capture rewrites the `bundle` block — it moved by
three bytes once and nothing caught it, because `bundle` is RECORDED rather than
compared and the AC9 weight evidence in
[`./thresholds.md`](./thresholds.md) reads it. `pnpm migration:projection`
enforces the rule against the frozen blob, and
`pnpm migration:projection:controls` proves it catches exactly that drift.

**A production content change is the one thing a projection cannot absorb**, and
then the answer is a new measured generation with its own immutable tag — never
an edit to an existing one. Generation 2 exists because three expanded posts
were re-synced from 3B on 2026-09-03.

## Frozen measurement source

The current generation is **2**. The annotated tag
`migration-baseline-svelte-d06939c-v1` points directly to blob
`0936496fad82b073d293e05a01d2d97b66ba8177`. Its tag message records the source
path `verification/baseline/svelte-d06939c.json` and SHA-256
`9c0f5eb1685d839b68aac118c99b125ad4803befc6cd44aa7adcea58fe88d769`.

Because this generation is a MEASUREMENT rather than a projection,
`migration:projection` requires the committed file to be byte-identical to that
blob; the declared added/widened field lists in `assert-baseline-projection.ts`
are empty, and repopulating them switches the check back to projection mode for
the next schema widening.

`migration:projection` fails closed unless the ref is an annotated tag that
peels to a blob with that exact object ID and digest and contains valid baseline
JSON. Never retarget or delete a generation tag. A future measurement must
create a new versioned tag. CI therefore keeps `fetch-depth: 0` so fresh
checkouts receive them. An existing clone that predates a tag must fetch it
once:

```bash
git fetch origin tag migration-baseline-svelte-d06939c-v1
```

### Generation 1 (superseded, still reachable)

`migration-baseline-svelte-34aa7e7-v1` → blob
`aad4ec1e0e25156778c3695d82bf9bf3c12b6fcb`, source commit
`b4af9cb8a29532a94d976831c73602c8770cee3b`, source path
`verification/baseline/svelte-34aa7e7.json`, SHA-256
`bb7231e83f057f204259164d78a43e00a76f38aa795625a9bd63590df2907fae`. That file is
no longer in the tree; the tag is the archive, which is why it points at the
blob rather than a commit:

```bash
git cat-file blob aad4ec1e0e25156778c3695d82bf9bf3c12b6fcb > /tmp/svelte-34aa7e7.json
```

Generation 1 was captured at `main` HEAD `34aa7e7`, and the AC7/AC9 records that
cite that commit — [`./behavior-matrix.md`](./behavior-matrix.md),
[`./thresholds.md`](./thresholds.md),
[`./thresholds-results.md`](./thresholds-results.md) — are historical
measurements against it and are deliberately left as they were.

The measured delta from generation 1 to 2 is 36 comparator rows: 18 post-page
rows (`text`, `jsonLd`, `articleMeta` on three EN/KO post pairs), 16
listing-page rows (`/`, `/posts`, `/tags` and their `/ko` twins, reordered
because `updated` moved), and 2 RSS artifact rows. The page set (366), served
statuses, Pagefind fragment count (344) and the `sitemap.xml` and `_redirects`
hashes are unchanged. Outside what the comparator compares, `bundle` moved:
`htmlBytes` +6734, `jsBytes` +5199, `totalBytes` +16153, with `fileCount`,
`cssBytes` and `imageBytes` identical.

The baseline covers 366 pages, 4 site artifacts (`sitemap.xml`, `rss.xml`,
`ko/rss.xml`, `_redirects`), 344 Pagefind fragments, bundle weights, and the
**served HTTP status of every URL** — 366×200 plus deliberate misses returning
404, taken from a real static server over the build tree rather than inferred.
Captured from the build of content commit `d06939c`.

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

Forty controls run via `pnpm migration:controls`, in two kinds that prove
opposite things. **Defect controls** (30) must exit 1: the harness rejects a
known-bad input. **Invariance controls** (10) must exit 0: the harness ignores a
benign change on purpose. Every invariance control is paired with a defect
control over the same surface, so a blindness can never be the only thing
proven about a field.
