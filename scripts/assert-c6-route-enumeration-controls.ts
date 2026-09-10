/**
 * Negative controls for C6 route enumeration (`scripts/assert-c6-route-enumeration.ts`).
 *
 * Every DEFECT control must exit 1 on known-bad input.
 * Every INVARIANCE control must exit 0 on benign changes.
 */
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	truncateSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	DEFAULT_BASELINE_PATH,
	DEFAULT_CANDIDATE_DIR,
	runC6Assertions,
} from './assert-c6-route-enumeration.ts';

type Kind = 'DEFECT' | 'INVARIANCE';

interface Control {
	id: string;
	kind: Kind;
	what: string;
	setup: (tempCandidate: string, tempBaseline: string) => void;
}

const CONTROLS: Control[] = [
	{
		id: 'C6-C00',
		kind: 'INVARIANCE',
		what: 'an untouched candidate passes exit 0',
		setup: () => {},
	},
	{
		id: 'C6-C01',
		kind: 'DEFECT',
		what: 'a post route is missing from candidate output',
		setup: (tempCandidate) => {
			const target = join(tempCandidate, 'posts/giscus-sveltekit-integration.html');
			if (existsSync(target)) rmSync(target);
		},
	},
	{
		id: 'C6-C02',
		kind: 'DEFECT',
		what: 'a static page is missing from candidate output',
		setup: (tempCandidate) => {
			const target = join(tempCandidate, 'about.html');
			if (existsSync(target)) rmSync(target);
		},
	},
	{
		id: 'C6-C03',
		kind: 'DEFECT',
		what: 'a Korean static page is missing from candidate output',
		setup: (tempCandidate) => {
			const target = join(tempCandidate, 'ko/about.html');
			if (existsSync(target)) rmSync(target);
		},
	},
	{
		id: 'C6-C04',
		kind: 'DEFECT',
		what: 'an exported route file is 0 bytes',
		setup: (tempCandidate) => {
			const target = join(tempCandidate, 'projects.html');
			if (existsSync(target)) truncateSync(target, 0);
		},
	},
	{
		id: 'C6-C05',
		kind: 'DEFECT',
		what: 'the baseline page total is mutated away from 366',
		setup: (_tempCandidate, tempBaseline) => {
			const baseline = JSON.parse(readFileSync(tempBaseline, 'utf8'));
			delete baseline.pages['/'];
			writeFileSync(tempBaseline, JSON.stringify(baseline));
		},
	},
	{
		id: 'C6-C06',
		kind: 'INVARIANCE',
		what: 'route path checks normalize directory paths with trailing slash',
		setup: () => {},
	},
];

export function runC6Controls(): { total: number; passed: number; failed: number } {
	let passed = 0;
	let failed = 0;

	console.log('--- migration:c6:controls');

	for (const control of CONTROLS) {
		const scratchDir = mkdtempSync(join(tmpdir(), 'c6-ctrl-'));
		const tempCandidate = join(scratchDir, 'candidate');
		const tempBaseline = join(scratchDir, 'baseline.json');

		try {
			cpSync(DEFAULT_CANDIDATE_DIR, tempCandidate, { recursive: true });
			cpSync(DEFAULT_BASELINE_PATH, tempBaseline);

			control.setup(tempCandidate, tempBaseline);

			const result = runC6Assertions({
				candidateDir: control.id === 'C6-C06' ? tempCandidate + '/' : tempCandidate,
				baselinePath: tempBaseline,
			});

			const expectedExit = control.kind === 'DEFECT' ? 1 : 0;
			const ok = result.exitCode === expectedExit;

			if (ok) {
				passed++;
				console.log(
					`PASS  ${control.id}  ${control.kind.padEnd(10)} exit ${result.exitCode} (expected ${expectedExit})  ${control.what}`,
				);
			} else {
				failed++;
				console.error(
					`FAIL  ${control.id}  ${control.kind.padEnd(10)} exit ${result.exitCode} (expected ${expectedExit})  ${control.what}`,
				);
			}
		} finally {
			rmSync(scratchDir, { recursive: true, force: true });
		}
	}

	console.log(`\n${CONTROLS.length} controls: ${passed} passed, ${failed} failed`);
	return { total: CONTROLS.length, passed, failed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const { failed } = runC6Controls();
	process.exit(failed > 0 ? 1 : 0);
}
