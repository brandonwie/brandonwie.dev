/**
 * Study copy, read from the repository root rather than copied.
 *
 * Same rule as `system-snapshot.ts` and `content/social-feed.tsx`: shared
 * inputs stay at the root, imported across, until `next/` collapses into the
 * repository root.
 *
 * `src/lib/data/study.ts` is plain TypeScript — 2,710 lines of typed copy with
 * no Svelte import and no framework dependency — so it needs no port at all.
 * That is why its lines are excluded from the Slice 2 calibration: counting
 * them would flatter the rate with work nobody has to do.
 */
export * from '../../../src/lib/data/study';
