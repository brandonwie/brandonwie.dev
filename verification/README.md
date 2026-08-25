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

The baseline covers 366 pages, 5 site artifacts (`sitemap.xml`, `rss.xml`,
`ko/rss.xml`, `_redirects`, `404.html`) and 344 Pagefind fragments, captured at
`main` HEAD `34aa7e7`.

## What the harness does not check

Screenshots, keyboard flows, accessibility findings and performance
measurements. `plan.md` § Slice 0 lists them in the baseline; they need browser
automation this repository does not have, and adding that dependency is a
decision rather than an implementation detail. They are AC7 and AC9 obligations
and are open, not dropped.

Whitespace is normalized before the text of a page is hashed, so a Prettier
reflow is invisible to the comparator. That is deliberate — the alternative
reports every formatting run as a content change — and control 6 exists to mark
exactly where that blindness starts.
