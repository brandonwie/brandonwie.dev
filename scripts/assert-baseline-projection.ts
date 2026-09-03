/**
 * The committed baseline must be exactly the frozen measurement it claims to be.
 *
 *   pnpm migration:projection
 *
 * `verification/baseline/svelte-d06939c.json` is the evidence every candidate is
 * judged against, and `verification/README.md` says it may be rebuilt with
 * `pnpm migration:capture`. Rebuilding it is exactly where the evidence can be
 * lost, and once was: widening the capture with `articleMeta` and richer `<img>`
 * records meant re-running capture, and the re-run silently rewrote the `bundle`
 * block by three bytes — `jsBytes` -2, `cssBytes` -1 — because the SvelteKit
 * build is not byte-reproducible. Nothing caught it. `bundle` is RECORDED, not
 * compared (`migration-verify.ts` compares pages, site artifacts, statuses and
 * Pagefind, never bundle), so a re-capture can move the AC9 weight evidence in
 * `verification/thresholds.md` without a single test going red.
 *
 * The rule this file enforces has two modes, and the declared field lists below
 * select which one is live:
 *
 *   MEASUREMENT generation (both lists empty — the current state). The committed
 *   file must be BYTE-IDENTICAL to the blob the frozen tag pins. A fresh
 *   measurement is allowed; silently editing one afterwards is not.
 *
 *   PROJECTION generation (a list is non-empty). The committed file must be the
 *   frozen parent plus exactly the declared new or widened fields, grafted on —
 *   never re-captured. That is how generation 1 (`…svelte-34aa7e7.json`, tag
 *   `migration-baseline-svelte-34aa7e7-v1`) added `articleMeta` and widened
 *   `images`.
 *
 * Generation 2 was measured on 2026-09-03 after three expanded posts were
 * re-synced from 3B, a content change the frozen generation-1 blob could not
 * absorb by projection. The v1 tag is untouched and still holds that blob.
 *
 * Exit 0 = the committed baseline is what the frozen tag says it is. Exit 1 =
 * something else changed. Exit 2 = it could not run.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * The immutable tag for the last baseline captured by MEASUREMENT.
 *
 * The annotated tag points directly at the baseline blob so a squash merge
 * cannot make the evidence unreachable. It must never be retargeted: a future
 * measurement gets a new versioned tag.
 */
export const FROZEN_TAG_NAME = 'migration-baseline-svelte-d06939c-v1';
export const FROZEN_TAG = `refs/tags/${FROZEN_TAG_NAME}`;
export const FROZEN_OBJECT_ID = '0936496fad82b073d293e05a01d2d97b66ba8177';
export const FROZEN_SHA256 = '9c0f5eb1685d839b68aac118c99b125ad4803befc6cd44aa7adcea58fe88d769';
const BASELINE_PATH = 'verification/baseline/svelte-d06939c.json';

/**
 * Per-page fields the current generation is allowed to introduce or rewrite.
 *
 * Both empty: generation 2 is a MEASUREMENT, so nothing may differ from the
 * frozen blob at all. Generation 1 declared `articleMeta` as added and `images`
 * as widened; a future schema change repopulates these lists and the projection
 * mode below takes over again, with the same meaning it had then — a widened
 * field's parent value must survive verbatim as the leading segment.
 */
const ADDED_FIELDS: readonly string[] = [];
const WIDENED_FIELDS: readonly string[] = [];

interface Baseline {
	pages: Record<string, Record<string, unknown>>;
	[key: string]: unknown;
}

export type FrozenBaselineErrorCode =
	| 'tag-unavailable'
	| 'not-annotated-tag'
	| 'not-blob'
	| 'object-id-mismatch'
	| 'sha256-mismatch'
	| 'invalid-baseline';

export class FrozenBaselineError extends Error {
	constructor(
		readonly code: FrozenBaselineErrorCode,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = 'FrozenBaselineError';
	}
}

