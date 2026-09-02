/**
 * Negative controls for the baseline projection check.
 *
 *   pnpm migration:projection:controls
 *
 * The projection check exists because a full re-capture moved `bundle` by three
 * bytes and nothing noticed. A check written in response to a specific defect
 * has to be shown catching that specific defect, so BP-01 reproduces it exactly:
 * `jsBytes` -2 and `cssBytes` -1.
 *
 *   DEFECT      the check MUST exit 1 (or 2 for a vacuity guard)
 *   INVARIANCE  the check MUST exit 0 on a change the projection permits
 *
 * Each control runs against a throwaway copy of the baseline under `tmp/`. The
 * committed file is never mutated, and the parent blob comes from an immutable
 * tag, so no control can "pass" by editing the thing it is measured against.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import {
	FROZEN_OBJECT_ID,
	FROZEN_TAG,
	FrozenBaselineError,
	readFrozenBaseline,
	runProjection,
	type FrozenBaselineErrorCode,
} from './assert-baseline-projection.ts';

interface Control {
	id: string;
	expect: 0 | 1 | 2;
	what: string;
	apply: (baseline: Record<string, never>) => void;
}

interface ResolverControl {
	id: string;
	expectCode: FrozenBaselineErrorCode;
	what: string;
	read: () => unknown;
}

const SOURCE = 'verification/baseline/svelte-34aa7e7.json';
const SCRATCH = 'tmp/projection-control.json';
const MISSING_TAG = 'refs/tags/migration-baseline-svelte-34aa7e7-missing-control';

/* eslint-disable @typescript-eslint/no-explicit-any */
const CONTROLS: Control[] = [
	{
		id: 'BP-01',
		expect: 1,
		what: 'the bundle weights drift by three bytes — the exact regression this check exists for',
		apply: (b: any) => {
			b.bundle.jsBytes -= 2;
			b.bundle.cssBytes -= 1;
		},
	},
	{
		id: 'BP-02',
		expect: 1,
		what: 'one page title is rewritten',
		apply: (b: any) => {
			b.pages['/about'].title = 'An Unapproved Rename';
		},
	},
	{
		id: 'BP-03',
		expect: 1,
		what: 'the Pagefind fragment count changes',
		apply: (b: any) => {
			b.pagefindEntries = (b.pagefindEntries ?? 0) + 1;
		},
	},
	{
		id: 'BP-04',
		expect: 1,
		what: 'a widened images entry no longer begins with the parent value',
		apply: (b: any) => {
			const url = Object.keys(b.pages).find((u: string) => b.pages[u].images.length > 0)!;
			b.pages[url].images[0] = `/elsewhere.png ${b.pages[url].images[0]}`;
		},
	},
	{
		id: 'BP-05',
		expect: 1,
		what: 'a served HTTP status changes',
		apply: (b: any) => {
			b.statuses['/about'] = 404;
		},
	},
	{
		id: 'BP-06',
		expect: 2,
		what: 'every articleMeta is emptied — the check must refuse to pass vacuously',
		apply: (b: any) => {
			for (const page of Object.values(b.pages) as any[]) page.articleMeta = [];
		},
	},
	{
		id: 'BP-07',
		expect: 0,
		what: 'articleMeta values differ — a NEW field is free to hold anything (paired with BP-06)',
		apply: (b: any) => {
			const url = Object.keys(b.pages).find((u: string) => b.pages[u].articleMeta.length > 0)!;
			b.pages[url].articleMeta = ['article:tag rewritten'];
		},
	},
	{
		id: 'BP-08',
		expect: 0,
		what: 'the widened part of an images entry changes — paired with BP-04',
		apply: (b: any) => {
			const url = Object.keys(b.pages).find((u: string) => b.pages[u].images.length > 0)!;
			b.pages[url].images[0] = `${b.pages[url].images[0]} extra=1`;
		},
	},
];
/* eslint-enable @typescript-eslint/no-explicit-any */

const MALFORMED_BLOB = Buffer.from('{"pages":', 'utf8');
const RESOLVER_CONTROLS: ResolverControl[] = [
	{
		id: 'BP-09',
		expectCode: 'tag-unavailable',
		what: 'the frozen baseline tag is missing',
		read: () => readFrozenBaseline(MISSING_TAG),
	},
	{
		id: 'BP-10',
		expectCode: 'not-annotated-tag',
		what: 'the frozen baseline ref is a commit instead of an annotated tag',
		read: () => readFrozenBaseline('HEAD'),
	},
	{
		id: 'BP-11',
		expectCode: 'object-id-mismatch',
		what: 'the frozen tag peels to an unexpected object ID',
		read: () => readFrozenBaseline(undefined, { expectedObjectId: '0'.repeat(40) }),
	},
	{
		id: 'BP-12',
		expectCode: 'sha256-mismatch',
		what: 'the frozen blob has an unexpected SHA-256 digest',
		read: () => readFrozenBaseline(undefined, { expectedSha256: '0'.repeat(64) }),
	},
	{
		id: 'BP-13',
		expectCode: 'invalid-baseline',
		what: 'the frozen blob is malformed JSON',
		read: () =>
			readFrozenBaseline(undefined, {
				expectedSha256: createHash('sha256').update(MALFORMED_BLOB).digest('hex'),
				readBlob: () => MALFORMED_BLOB,
			}),
	},
	{
		id: 'BP-14',
		expectCode: 'not-blob',
		what: 'the frozen tag peels to a non-blob object',
		read: () =>
			readFrozenBaseline(undefined, {
				readGitText: (args) => {
					if (
						args.length === 3 &&
						args[0] === 'cat-file' &&
						args[1] === '-t' &&
						args[2] === FROZEN_TAG
					)
						return 'tag';
					if (
						args.length === 4 &&
						args[0] === 'rev-parse' &&
						args[1] === '--verify' &&
						args[2] === '--end-of-options' &&
						args[3] === `${FROZEN_TAG}^{}`
					)
						return FROZEN_OBJECT_ID;
					if (
						args.length === 3 &&
						args[0] === 'cat-file' &&
						args[1] === '-t' &&
						args[2] === FROZEN_OBJECT_ID
					)
						return 'commit';
					throw new Error(`unexpected git command: ${JSON.stringify(args)}`);
				},
			}),
	},
];

