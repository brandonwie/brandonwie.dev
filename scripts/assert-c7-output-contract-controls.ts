/**
 * Negative controls for C7 output contract (`scripts/assert-c7-output-contract.ts`).
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CANDIDATE_DIR, runC7Assertions } from './assert-c7-output-contract.ts';

type Kind = 'DEFECT' | 'INVARIANCE';

interface Control {
	id: string;
	kind: Kind;
	what: string;
	setup: (tempCandidate: string, tempNextRoot: string) => void;
}

const CONTROLS: Control[] = [
	{
		id: 'C7-C00',
		kind: 'INVARIANCE',
		what: 'an untouched candidate passes exit 0',
		setup: () => {},
	},
	{
		id: 'C7-C01',
		kind: 'DEFECT',
		what: 'an out/ directory exists in the Next package root',
		setup: (_tempCandidate, tempNextRoot) => {
			mkdirSync(join(tempNextRoot, 'out'), { recursive: true });
			writeFileSync(join(tempNextRoot, 'out/index.html'), '<html></html>');
		},
	},
	{
		id: 'C7-C02',
		kind: 'DEFECT',
		what: 'a nested about/index.html exists violating trailingSlash: false',
		setup: (tempCandidate) => {
			mkdirSync(join(tempCandidate, 'about'), { recursive: true });
			writeFileSync(join(tempCandidate, 'about/index.html'), '<html></html>');
		},
	},
	{
		id: 'C7-C03',
		kind: 'DEFECT',
		what: '404.html is missing from export root',
		setup: (tempCandidate) => {
			const target = join(tempCandidate, '404.html');
			if (existsSync(target)) rmSync(target);
		},
	},
	{
		id: 'C7-C04',
		kind: 'DEFECT',
		what: '_redirects is missing from export root',
		setup: (tempCandidate) => {
			const target = join(tempCandidate, '_redirects');
			if (existsSync(target)) rmSync(target);
		},
	},
	{
		id: 'C7-C05',
		kind: 'DEFECT',
		what: '_redirects is missing the /ko/stats rule',
		setup: (tempCandidate) => {
			const target = join(tempCandidate, '_redirects');
			writeFileSync(target, '/stats / 302\n');
		},
	},
	{
		id: 'C7-C06',
		kind: 'INVARIANCE',
		what: '_redirects formatting with comments and whitespace preserved',
		setup: (tempCandidate) => {
			const target = join(tempCandidate, '_redirects');
			writeFileSync(target, '# Redirect rules\n\n/stats / 302\n/ko/stats /ko 302\n\n');
		},
	},
];

export function runC7Controls(): { total: number; passed: number; failed: number } {
	let passed = 0;
	let failed = 0;

	console.log('--- migration:c7:controls');

	for (const control of CONTROLS) {
		const scratchDir = mkdtempSync(join(tmpdir(), 'c7-ctrl-'));
		const tempCandidate = join(scratchDir, 'build');
		const tempNextRoot = scratchDir;

		try {
			cpSync(DEFAULT_CANDIDATE_DIR, tempCandidate, { recursive: true });

			control.setup(tempCandidate, tempNextRoot);

			const result = runC7Assertions({
				candidateDir: tempCandidate,
				nextRootDir: tempNextRoot,
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
	const { failed } = runC7Controls();
	process.exit(failed > 0 ? 1 : 0);
}
