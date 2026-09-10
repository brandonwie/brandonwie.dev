/**
 * Negative controls for C9 & C12 static assets and fallbacks (`scripts/assert-c9-c12-static-assets.ts`).
 */
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	DEFAULT_CANDIDATE_DIR,
	DEFAULT_MEDIA_DIR,
	DEFAULT_PUBLIC_DIR,
	runC12Assertions,
} from './assert-c9-c12-static-assets.ts';

type Kind = 'DEFECT' | 'INVARIANCE';

interface Control {
	id: string;
	kind: Kind;
	what: string;
	setup: (tempCandidate: string, tempPublic: string, tempMedia: string) => void;
}

const CONTROLS: Control[] = [
	{
		id: 'C12-C00',
		kind: 'INVARIANCE',
		what: 'an untouched candidate and public directory passes exit 0',
		setup: () => {},
	},
	{
		id: 'C12-C01',
		kind: 'DEFECT',
		what: 'a static asset is missing from candidate output',
		setup: (tempCandidate) => {
			const target = join(tempCandidate, 'hero/giscus-sveltekit-integration.png');
			if (existsSync(target)) rmSync(target);
		},
	},
	{
		id: 'C12-C02',
		kind: 'DEFECT',
		what: 'a static asset in candidate has a byte mismatch with source',
		setup: (tempCandidate) => {
			const target = join(tempCandidate, 'favicon.svg');
			if (existsSync(target)) writeFileSync(target, '<svg>corrupted</svg>');
		},
	},
	{
		id: 'C12-C03',
		kind: 'DEFECT',
		what: 'the public/ directory census is altered away from 345 files',
		setup: (_tempCandidate, tempPublic) => {
			writeFileSync(join(tempPublic, 'rogue-asset.txt'), 'extra');
		},
	},
	{
		id: 'C12-C04',
		kind: 'DEFECT',
		what: 'a media-gen brief is deleted violating the 161 protected briefs count',
		setup: (_tempCandidate, _tempPublic, tempMedia) => {
			const sampleBrief = join(tempMedia, 'giscus-sveltekit-integration');
			if (existsSync(sampleBrief)) rmSync(sampleBrief, { recursive: true, force: true });
		},
	},
	{
		id: 'C12-C05',
		kind: 'DEFECT',
		what: 'slug-derived hero URL is unreachable in candidate',
		setup: (tempCandidate) => {
			const target = join(tempCandidate, 'og/default.png');
			if (existsSync(target)) rmSync(target);
		},
	},
	{
		id: 'C12-C06',
		kind: 'INVARIANCE',
		what: 'directory path normalization handles trailing slash',
		setup: () => {},
	},
];

export function runC12Controls(): { total: number; passed: number; failed: number } {
	let passed = 0;
	let failed = 0;

	console.log('--- migration:c12:controls');

	for (const control of CONTROLS) {
		const scratchDir = mkdtempSync(join(tmpdir(), 'c12-ctrl-'));
		const tempCandidate = join(scratchDir, 'candidate');
		const tempPublic = join(scratchDir, 'public');
		const tempMedia = join(scratchDir, 'media');

		try {
			cpSync(DEFAULT_CANDIDATE_DIR, tempCandidate, { recursive: true });
			cpSync(DEFAULT_PUBLIC_DIR, tempPublic, { recursive: true });
			cpSync(DEFAULT_MEDIA_DIR, tempMedia, { recursive: true });

			control.setup(tempCandidate, tempPublic, tempMedia);

			const result = runC12Assertions({
				candidateDir: control.id === 'C12-C06' ? tempCandidate + '/' : tempCandidate,
				publicDir: tempPublic,
				mediaDir: tempMedia,
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
	const { failed } = runC12Controls();
	process.exit(failed > 0 ? 1 : 0);
}
