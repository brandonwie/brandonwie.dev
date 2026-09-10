/**
 * C6 — Prerender and route enumeration contract.
 *
 *   pnpm migration:c6
 *   pnpm exec tsx scripts/assert-c6-route-enumeration.ts [candidate-dir]
 *
 * WHAT COUNTS AS PROOF HERE (plan.md § C6 and § Contract coverage matrix):
 * SvelteKit discovers pages by crawling links from entry points (prerender = true).
 * Next replaces this with explicit generateStaticParams enumeration. The hazard is
 * structural: a route reachable only by a crawled link is silently dropped when
 * discovery becomes enumeration.
 *
 * This suite diffs the Next.js exported route list against the crawl-derived
 * baseline of 366 routes (from verification/baseline/svelte-e23e808.json).
 *
 * In Slice 3, exactly 355 routes are in scope:
 *   - 21 static / index / search / feed / tags / system / rss / sitemap routes
 *   - 334 post routes (167 English + 167 Korean)
 *
 * Exactly 11 routes remain deferred to Slice 4:
 *   - /study (en, ko)
 *   - /study/dsa-i..iv (en, ko)
 *   - /talks/my-career
 *
 * Exit codes:
 *   0: 0 missing across Slice 3's 355 routes (contract remains OPEN pending Slice 4).
 *   1: at least one in-scope route is missing or empty.
 *   2: invalid environment or baseline missing.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const DEFAULT_CANDIDATE_DIR = join(REPO_ROOT, 'next/build');
export const DEFAULT_BASELINE_PATH = join(REPO_ROOT, 'verification/baseline/svelte-e23e808.json');

export const SLICE4_DEFERRED_ROUTES = [
	'/ko/study/dsa-i',
	'/ko/study/dsa-ii',
	'/ko/study/dsa-iii',
	'/ko/study/dsa-iv',
	'/ko/study',
	'/study/dsa-i',
	'/study/dsa-ii',
	'/study/dsa-iii',
	'/study/dsa-iv',
	'/study',
	'/talks/my-career',
] as const;

export type DeferredRoute = (typeof SLICE4_DEFERRED_ROUTES)[number];

export function isDeferredRoute(url: string): url is DeferredRoute {
	return (SLICE4_DEFERRED_ROUTES as readonly string[]).includes(url);
}

export function routeToFilePath(url: string, baseDir: string): string {
	if (url === '/') return join(baseDir, 'index.html');
	if (url === '/ko') return join(baseDir, 'ko.html');
	if (url.endsWith('.xml')) return join(baseDir, url.slice(1));
	return join(baseDir, url.slice(1) + '.html');
}

export interface C6Result {
	exitCode: number;
	totalBaseline: number;
	deferredCount: number;
	slice3ExpectedCount: number;
	missingRoutes: string[];
	emptyRoutes: string[];
	rows: Array<{ id: string; status: 'PASS' | 'FAIL'; detail: string }>;
}

export function runC6Assertions(
	options: {
		candidateDir?: string;
		baselinePath?: string;
	} = {},
): C6Result {
	const candidateDir = resolve(options.candidateDir ?? DEFAULT_CANDIDATE_DIR);
	const baselinePath = resolve(options.baselinePath ?? DEFAULT_BASELINE_PATH);

	const rows: Array<{ id: string; status: 'PASS' | 'FAIL'; detail: string }> = [];

	if (!existsSync(baselinePath)) {
		return {
			exitCode: 2,
			totalBaseline: 0,
			deferredCount: 0,
			slice3ExpectedCount: 0,
			missingRoutes: [],
			emptyRoutes: [],
			rows: [
				{ id: 'C6-ENV', status: 'FAIL', detail: `Baseline file not found at ${baselinePath}` },
			],
		};
	}

	if (!existsSync(candidateDir)) {
		return {
			exitCode: 2,
			totalBaseline: 0,
			deferredCount: 0,
			slice3ExpectedCount: 0,
			missingRoutes: [],
			emptyRoutes: [],
			rows: [
				{
					id: 'C6-ENV',
					status: 'FAIL',
					detail: `Candidate directory not found at ${candidateDir}`,
				},
			],
		};
	}

	const baselineJson = JSON.parse(readFileSync(baselinePath, 'utf8'));
	const baselineUrls: string[] = Object.keys(baselineJson.pages ?? {}).sort();
	const totalBaseline = baselineUrls.length;

	rows.push({
		id: 'C6-01',
		status: totalBaseline === 366 ? 'PASS' : 'FAIL',
		detail: `baseline route total is ${totalBaseline} (expected 366)`,
	});

	const deferredFound = baselineUrls.filter(isDeferredRoute);
	const deferredCount = deferredFound.length;

	rows.push({
		id: 'C6-02',
		status: deferredCount === SLICE4_DEFERRED_ROUTES.length ? 'PASS' : 'FAIL',
		detail: `deferred Slice 4 route count is ${deferredCount} (expected ${SLICE4_DEFERRED_ROUTES.length})`,
	});

	const slice3Urls = baselineUrls.filter((url) => !isDeferredRoute(url));
	const slice3ExpectedCount = slice3Urls.length;

	rows.push({
		id: 'C6-03',
		status: slice3ExpectedCount === 355 ? 'PASS' : 'FAIL',
		detail: `in-scope Slice 3 routes count is ${slice3ExpectedCount} (expected 355)`,
	});

	const missingRoutes: string[] = [];
	const emptyRoutes: string[] = [];

	for (const url of slice3Urls) {
		const filePath = routeToFilePath(url, candidateDir);
		if (!existsSync(filePath)) {
			missingRoutes.push(url);
		} else {
			const stat = statSync(filePath);
			if (stat.size === 0) {
				emptyRoutes.push(url);
			}
		}
	}

	rows.push({
		id: 'C6-04',
		status: missingRoutes.length === 0 ? 'PASS' : 'FAIL',
		detail:
			missingRoutes.length === 0
				? "0 missing across Slice 3's 355 routes"
				: `${missingRoutes.length} route(s) missing: ${missingRoutes.slice(0, 5).join(', ')}${missingRoutes.length > 5 ? '...' : ''}`,
	});

	rows.push({
		id: 'C6-05',
		status: emptyRoutes.length === 0 ? 'PASS' : 'FAIL',
		detail:
			emptyRoutes.length === 0
				? 'all in-scope exported routes have non-zero file size'
				: `${emptyRoutes.length} route file(s) are empty: ${emptyRoutes.slice(0, 5).join(', ')}`,
	});

	const hasFailure = rows.some((r) => r.status === 'FAIL');
	const exitCode = hasFailure ? 1 : 0;

	return {
		exitCode,
		totalBaseline,
		deferredCount,
		slice3ExpectedCount,
		missingRoutes,
		emptyRoutes,
		rows,
	};
}

// CLI execution
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	const candidateDir = process.argv[2] ?? DEFAULT_CANDIDATE_DIR;
	const result = runC6Assertions({ candidateDir });

	console.log(`C6 Route Enumeration Assertion Suite: ${candidateDir}`);
	for (const row of result.rows) {
		console.log(`  ${row.status.padEnd(5)} ${row.id}  ${row.detail}`);
	}

	if (result.exitCode === 0) {
		console.log(
			`RESULT: PASS across ${result.slice3ExpectedCount} routes (contract C6 remains OPEN pending Slice 4's ${result.deferredCount} deferred routes)`,
		);
	} else {
		console.error(
			`RESULT: FAIL (${result.missingRoutes.length} missing, ${result.emptyRoutes.length} empty)`,
		);
	}

	process.exit(result.exitCode);
}