function resolverErrorCode(read: () => unknown): FrozenBaselineErrorCode | undefined {
	try {
		read();
		return undefined;
	} catch (error) {
		return error instanceof FrozenBaselineError ? error.code : undefined;
	}
}

function main(): number {
	if (!existsSync(SOURCE)) {
		console.error(`FATAL: baseline not found: ${SOURCE}`);
		return 2;
	}
	mkdirSync('tmp', { recursive: true });

	const failures: string[] = [];
	let frozenPages: Record<string, unknown>[];
	try {
		frozenPages = Object.values(readFrozenBaseline().pages);
	} catch (error) {
		console.error(
			`FATAL: could not read the frozen baseline: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 2;
	}
	const frozenPageCount = frozenPages.length;
	const articleMetaCount = frozenPages.filter((page) => 'articleMeta' in page).length;
	const frozenInvariantOk = frozenPageCount === 366 && articleMetaCount === 0;
	if (!frozenInvariantOk) {
		failures.push(
			`live frozen baseline: ${frozenPageCount} pages and ${articleMetaCount} page(s) with articleMeta; expected 366 and 0`,
		);
	}
	console.log(
		`${frozenInvariantOk ? 'PASS' : 'FAIL'}  INVARIANCE  live frozen baseline has ${frozenPageCount} pages and ${articleMetaCount} page(s) with articleMeta (expected 366 and 0)`,
	);

	const clean = runProjection(SOURCE, undefined, true);
	console.log(`BASELINE  committed file unmodified -> exit ${clean} (expected 0)`);
	if (clean !== 0) {
		console.error('FATAL: the committed baseline is not a clean projection; fix that first');
		return 1;
	}

	for (const control of RESOLVER_CONTROLS) {
		const code = resolverErrorCode(control.read);
		const ok = code === control.expectCode;
		if (!ok)
			failures.push(
				`${control.id} ${control.what}: error code ${code ?? 'none/untyped'}, expected ${control.expectCode}`,
			);
		console.log(
			`${ok ? 'PASS' : 'FAIL'}  ${control.id}  error ${code ?? 'none/untyped'} (expected ${control.expectCode})  ${control.what}`,
		);
	}
	const adapterExit = runProjection(SOURCE, MISSING_TAG, true);
	const adapterOk = adapterExit === 2;
	if (!adapterOk) {
		failures.push(`BP-15 missing-tag resolver adapter: exit ${adapterExit}, expected 2`);
	}
	console.log(
		`${adapterOk ? 'PASS' : 'FAIL'}  BP-15  exit ${adapterExit} (expected 2)  resolver errors map to the CLI cannot-run exit`,
	);

	for (const control of CONTROLS) {
		copyFileSync(SOURCE, SCRATCH);
		const before = readFileSync(SCRATCH, 'utf8');
		const mutated = JSON.parse(before);
		control.apply(mutated);
		const after = `${JSON.stringify(mutated, null, 2)}\n`;
		writeFileSync(SCRATCH, after);
		// A mutation that changed nothing turns the control into a coincidence.
		if (before === after) {
			failures.push(`${control.id} ${control.what}: the mutation changed nothing`);
			console.log(`FAIL  ${control.id}  NO-OP MUTATION  ${control.what}`);
			continue;
		}
		const code = runProjection(SCRATCH, undefined, true);
		const ok = code === control.expect;
		if (!ok)
			failures.push(`${control.id} ${control.what}: exit ${code}, expected ${control.expect}`);
		console.log(
			`${ok ? 'PASS' : 'FAIL'}  ${control.id}  exit ${code} (expected ${control.expect})  ${control.what}`,
		);
	}
	rmSync(SCRATCH, { force: true });

	const controlCount = RESOLVER_CONTROLS.length + CONTROLS.length + 2;
	console.log(`\n${controlCount} controls over the projection rule`);
	if (failures.length) {
		for (const line of failures) console.error(`CONTROL FAILED ${line}`);
		console.error(`RESULT: ${failures.length}/${controlCount} control(s) failed`);
		return 1;
	}
	console.log(`RESULT: ${controlCount}/${controlCount} controls behaved as specified`);
	return 0;
}

process.exit(main());