export interface FrozenBaselineOverrides {
	expectedObjectId?: string;
	expectedSha256?: string;
	readGitText?: (args: readonly string[]) => string;
	readBlob?: (objectId: string) => Buffer;
}

function gitText(args: readonly string[]): string {
	return execFileSync('git', [...args], {
		encoding: 'utf8',
		maxBuffer: 256 * 1024 * 1024,
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

function readGitBlob(objectId: string): Buffer {
	return execFileSync('git', ['cat-file', 'blob', objectId], {
		maxBuffer: 256 * 1024 * 1024,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
}

function requireBaseline(value: unknown): Baseline {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('frozen baseline JSON must be an object');
	}
	const pages = (value as { pages?: unknown }).pages;
	if (pages === null || typeof pages !== 'object' || Array.isArray(pages)) {
		throw new Error('frozen baseline JSON must contain a pages object');
	}
	return value as Baseline;
}

/**
 * @param frozenRef Annotated tag that must resolve to the pinned baseline blob.
 * @param overrides Test-only Git, blob, object-ID, and digest overrides.
 * @returns The parsed, verified frozen baseline.
 * @throws {FrozenBaselineError} With a stable code when declared tag, integrity, or baseline validation fails.
 * @throws {Error} When Git or blob I/O fails after the initial tag lookup.
 */
export function readFrozenBaseline(
	frozenRef: string = FROZEN_TAG,
	overrides: FrozenBaselineOverrides = {},
): Baseline {
	return readFrozenBaselineWithBytes(frozenRef, overrides).baseline;
}

/**
 * The same verification, returning the verified bytes alongside the parsed
 * baseline. The measurement mode compares bytes, so it needs the blob itself
 * rather than a re-serialisation of the parse.
 *
 * @param frozenRef Annotated tag that must resolve to the pinned baseline blob.
 * @param overrides Test-only Git, blob, object-ID, and digest overrides.
 * @returns The verified blob bytes and the parsed baseline.
 * @throws {FrozenBaselineError} With a stable code when declared tag, integrity, or baseline validation fails.
 */
export function readFrozenBaselineWithBytes(
	frozenRef: string = FROZEN_TAG,
	overrides: FrozenBaselineOverrides = {},
): { baseline: Baseline; bytes: Buffer } {
	const expectedObjectId = overrides.expectedObjectId ?? FROZEN_OBJECT_ID;
	const expectedSha256 = overrides.expectedSha256 ?? FROZEN_SHA256;
	const readGitText = overrides.readGitText ?? gitText;

	let refType: string;
	try {
		refType = readGitText(['cat-file', '-t', frozenRef]);
	} catch (error) {
		const recovery =
			frozenRef === FROZEN_TAG ? `; fetch it with \`git fetch origin tag ${FROZEN_TAG_NAME}\`` : '';
		throw new FrozenBaselineError('tag-unavailable', `${frozenRef} is unavailable${recovery}`, {
			cause: error,
		});
	}
	if (refType !== 'tag') {
		throw new FrozenBaselineError(
			'not-annotated-tag',
			`${frozenRef} must be an annotated tag, got ${refType}`,
		);
	}

	const objectId = readGitText(['rev-parse', '--verify', '--end-of-options', `${frozenRef}^{}`]);
	const objectType = readGitText(['cat-file', '-t', objectId]);
	if (objectType !== 'blob') {
		throw new FrozenBaselineError(
			'not-blob',
			`${frozenRef} must peel to a blob, got ${objectType}`,
		);
	}
	if (objectId !== expectedObjectId) {
		throw new FrozenBaselineError(
			'object-id-mismatch',
			`${frozenRef} peeled to ${objectId}, expected ${expectedObjectId}`,
		);
	}

	const blob = (overrides.readBlob ?? readGitBlob)(objectId);
	const sha256 = createHash('sha256').update(blob).digest('hex');
	if (sha256 !== expectedSha256) {
		throw new FrozenBaselineError(
			'sha256-mismatch',
			`${frozenRef} has SHA-256 ${sha256}, expected ${expectedSha256}`,
		);
	}

	try {
		return { baseline: requireBaseline(JSON.parse(blob.toString('utf8'))), bytes: blob };
	} catch (error) {
		throw new FrozenBaselineError(
			'invalid-baseline',
			`${frozenRef} does not contain a valid baseline: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
}

/**
 * @param baselinePath Baseline projection candidate path.
 * @param frozenRef Frozen annotated tag; explicit `undefined` selects the `FROZEN_TAG` default.
 * @param quiet Suppresses successful progress output, but not errors.
 * @param frozenOverrides Test-only frozen-baseline verification overrides.
 * @returns `0` when clean, `1` for a projection violation, or `2` for a frozen-baseline verification failure or when no page carries a declared added field.
 * @throws {Error} When reading, parsing, or traversing the candidate baseline fails.
 */
export function runProjection(
	baselinePath: string = BASELINE_PATH,
	frozenRef: string = FROZEN_TAG,
	quiet = false,
	frozenOverrides: FrozenBaselineOverrides = {},
): number {
	const say = (...parts: unknown[]): void => {
		if (!quiet) console.log(...parts);
	};
	let parent: Baseline;
	let parentBytes: Buffer;
	try {
		const frozen = readFrozenBaselineWithBytes(frozenRef, frozenOverrides);
		parent = frozen.baseline;
		parentBytes = frozen.bytes;
	} catch (error) {
		console.error(
			`FATAL: could not verify frozen baseline ${frozenRef}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 2;
	}
	const currentBytes = readFileSync(baselinePath);
	const current: Baseline = JSON.parse(currentBytes.toString('utf8'));

	const measurementMode = ADDED_FIELDS.length === 0 && WIDENED_FIELDS.length === 0;
	const failures: string[] = [];
	// In measurement mode the committed file IS the frozen blob. Bytes first:
	// the structural walk below still runs, because "3 bytes differ somewhere"
	// is not a reviewable finding on a 1.8 MB artifact.
	if (measurementMode && !currentBytes.equals(parentBytes)) {
		failures.push(
			`${baselinePath} is not byte-identical to ${frozenRef} ` +
				`(${currentBytes.length} bytes vs ${parentBytes.length}); this generation is a measurement, ` +
				`so the committed file may not differ from the frozen blob at all`,
		);
	}
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
		measurementMode
			? `measurement check of ${baselinePath} against ${frozenRef}: ${parentUrls.size} pages, ` +
					`${topKeys.size - 1} top-level field(s), ${currentBytes.length} bytes compared`
			: `projection of ${baselinePath} against ${frozenRef}: ${parentUrls.size} pages, ` +
					`${topKeys.size - 1} top-level field(s), ${addedCount} page(s) carrying new ${ADDED_FIELDS.join('/')}`,
	);
	// A projection generation can pass vacuously if the declared field is empty
	// everywhere; a measurement generation cannot, because it compares bytes
	// against an object this tree cannot edit.
	if (!measurementMode && addedCount === 0) {
		console.error(
			`FATAL: no page carries a non-empty ${ADDED_FIELDS.join('/')}; this check would pass on an unchanged file and prove nothing`,
		);
		return 2;
	}
	if (failures.length) {
		for (const line of failures.slice(0, 40)) console.error(`PROJECTION VIOLATION ${line}`);
		if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
		console.error(
			measurementMode
				? `RESULT: ${failures.length} violation(s) — the committed baseline is not the frozen measurement`
				: `RESULT: ${failures.length} violation(s) — the baseline was re-measured, not projected`,
		);
		return 1;
	}
	say(
		measurementMode
			? 'RESULT: the committed baseline is byte-identical to the frozen measurement'
			: 'RESULT: every parent field survives verbatim; only the declared fields are new',
	);
	return 0;
}

if (process.argv[1]?.endsWith('assert-baseline-projection.ts')) {
	process.exit(runProjection(process.argv[2] ?? BASELINE_PATH, process.argv[3] ?? FROZEN_TAG));
}
