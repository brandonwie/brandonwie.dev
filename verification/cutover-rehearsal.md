# Cutover rehearsal — AC8

Evidence for `plan.md` AC8: preview/rehearsal deployment excluded from indexing,
production remaining on Svelte throughout, a demonstrated rollback target, and
recorded Cloudflare deployment IDs. Executed 2026-09-19 (all times UTC) against
candidate `64b6d19` (`feat/slice5-comparison`, build output `next/build`,
3,095 files / ~223 MB).

## Mechanism vs target split

Two separate claims, kept distinct per the approved plan:

- **Mechanism** — proven on isolated rehearsal project `brandonwie-dev-next`
  (created for this rehearsal, deleted afterward). Production-branch (`main`)
  deployments, marker-file content, `_headers` noindex, and the rollback
  control were exercised end to end.
- **Target** — the real production project `brandonwie-dev` was probed
  **read-only** (GET only). Its live deployment and previous production
  deployment are recorded below as the actual rollback coordinates for Slice 6.
  No write of any kind touched `brandonwie-dev`; its canonical deployment was
  `c2ab2f16` before and after the rehearsal.

Production served Svelte continuously throughout — the rehearsal wrote only to
`brandonwie-dev-next.pages.dev`.

## Credentials

Scoped API token `249ae685…` (Cloudflare Pages Edit, this account only),
delivered out-of-band at `~/.config/cloudflare/rehearsal-token`, read into
`CLOUDFLARE_API_TOKEN` per-command and never printed or committed.
`CLOUDFLARE_ACCOUNT_ID=a56da885a29191e912b0ea06eb789809` was set inline so
wrangler skipped the memberships lookup (a scoped token lacks
`User → Memberships → Read`). **Token should be revoked now that the rehearsal
is complete.**

## Rehearsal artifacts (scratch, never committed)

| Artifact             | Content                                                    |
| -------------------- | ---------------------------------------------------------- |
| `/tmp/rehearsal-r1/` | copy of `next/build` + `_headers` + `__rehearsal.txt` `R1` |
| `/tmp/rehearsal-r2/` | copy of `next/build` + `_headers` + `__rehearsal.txt` `R2` |
| `_headers` (both)    | `/*\n  X-Robots-Tag: noindex`                              |
| `__rehearsal.txt` R1 | `R1 2026-09-19T15:00:52Z`                                  |
| `__rehearsal.txt` R2 | `R2 2026-09-19T15:00:52Z`                                  |

The `_headers` injection is required because automatic `X-Robots-Tag: noindex`
applies to Pages **preview** deployments only; these are production-branch
deployments and would not carry it otherwise. Neither `_headers` nor the
markers exist in the repository or the production build.

## Timeline and deployment IDs

| Time (UTC)   | Action                                                                                                          | Result                                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~15:10:51    | `wrangler pages project create brandonwie-dev-next` (prod branch `main`)                                        | project created                                                                                                                                                       |
| ~15:11–15:12 | `wrangler pages deploy /tmp/rehearsal-r1 --branch=main`                                                         | **R1** `6efab272-511b-40e9-a106-9bccb069c85b`, env `Production`, `https://6efab272.brandonwie-dev-next.pages.dev` — 3,095 files                                       |
| ~15:12–15:14 | assertions R1 (below)                                                                                           | PASS                                                                                                                                                                  |
| ~15:13:02    | `wrangler pages deploy /tmp/rehearsal-r2 --branch=main`                                                         | **R2** `ebe1e65a-9289-4de7-b8a3-c4910b3b9efa`, env `Production`, `https://ebe1e65a.brandonwie-dev-next.pages.dev` — 1 file uploaded, 3,094 reused (content-addressed) |
| ~15:13       | assertions R2                                                                                                   | PASS                                                                                                                                                                  |
| ~15:14       | `POST /accounts/…/pages/projects/brandonwie-dev-next/deployments/6efab272-511b-40e9-a106-9bccb069c85b/rollback` | `success: true`, env `production` — the REST endpoint the dashboard "Roll back" control invokes                                                                       |
| ~15:14       | post-rollback assertions                                                                                        | marker `R1`, canonical `6efab272…`, `noindex` intact — PASS                                                                                                           |
| ~15:16       | `wrangler pages project delete brandonwie-dev-next`                                                             | deleted; subsequent GET → `404 8000007 Project not found`                                                                                                             |

