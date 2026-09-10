/**
 * C7 — Adapter output contract assertion suite.
 *
 *   pnpm migration:c7
 *   pnpm exec tsx scripts/assert-c7-output-contract.ts [candidate-dir]
 *
 * WHAT COUNTS AS PROOF HERE (plan.md § C7 and § Contract coverage matrix):
 * SvelteKit uses adapter-static (pages: 'build', assets: 'build', fallback: '404.html',
 * precompress: true, strict: true). Next candidate must reproduce the output contract:
 *   - Output directory: build/ with NO out/ directory.
 *   - File shape under trailingSlash: false: about.html exists and about/index.html does not.
 *   - Error fallback: 404.html exists at the export root.
 *   - Redirects: _redirects exists and defines the two 302 redirects (/stats -> /, /ko/stats -> /ko).
 *   - Precompress decision: Next static export emits no precompressed siblings; edge handles compression.
 *
 * Exit codes:
 *   0: all C7 output contract rows pass.
 *   1: at least one row fails.
 *   2: invalid environment or candidate missing.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const DEFAULT_CANDIDATE_DIR = join(REPO_ROOT, 'next/build');
export const DEFAULT_NEXT_ROOT = join(REPO_ROOT, 'next');

export interface C7Result {
	exitCode: number;
	rows: Array<{ id: string; status: 'PASS' | 'FAIL'; detail: string }>;
}

export function runC7Assertions(
	options: {
		candidateDir?: string;
		nextRootDir?: string;
	} = {},
): C7Result {
	const candidateDir = resolve(options.candidateDir ?? DEFAULT_CANDIDATE_DIR);
	const nextRootDir = resolve(options.nextRootDir ?? DEFAULT_NEXT_ROOT);

	const rows: Array<{ id: string; status: 'PASS' | 'FAIL'; detail: string }> = [];

	if (!existsSync(candidateDir)) {
		return {
			exitCode: 2,
			rows: [
				{
					id: 'C7-ENV',
					status: 'FAIL',
					detail: `Candidate directory not found at ${candidateDir}`,
				},
			],
		};
	}

	// 1. Output directory: distDir is build/ and NO out/ exists
	const outDir = join(nextRootDir, 'out');
	const outDirCandidate = join(candidateDir, '../out');
	const hasOutDir = existsSync(outDir) || existsSync(outDirCandidate);
	rows.push({
		id: 'C7-01',
		status: !hasOutDir ? 'PASS' : 'FAIL',
		detail: !hasOutDir
			? 'output directory is build/ and no out/ directory exists'
			: 'out/ directory exists (violates distDir contract)',
	});

	// 2. File shape: trailingSlash: false contract (about.html exists, about/index.html does not)
	const sampleRoutes = ['about', 'contact', 'projects', 'system', 'posts'];
	let shapePass = true;
	const shapeFailures: string[] = [];

	for (const route of sampleRoutes) {
		const flatFile = join(candidateDir, `${route}.html`);
		const nestedIndex = join(candidateDir, route, 'index.html');

		if (!existsSync(flatFile)) {
			shapePass = false;
			shapeFailures.push(`${route}.html missing`);
		}
		if (existsSync(nestedIndex)) {
			shapePass = false;
			shapeFailures.push(`${route}/index.html exists`);
		}
	}

	rows.push({
		id: 'C7-02',
		status: shapePass ? 'PASS' : 'FAIL',
		detail: shapePass
			? 'trailingSlash: false proven: flat *.html files exist and */index.html files do not'
			: `file shape mismatch: ${shapeFailures.join(', ')}`,
	});

	// 3. Error fallback: 404.html exists and has content
	const notFoundFile = join(candidateDir, '404.html');
	const has404 = existsSync(notFoundFile) && statSync(notFoundFile).size > 0;
	rows.push({
		id: 'C7-03',
		status: has404 ? 'PASS' : 'FAIL',
		detail: has404
			? '404.html is present and non-empty at the export root'
			: '404.html is missing or empty',
	});

	// 4. Redirects file exists and preserves the required 302 rules
	const redirectsFile = join(candidateDir, '_redirects');
	let redirectsPass = false;
	let redirectsDetail = '_redirects is missing';

	if (existsSync(redirectsFile)) {
		const content = readFileSync(redirectsFile, 'utf8');
		const lines = content
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l.length > 0 && !l.startsWith('#'));

		const hasStatsRedirect = lines.some((l) => /^\/stats\s+\/\s+302$/.test(l));
		const hasKoStatsRedirect = lines.some((l) => /^\/ko\/stats\s+\/ko\s+302$/.test(l));

		if (hasStatsRedirect && hasKoStatsRedirect) {
			redirectsPass = true;
			redirectsDetail = '_redirects is present and contains both /stats and /ko/stats 302 rules';
		} else {
			redirectsDetail = `_redirects missing required rules: stats=${hasStatsRedirect}, ko/stats=${hasKoStatsRedirect}`;
		}
	}

	rows.push({
		id: 'C7-04',
		status: redirectsPass ? 'PASS' : 'FAIL',
		detail: redirectsDetail,
	});

	// 5. Precompress decision recorded: Next static export emits no precompressed (.gz/.br) siblings
	const hasGz =
		existsSync(join(candidateDir, 'about.html.gz')) ||
		existsSync(join(candidateDir, 'index.html.gz'));
	const hasBr =
		existsSync(join(candidateDir, 'about.html.br')) ||
		existsSync(join(candidateDir, 'index.html.br'));
	rows.push({
		id: 'C7-05',
		status: !hasGz && !hasBr ? 'PASS' : 'FAIL',
		detail:
			!hasGz && !hasBr
				? 'precompress accept-or-compensate verified: Next static export emits uncompressed assets for edge compression'
				: 'unexpected precompressed (.gz/.br) siblings found in static export directory',
	});

	const hasFailure = rows.some((r) => r.status === 'FAIL');
	return {
		exitCode: hasFailure ? 1 : 0,
		rows,
	};
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	const candidateDir = process.argv[2] ?? DEFAULT_CANDIDATE_DIR;
	const result = runC7Assertions({ candidateDir });

	console.log(`C7 Output Contract Assertion Suite: ${candidateDir}`);
	for (const row of result.rows) {
		console.log(`  ${row.status.padEnd(5)} ${row.id}  ${row.detail}`);
	}

	if (result.exitCode === 0) {
		console.log('RESULT: PASS (all C7 output contract rows satisfied)');
	} else {
		console.error('RESULT: FAIL');
	}

	process.exit(result.exitCode);
}
