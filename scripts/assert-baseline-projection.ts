/**
 * The frozen baseline is a PROJECTION of its parent, not a re-measurement.
 *
 *   pnpm migration:projection
 *
 * `verification/baseline/svelte-34aa7e7.json` is the evidence every candidate
 * is judged against, and `verification/README.md` says it may be rebuilt with
 * `pnpm migration:capture`. Rebuilding it is exactly where the evidence can be
 * lost, and once was: widening the capture with `articleMeta` and richer
 * `<img>` records meant re-running capture, and the re-run silently rewrote the
 * `bundle` block by three bytes — `jsBytes` -2, `cssBytes` -1 — because the
 * SvelteKit build is not byte-reproducible. Nothing caught it. `bundle` is
 * RECORDED, not compared (`migration-verify.ts` compares pages, site artifacts,
 * statuses and Pagefind, never bundle), so a full re-capture can move the AC9
 * weight evidence in `verification/thresholds.md` without a single test going
 * red.
 *
 * The fix is a rule, and this file is the rule: when the SCHEMA widens, graft
 * the new fields onto the parent blob and change nothing else. This asserts
 * that graft against the parent read straight out of git, so the claim survives
 * the session that made it.
 *
 * Exit 0 = the committed baseline is the parent plus exactly the declared new
 * fields. Exit 1 = something else changed. Exit 2 = it could not run.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * The last commit that captured the baseline by MEASUREMENT.
 *
 * Every commit after it must be a projection. Moving this ref is a deliberate
 * act that re-measures the site, and it belongs in a commit that says so.
 */
const FROZEN_REF = 'b4af9cb';
const BASELINE_PATH = 'verification/baseline/svelte-34aa7e7.json';

/**
 * Per-page fields this projection is allowed to introduce or rewrite.
 *
 * `articleMeta` did not exist in the parent. `images` did, in a two-part form;
 * the widened record is a superset whose first segment must still be the parent
 * value exactly, which is checked below rather than waved through.
 */
const ADDED_FIELDS = ['articleMeta'] as const;
const WIDENED_FIELDS = ['images'] as const;

interface Baseline {
	pages: Record<string, Record<string, unknown>>;
	[key: string]: unknown;
}

export function runProjection(
	baselinePath: string = BASELINE_PATH,
	frozenRef: string = FROZEN_REF,
	quiet = false,
): number {
	const say = (...parts: unknown[]): void => {
		if (!quiet) console.log(...parts);
	};
	let parent: Baseline;
	try {
		parent = JSON.parse(
			execFileSync('git', ['show', `${frozenRef}:${BASELINE_PATH}`], {
				encoding: 'utf8',
				maxBuffer: 256 * 1024 * 1024,
			}),
		);
	} catch (error) {
		console.error(
			`FATAL: could not read ${BASELINE_PATH} at ${frozenRef}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 2;
	}
	const current: Baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

	const failures: string[] = [];
	const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

	// --- every top-level field except `pages`, `bundle` included --------------
	const topKeys = new Set([...Object.keys(parent), ...Object.keys(current)]);
	for (const key of [...topKeys].sort()) {
		if (key === 'pages') continue;
		if (!same(parent[key], current[key])) {
			failures.push(
				`top-level \`${key}\` changed: ${JSON.stringify(parent[key])?.slice(0, 160)} -> ${JSON.stringify(current[key])?.slice(0, 160)}`,
			);
		}
	}

	// --- the page set ---------------------------------------------------------
	const parentUrls = new Set(Object.keys(parent.pages));
	const currentUrls = new Set(Object.keys(current.pages));
	for (const url of [...parentUrls].sort())
		if (!currentUrls.has(url)) failures.push(`page ${url} dropped`);
	for (const url of [...currentUrls].sort())
		if (!parentUrls.has(url)) failures.push(`page ${url} added`);

	// --- every page field -----------------------------------------------------
	let addedCount = 0;
	for (const url of [...parentUrls].filter((u) => currentUrls.has(u)).sort()) {
		const before = parent.pages[url];
		const after = current.pages[url];
		const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
		for (const key of [...keys].sort()) {
			if ((ADDED_FIELDS as readonly string[]).includes(key)) {
				if (key in before)
					failures.push(`${url}: \`${key}\` was supposed to be NEW but exists in the parent`);
				else if (Array.isArray(after[key]) && (after[key] as unknown[]).length > 0) addedCount += 1;
				continue;
			}
			if ((WIDENED_FIELDS as readonly string[]).includes(key)) {
				// The parent's value must survive verbatim as the leading segment of
				// each widened entry. A widening that rewrote what was already there
				// would be a re-measurement wearing a schema change's clothes.
				const oldEntries = (before[key] ?? []) as string[];
				const newEntries = (after[key] ?? []) as string[];
				if (oldEntries.length !== newEntries.length) {
					failures.push(
						`${url}: \`${key}\` has ${newEntries.length} entries, parent had ${oldEntries.length}`,
					);
					continue;
				}
				for (const [i, oldEntry] of oldEntries.entries()) {
					if (!newEntries[i].startsWith(oldEntry)) {
						failures.push(
							`${url}: \`${key}\`[${i}] no longer begins with the parent value ${JSON.stringify(oldEntry)}`,
						);
					}
				}
				continue;
			}
			if (!same(before[key], after[key])) {
				failures.push(`${url}: \`${key}\` changed`);
			}
		}
	}

	say(
		`projection of ${baselinePath} against ${frozenRef}: ${parentUrls.size} pages, ` +
			`${topKeys.size - 1} top-level field(s), ${addedCount} page(s) carrying new ${ADDED_FIELDS.join('/')}`,
	);
	if (addedCount === 0) {
		console.error(
			`FATAL: no page carries a non-empty ${ADDED_FIELDS.join('/')}; this check would pass on an unchanged file and prove nothing`,
		);
		return 2;
	}
	if (failures.length) {
		for (const line of failures.slice(0, 40)) console.error(`PROJECTION VIOLATION ${line}`);
		if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
		console.error(
			`RESULT: ${failures.length} violation(s) — the baseline was re-measured, not projected`,
		);
		return 1;
	}
	say('RESULT: every parent field survives verbatim; only the declared fields are new');
	return 0;
}

if (process.argv[1]?.endsWith('assert-baseline-projection.ts')) {
	process.exit(runProjection(process.argv[2] ?? BASELINE_PATH, process.argv[3] ?? FROZEN_REF));
}