Note: the per-deployment hash subdomain (`6efab272.…`) failed TLS for ~60 s
after first deploy while its certificate was provisioned; it served 200 +
`noindex` + `R1` on retry. Not a rollback hazard, but expect the same lag on
any fresh `pages.dev` subdomain during Slice 6.

## Assertions (all cache-busted: `?t=<ts>` + `Cache-Control: no-cache`)

| Stage          | URL                                                     | Marker                                                   | `X-Robots-Tag` | Status |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------- | -------------- | ------ |
| after R1       | `https://brandonwie-dev-next.pages.dev/`                | `R1 …`                                                   | `noindex`      | 200    |
| after R1       | `https://6efab272.brandonwie-dev-next.pages.dev/`       | `R1 …`                                                   | `noindex`      | 200    |
| after R1       | `…/about` and `…/ko` (deep routes, 308 → 200)           | —                                                        | `noindex`      | 200    |
| after R2       | `https://brandonwie-dev-next.pages.dev/__rehearsal.txt` | `R2 …`                                                   | `noindex`      | 200    |
| after R2       | `https://ebe1e65a.brandonwie-dev-next.pages.dev/`       | —                                                        | —              | 200    |
| after rollback | `https://brandonwie-dev-next.pages.dev/__rehearsal.txt` | `R1 …`                                                   | `noindex`      | 200    |
| after rollback | canonical deployment via GET project                    | `6efab272-511b-40e9-a106-9bccb069c85b`, env `production` | —              | —      |

Marker sequence **R1 → R2 → R1** on the project URL proves the rollback
restored the R1 deployment rather than a no-op — the two deploys carried
distinguishable content, and R1's `_headers` still applied after restore.

## Production project probe (read-only, `brandonwie-dev`)

| Field                          | Value                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `production_branch`            | `main`                                                                                                                                                 |
| `build_config.build_command`   | `pnpm run build`                                                                                                                                       |
| `build_config.destination_dir` | `build`                                                                                                                                                |
| `build_caching`                | enabled                                                                                                                                                |
| domains                        | `brandonwie.dev`, `www.brandonwie.dev`, `brandonwie-dev.pages.dev`                                                                                     |
| canonical (live) deployment    | `c2ab2f16-dc6e-4e58-b561-0c7b3ff7608c` — commit `547a840` (the tagged Svelte baseline), deployed 2026-09-18T14:27:31Z, trigger `github:push` on `main` |
| previous production deploy     | `a385230f-f57e-432e-b743-6f51ea1f9e44` — commit `1a83ebd` — the real Slice 6 rollback target                                                           |

This settles the plan's control-plane settlement gate: production builds with
`pnpm run build`, serves `build/`, and promotes on `main`.

## AC8 verdict

- Indexing exclusion on rehearsal deployments: **demonstrated** (`noindex`
  asserted on project URL, hash URL, and deep routes — not assumed).
- Production on Svelte throughout: **verified** (canonical `c2ab2f16` @
  `547a840` unchanged before and after; project probed read-only).
- Rollback target demonstrated: **mechanism proven** on `brandonwie-dev-next`
  (R1→R2→R1 marker sequence, canonical flip observed via API); **real target
  identified** as `a385230f` on `brandonwie-dev`.
- Deployment IDs recorded: R1 `6efab272-511b-40e9-a106-9bccb069c85b`, R2
  `ebe1e65a-9289-4de7-b8a3-c4910b3b9efa`, prod canonical `c2ab2f16-…`, prod
  rollback target `a385230f-…`.
- Rehearsal project `brandonwie-dev-next`: **deleted** (GET → 404), no
  residual public surface.

**AC8: satisfied for Slice 5.** Slice 6 promotion remains gated on G4.
