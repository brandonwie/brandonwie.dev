/**
 * Changed-surface router for the migration verification suites (C1/C2).
 *
 * WHY THIS EXISTS
 *
 * `.husky/pre-push` already costs ~123 s before any migration check runs (lint,
 * format:check, build, check, validate:dates). Measured on this host, the
 * fourteen migration commands add ~100 s and `migration:controls`
 * alone adds ~265 s. Bolting the whole set onto the hook makes an ordinary push
 * cost more than four minutes, and a hook that slow gets bypassed with
 * `--no-verify`, which is worse than a hook that runs less. So push-time runs
 * only the suites whose inputs actually changed, and CI runs every suite it can:
 * `--tier all` minus `migration:controls` (its own parallel job) and minus the
 * 3B-dependent C3 lane, which has no 3B checkout there. This hook is the only
 * runner those two have, which is why `migration-route-controls.ts` reads the
 * hook before crediting a push-tier suite with being reachable at all.
 *
 * WHY THE MAP IS DERIVED, NOT DECLARED
 *
 * A hand-written path-to-suite table is the exact failure this lane keeps
 * finding: a check that reports success because it stopped looking. So a
 * suite's input set is COMPUTED — the transitive local import graph of its
 * entry script, unioned with the runtime roots it reads (including the build
 * SOURCES behind any build output it consumes). Adding an import to a script
 * widens its input set automatically; nobody has to remember to update a table.
 *
 * FAIL-CLOSED, IN FIVE PLACES
 *
 *  1. A changed path matching no suite input and not on the short provably-inert
 *     allowlist is an UNKNOWN surface and selects everything.
 *  2. A shared config (`package.json`, a lockfile, a tsconfig, a runtime pin)
 *     selects everything, because its blast radius is not derivable from
 *     imports.
 *  3. A change to the selector itself — this file, its controls, or the hooks —
 *     selects everything. A router cannot be trusted to scope the diff that
 *     changes the router.
 *  4. A new branch (all-zero remote sha) or a range git cannot resolve selects
 *     everything.
 *  5. A relative import that cannot be resolved is FATAL, not skipped. An
 *     unresolvable edge means the derived input set is incomplete, and an
 *     incomplete input set under-selects silently.
 *
 * Modes:
 *   --list [--tier push|ci|all]     print the commands in a tier
 *   --plan                          print the selection for the given change set
 *   --run                           run the selection (sequential, first failure wins)
 *   --all                           select every suite in --tier (default push)
 *   --exclude <c1,c2,...>           drop named suites; unknown name is FATAL
 *   --range <base>..<head>          derive changed paths from a git range
 *   --paths <p1,p2,...>             use an explicit change set (tests)
 *   (default)                       read pre-push stdin: `<lref> <lsha> <rref> <rsha>`
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));

/**
 * Sources the SvelteKit `build/` output is produced from. Suites that read
 * `build/` depend on these, not on the output directory (which is generated and
 * never committed).
 */
const SVELTE_BUILD_SOURCES = [
	'src',
	'static',
	'messages',
	'project.inlang',
	'svelte.config.js',
	'vite.config.ts',
];

/** Sources the `next/build/` output is produced from. */
const NEXT_BUILD_SOURCES = [
	'next/app',
	'next/src',
	'next/public',
	'next/next.config.ts',
	'next/postcss.config.mjs',
	'src/content',
	'src/lib/plugins',
	// The 3B system snapshot. Once the Next /system/3b page consumes it, a
	// `deno task snapshot:3b` regeneration changes the Next build while
	// selecting no Next-build-consuming suite -- the build moves and nothing
	// re-runs.
	'src/lib/data',
];

/** The frozen comparator evidence every build-consuming suite is judged against. */
const BASELINE = ['verification/baseline', 'verification/empty-ledger.json'];

export interface Suite {
	/** The `package.json` script name. */
	command: string;
	/** Entry file whose transitive local imports form part of the input set. */
	entry: string;
	/** Runtime roots the suite reads, expressed as SOURCES for generated dirs. */
	dataRoots: string[];
	/** `push` runs in the hook when selected; `ci` never runs at push time. */
	tier: 'push' | 'ci';
}

export const SUITES: Suite[] = [
	{
		command: 'migration:corpus',
		entry: 'next/scripts/compile-corpus.ts',
		dataRoots: ['src/content/posts'],
		tier: 'push',
	},
	{
		command: 'migration:posts:controls',
		entry: 'next/scripts/assert-posts-controls.ts',
		dataRoots: [],
		tier: 'push',
	},
	{
		command: 'migration:typography',
		entry: 'next/scripts/assert-corpus-typography.ts',
		dataRoots: ['src/content/posts', ...SVELTE_BUILD_SOURCES],
		tier: 'push',
	},
	{
		command: 'migration:typography:controls',
		entry: 'next/scripts/assert-corpus-typography-controls.ts',
		dataRoots: ['src/content/posts', ...SVELTE_BUILD_SOURCES],
		tier: 'push',
	},
	{
		command: 'migration:typography:oracle',
		entry: 'next/scripts/assert-typography-oracle.ts',
		dataRoots: [],
		tier: 'push',
	},
	{
		command: 'migration:typography:oracle:controls',
		entry: 'next/scripts/assert-typography-oracle-controls.ts',
		dataRoots: [],
		tier: 'push',
	},
	{
		command: 'migration:ast',
		entry: 'next/scripts/assert-mdsvex-ast.ts',
		dataRoots: ['src/content/posts'],
		tier: 'push',
	},
	{
		command: 'migration:ast:controls',
		entry: 'next/scripts/assert-mdsvex-ast-controls.ts',
		dataRoots: ['src/content/posts'],
		tier: 'push',
	},
	{
		command: 'migration:c13',
		entry: 'scripts/assert-c13-shell.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...BASELINE],
		tier: 'push',
	},
	{
		command: 'migration:shell',
		entry: 'scripts/assert-shell.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...BASELINE],
		tier: 'push',
	},
	{
		command: 'migration:shell:controls',
		entry: 'scripts/assert-shell-controls.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...BASELINE],
		tier: 'push',
	},
	{
		command: 'migration:c13:controls',
		entry: 'scripts/assert-c13-shell-controls.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...BASELINE],
		tier: 'push',
	},
	{
		command: 'migration:c11',
		entry: 'scripts/assert-c11-library-ports.ts',
		// Reads the Next export, the frozen baseline, the exception ledger (the N
		// rows recompute what each shell approval claims), the mermaid corpus, and
		// the Svelte mermaid config it diffs the Next one against.
		dataRoots: [
			...NEXT_BUILD_SOURCES,
			...BASELINE,
			'verification/exception-ledger.json',
			// Row P1 reads every Svelte port-role path, and the selector only falls
			// back to "run everything" for a path matching NO suite input.
			// SVELTE_BUILD_SOURCES contains 'src', so a deleted System3bNode.svelte
			// matches the Svelte suites, sets `matched`, skips the fallback -- and
			// migration:c11 would never be selected while P1 is exactly the row that
			// should have failed. Named individually for that reason.
			'src/lib/components/Mermaid.svelte',
			'src/lib/utils/system3b-graph.ts',
			'src/lib/components/System3bGraph.svelte',
			'src/lib/components/System3bFlow.svelte',
			'src/lib/components/System3bNode.svelte',
			'src/lib/components/System3bFitView.svelte',
			'src/lib/components/System3bBandNode.svelte',
		],
		tier: 'push',
	},
	{
		// Copies next/build once per build-shaped control and runs tsc twice for
		// the C and B3 rows. migration:controls-class cost, so CI only.
		command: 'migration:c11:controls',
		entry: 'scripts/assert-c11-library-ports-controls.ts',
		dataRoots: [
			...NEXT_BUILD_SOURCES,
			...BASELINE,
			'verification/exception-ledger.json',
			// Row P1 reads every Svelte port-role path, and the selector only falls
			// back to "run everything" for a path matching NO suite input.
			// SVELTE_BUILD_SOURCES contains 'src', so a deleted System3bNode.svelte
			// matches the Svelte suites, sets `matched`, skips the fallback -- and
			// migration:c11 would never be selected while P1 is exactly the row that
			// should have failed. Named individually for that reason.
			'src/lib/components/Mermaid.svelte',
			'src/lib/utils/system3b-graph.ts',
			'src/lib/components/System3bGraph.svelte',
			'src/lib/components/System3bFlow.svelte',
			'src/lib/components/System3bNode.svelte',
			'src/lib/components/System3bFitView.svelte',
			'src/lib/components/System3bBandNode.svelte',
		],
		tier: 'ci',
	},
	{
		command: 'migration:spike2',
		entry: 'scripts/assert-slice2-motion.ts',
		// Reads the Next export, the exception ledger (row S3 recomputes the
		// spike route's page-presence approval), and the four Svelte sources the
		// port came from.
		dataRoots: [
			...NEXT_BUILD_SOURCES,
			'verification/exception-ledger.json',
			// Named individually for the same reason the C11 rows are: row P1
			// reads every Svelte port-role path, and the selector only falls back
			// to "run everything" for a path matching NO suite input.
			// SVELTE_BUILD_SOURCES contains 'src', so deleting a ported Svelte
			// source matches the Svelte suites, sets `matched`, skips the
			// fallback -- and this suite would never be selected while P1 is
			// exactly the row that should have failed.
			'src/lib/useReducedMotion.svelte.ts',
			'src/lib/components/study/Stepper.svelte',
			'src/lib/components/study/BstTraversalVisualizer.svelte',
			'src/lib/components/study/HashMapVisualizer.svelte',
			'src/lib/data/study.ts',
		],
		tier: 'push',
	},
	{
		// Copies next/build for each build-shaped control and drives tsc twice
		// for the C group. migration:controls-class cost, so CI only.
		command: 'migration:spike2:controls',
		entry: 'scripts/assert-slice2-motion-controls.ts',
		dataRoots: [
			...NEXT_BUILD_SOURCES,
			'verification/exception-ledger.json',
			'src/lib/useReducedMotion.svelte.ts',
			'src/lib/components/study/Stepper.svelte',
			'src/lib/components/study/BstTraversalVisualizer.svelte',
			'src/lib/components/study/HashMapVisualizer.svelte',
			'src/lib/data/study.ts',
		],
		tier: 'ci',
	},
	{
		command: 'migration:gsap-palette',
		entry: 'scripts/assert-slice2-gsap-palette.ts',
		// Reads the Next export, the exception ledger (rows S4 recompute both
		// spike routes' page-presence approvals), and the six Svelte sources the
		// port came from -- each named individually for the same reason the
		// spike2 rows are: SVELTE_BUILD_SOURCES contains 'src', so deleting a
		// ported Svelte source would match the Svelte suites, set `matched`, skip
		// the run-everything fallback, and never select this suite while P1 and
		// T1 are exactly the rows that should have failed.
		dataRoots: [
			...NEXT_BUILD_SOURCES,
			'verification/exception-ledger.json',
			'src/lib/components/deck/gsap.ts',
			'src/routes/talks/my-career/slides/AccountSeparationSlide.svelte',
			'src/lib/fuzzy.ts',
			'src/lib/palette/items.ts',
			'src/lib/components/palette/FuzzyFinder.svelte',
			'src/lib/stores/palette.ts',
		],
		tier: 'push',
	},
	{
		// Copies next/build for each build-shaped control and drives tsc twice
		// for the C group. migration:controls-class cost, so CI only.
		command: 'migration:gsap-palette:controls',
		entry: 'scripts/assert-slice2-gsap-palette-controls.ts',
		dataRoots: [
			...NEXT_BUILD_SOURCES,
			'verification/exception-ledger.json',
			'src/lib/components/deck/gsap.ts',
			'src/routes/talks/my-career/slides/AccountSeparationSlide.svelte',
			'src/lib/fuzzy.ts',
			'src/lib/palette/items.ts',
			'src/lib/components/palette/FuzzyFinder.svelte',
			'src/lib/stores/palette.ts',
		],
		tier: 'ci',
	},
	{
		// The six rows below existed in package.json with NO row here, so
		// `migration:all` -- which iterates this table -- ran none of them, and
		// neither did the pre-push router: an unrecognised path selects
		// "everything", which is still only this list. C10-search-comments.md
		// cites `migration:publishing:controls` exit 0 as evidence for a suite
		// that was not enforced per commit. Registered here because this plan's
		// own verification block cites all three as regression guards.
		command: 'migration:c3',
		entry: 'scripts/assert-c3-runtimes.ts',
		// It drives every deno task and pnpm wrapper, including build and preview.
		dataRoots: [...SVELTE_BUILD_SOURCES, 'deno.json', 'package.json', 'scripts'],
		// PUSH, NOT CI: this suite drives the Deno scripts that read the 3B
		// knowledge base. CI has no 3B checkout, so every sync/study/snapshot row
		// fails there with `Could not locate 3B root`. It is reachable on the
		// developer machine, where 3B exists, via the pre-push router.
		tier: 'push',
	},
	{
		command: 'migration:c3:controls',
		entry: 'scripts/assert-c3-runtimes-controls.ts',
		dataRoots: [...SVELTE_BUILD_SOURCES, 'deno.json', 'package.json', 'scripts'],
		// PUSH, NOT CI: this suite drives the Deno scripts that read the 3B
		// knowledge base. CI has no 3B checkout, so every sync/study/snapshot row
		// fails there with `Could not locate 3B root`. It is reachable on the
		// developer machine, where 3B exists, via the pre-push router.
		tier: 'push',
	},
	{
		// THE HERMETIC HALF OF C3, which does run in CI.
		//
		// Moving all of C3 to push tier was too broad: only the rows that read a
		// 3B tree need one. `--lane=hermetic` runs the four rows that shell out to
		// `pnpm dev|build|preview|check` plus the manifest-completeness checks,
		// which need nothing but this checkout. `lanePartitionFailures` asserts the
		// two lanes cover every row exactly once, so a new surface cannot land in
		// neither and be executed by nothing.
		command: 'migration:c3:hermetic',
		entry: 'scripts/assert-c3-runtimes.ts',
		dataRoots: [...SVELTE_BUILD_SOURCES, 'deno.json', 'package.json', 'scripts'],
		tier: 'ci',
	},
	{
		// Carries LB-01 and LB-02, the regression controls for the IPv4-only
		// loopback probe. They bind an IPv6-only listener and assert the probes
		// reach it: pure sockets, no manifests, no 3B. Excluding them from CI with
		// the rest of C3 left the fix this PR made with no central enforcement.
		command: 'migration:c3:hermetic:controls',
		entry: 'scripts/assert-c3-runtimes-controls.ts',
		dataRoots: [...SVELTE_BUILD_SOURCES, 'deno.json', 'package.json', 'scripts'],
		tier: 'ci',
	},
	{
		command: 'migration:publishing',
		entry: 'scripts/assert-publishing-surfaces.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...SVELTE_BUILD_SOURCES, ...BASELINE],
		tier: 'push',
	},
	{
		command: 'migration:publishing:controls',
		entry: 'scripts/assert-publishing-surfaces-controls.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...SVELTE_BUILD_SOURCES, ...BASELINE],
		tier: 'push',
	},
	{
		command: 'migration:feed',
		entry: 'scripts/assert-feed-redirects.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...SVELTE_BUILD_SOURCES, ...BASELINE],
		tier: 'push',
	},
	{
		command: 'migration:feed:controls',
		entry: 'scripts/assert-feed-redirects-controls.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...SVELTE_BUILD_SOURCES, ...BASELINE],
		tier: 'push',
	},
	{
		command: 'migration:article',
		entry: 'scripts/assert-article-parity.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...SVELTE_BUILD_SOURCES],
		tier: 'push',
	},
	{
		command: 'migration:article:controls',
		entry: 'scripts/assert-article-parity-controls.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...SVELTE_BUILD_SOURCES],
		tier: 'push',
	},
	{
		command: 'migration:projection',
		entry: 'scripts/assert-baseline-projection.ts',
		dataRoots: [...BASELINE],
		tier: 'push',
	},
	{
		command: 'migration:projection:controls',
		entry: 'scripts/assert-baseline-projection-controls.ts',
		dataRoots: [...BASELINE],
		tier: 'push',
	},
	{
		command: 'migration:c5',
		entry: 'scripts/assert-c5-glob-sites.ts',
		dataRoots: [...SVELTE_BUILD_SOURCES, ...NEXT_BUILD_SOURCES],
		tier: 'push',
	},
	{
		command: 'migration:c5:controls',
		entry: 'scripts/assert-c5-glob-sites-controls.ts',
		dataRoots: [...SVELTE_BUILD_SOURCES, ...NEXT_BUILD_SOURCES],
		tier: 'push',
	},
	{
		command: 'migration:verify:svelte',
		entry: 'scripts/migration-verify.ts',
		dataRoots: [...SVELTE_BUILD_SOURCES, ...BASELINE],
		tier: 'push',
	},
	{
		// The router routes itself: its controls are a suite like any other, so a
		// change to the selector runs them. Without this row a router edit would
		// go broad over every suite EXCEPT the one that checks the router.
		command: 'migration:route:controls',
		entry: 'scripts/migration-route-controls.ts',
		dataRoots: [],
		tier: 'push',
	},
	{
		// 265 s — more than the other fourteen combined, because each of its 40
		// controls re-captures the whole 366-page build. CI only, in its own job.
		command: 'migration:controls',
		entry: 'scripts/migration-verify-controls.ts',
		dataRoots: [...SVELTE_BUILD_SOURCES, ...BASELINE],
		tier: 'ci',
	},
	{
		// `migration:verify:next` exits 1 by design until the surface port closes
		// parity, and CI used to run it under `continue-on-error`. That suppressed
		// a missing build (exit 2) and a malformed or stale ledger (also exit 1)
		// along with the expected drift. This judges the exit instead of ignoring
		// it: expected drift passes and is reported as a number, a broken harness
		// fails. CI only — it needs the Next build.
		command: 'migration:parity:progress',
		entry: 'scripts/assert-parity-progress.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...BASELINE],
		tier: 'ci',
	},
	{
		// The judge is a pure function, so its controls cost nothing at push time.
		command: 'migration:parity:progress:controls',
		entry: 'scripts/assert-parity-progress-controls.ts',
		dataRoots: [],
		tier: 'push',
	},
];

/**
 * Paths whose blast radius on the migration suites is provably empty. Kept
 * SHORT and specific: everything not listed here and not derived as a suite
 * input is an unknown surface, which selects everything.
 */
const INERT = [
	/^docs\//,
	/^\.github\//,
	/^\.vscode\//,
	/^[^/]+\.md$/,
	/^architecture\/.*\.md$/,
	/^LICENSE$/,
];

/** Blast radius not derivable from imports — always select everything. */
const SHARED_CONFIG = [
	/^package\.json$/,
	/^pnpm-lock\.yaml$/,
	/^pnpm-workspace\.yaml$/,
	/^tsconfig\.json$/,
	/^eslint\.config\.js$/,
	/^\.prettierrc/,
	/^\.node-version$/,
	/^deno\.(json|lock)$/,
	/^next\/package\.json$/,
	/^next\/tsconfig\.json$/,
];

/** The selector cannot scope the diff that changes the selector. */
const SELECTOR = [/^scripts\/migration-route(-controls)?\.ts$/, /^\.husky\//];

/**
 * Import discovery uses the TypeScript compiler's own file preprocessor rather
 * than a regex.
 *
 * The regex version shipped first and a reviewer found it blind to MULTILINE
 * imports — `import {\n  a,\n  b,\n} from './x'` — because the pattern refused
 * a newline between the specifier list and `from`. Four such imports exist in
 * this repository, and one of them was load-bearing: a change to
 * `next/src/markdown/pipeline.ts` did not select
 * `migration:typography:oracle:controls`, because that suite reaches the
 * pipeline only through a multiline import of `assert-typography-oracle`.
 *
 * That is the exact failure this router was written to prevent, committed
 * inside the router. A hand-rolled scanner has an unbounded list of forms it
 * has not thought of; `ts.preProcessFile` is the same scanner the compiler
 * uses, so the list is the language's, not mine.
 */
export function scanImports(source: string): string[] {
	const scanned = ts.preProcessFile(source, true, true);
	return scanned.importedFiles.map((file) => file.fileName);
}

const RESOLVE_EXTS = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx'];

function toRepoRelative(absolute: string): string {
	return relative(REPO_ROOT, absolute).split(sep).join(posix.sep);
}

function resolveLocal(specifier: string, fromFile: string): string {
	const base = resolve(dirname(join(REPO_ROOT, fromFile)), specifier);
	// `./x.ts` and `./x.js` both appear; TypeScript's NodeNext resolution maps a
	// `.js` specifier onto a `.ts` source, so try that swap before giving up.
	const candidates = [
		...RESOLVE_EXTS.map((ext) => base + ext),
		base.replace(/\.js$/, '.ts'),
		join(base, 'index.ts'),
		join(base, 'index.tsx'),
	];
	for (const candidate of candidates) {
		if (existsSync(candidate) && statSync(candidate).isFile()) return toRepoRelative(candidate);
	}
	// FATAL, not skipped: an unresolvable edge means the derived input set is
	// incomplete, and an incomplete input set under-selects without saying so.
	throw new Error(`unresolvable local import ${specifier} from ${fromFile}`);
}

/** Transitive local (relative-specifier) import closure of one entry file. */
export function importClosure(entry: string, seen = new Set<string>()): Set<string> {
	if (seen.has(entry)) return seen;
	seen.add(entry);
	const source = readFileSync(join(REPO_ROOT, entry), 'utf8');
	for (const specifier of scanImports(source)) {
		if (!specifier.startsWith('.')) continue;
		importClosure(resolveLocal(specifier, entry), seen);
	}
	return seen;
}

export function suiteInputs(suite: Suite): string[] {
	return [...importClosure(suite.entry), ...suite.dataRoots];
}

function underRoot(path: string, root: string): boolean {
	return path === root || path.startsWith(`${root}/`);
}

export interface Selection {
	commands: string[];
	broad: boolean;
	reasons: string[];
}

export function select(changed: string[], tier: 'push' | 'ci' | 'all' = 'push'): Selection {
	const inTier = SUITES.filter((s) => tier === 'all' || s.tier === tier);
	const all = () => inTier.map((s) => s.command);

	const reasons: string[] = [];
	for (const path of changed) {
		if (SELECTOR.some((re) => re.test(path))) reasons.push(`selector changed: ${path}`);
		else if (SHARED_CONFIG.some((re) => re.test(path))) reasons.push(`shared config: ${path}`);
	}
	if (reasons.length > 0) return { commands: all(), broad: true, reasons };

	const inputs = new Map(inTier.map((s) => [s.command, suiteInputs(s)] as const));
	const selected = new Set<string>();
	for (const path of changed) {
		let matched = false;
		for (const suite of inTier) {
			if (!inputs.get(suite.command)!.some((root) => underRoot(path, root))) continue;
			matched = true;
			selected.add(suite.command);
		}
		if (matched) continue;
		if (INERT.some((re) => re.test(path))) continue;
		// Unknown surface. Nothing proves it cannot reach a suite, so run them all.
		return { commands: all(), broad: true, reasons: [`unknown surface: ${path}`] };
	}
	return {
		commands: inTier.filter((s) => selected.has(s.command)).map((s) => s.command),
		broad: false,
		reasons: [],
	};
}

const ZERO_SHA = /^0+$/;

/** Changed paths for a pre-push stdin payload. Returns null to mean "broad". */
export function changedFromPushRefs(stdin: string): string[] | null {
	const paths = new Set<string>();
	let sawRange = false;
	for (const line of stdin.split('\n')) {
		const [, localSha, , remoteSha] = line.trim().split(/\s+/);
		if (!localSha || !remoteSha) continue;
		if (ZERO_SHA.test(localSha)) continue; // branch deletion — nothing pushed
		if (ZERO_SHA.test(remoteSha)) return null; // new branch — no base to diff
		sawRange = true;
		for (const path of changedInRange(`${remoteSha}..${localSha}`)) paths.add(path);
	}
	return sawRange ? [...paths] : null;
}

export function changedInRange(range: string): string[] {
	const out = execFileSync('git', ['diff', '--name-only', range], {
		cwd: REPO_ROOT,
		encoding: 'utf8',
	});
	return out.split('\n').filter(Boolean);
}

function runCommands(commands: string[]): number {
	for (const command of commands) {
		console.log(`\n--- ${command}`);
		const result = spawnSync('corepack', ['pnpm', 'run', command], {
			cwd: REPO_ROOT,
			stdio: 'inherit',
		});
		if (result.status !== 0) {
			console.error(`FAIL: ${command} exited ${result.status}`);
			return result.status ?? 1;
		}
	}
	return 0;
}

function readStdin(): string {
	try {
		return readFileSync(0, 'utf8');
	} catch {
		return '';
	}
}

function flagValue(argv: string[], flag: string): string | undefined {
	const index = argv.indexOf(flag);
	return index === -1 ? undefined : argv[index + 1];
}

/**
 * `--exclude a,b` removes named suites from the tier selection.
 *
 * WHY THIS EXISTS. Before it, CI could not express "every registered suite
 * except the one that has its own parallel job". `migration:all` therefore ran
 * `--tier push` only, and five registered ci-tier suites -- including the
 * 86-control `migration:gsap-palette:controls` that gate G2's approval cites as
 * its evidence -- were executed by nothing: not by the hook, not by
 * `migration:all`, not by any step in `ci.yml`. The workflow comment claimed the
 * opposite and named this router's map as the guarantee.
 *
 * FAIL-CLOSED. An unknown command is FATAL, not ignored. A typo'd exclusion
 * that silently matched nothing would drop the suite it was meant to keep
 * running back into the same blind spot, which is the failure this flag exists
 * to close.
 */
function excluded(argv: string[]): Set<string> {
	const raw = flagValue(argv, '--exclude');
	if (raw === undefined) return new Set();
	// Trimmed because `--exclude a, b` is an ordinary shell form: untrimmed, the
	// second name becomes `" b"`, which is unknown, which is FATAL below. A
	// fail-closed rule that fires on a space is a rule people route around.
	const names = raw
		.split(',')
		.map((n) => n.trim())
		.filter(Boolean);
	const known = new Set(SUITES.map((s) => s.command));
	const unknown = names.filter((n) => !known.has(n));
	if (unknown.length > 0) {
		throw new Error(
			`--exclude names ${unknown.length} command(s) not in SUITES: ${unknown.join(', ')}. ` +
				`An exclusion that matches nothing hides the suite it was meant to keep running.`,
		);
	}
	return new Set(names);
}

async function main(argv: string[]): Promise<number> {
	const tier = (flagValue(argv, '--tier') ?? 'push') as 'push' | 'ci' | 'all';
	const skip = excluded(argv);
	const inTier = SUITES.filter((s) => (tier === 'all' || s.tier === tier) && !skip.has(s.command));

	if (argv.includes('--list')) {
		for (const suite of inTier) {
			console.log(`${suite.tier.padEnd(4)}  ${suite.command}`);
		}
		return 0;
	}

	let selection: Selection;
	if (argv.includes('--all')) {
		selection = {
			commands: inTier.map((s) => s.command),
			broad: true,
			reasons: ['--all'],
		};
	} else {
		const explicit = flagValue(argv, '--paths');
		const range = flagValue(argv, '--range');
		let changed: string[] | null;
		if (explicit !== undefined) changed = explicit.split(',').filter(Boolean);
		else if (range) changed = changedInRange(range);
		else changed = changedFromPushRefs(readStdin());
		const selected = changed === null ? null : select(changed, tier);
		selection =
			changed === null
				? {
						commands: inTier.map((s) => s.command),
						broad: true,
						reasons: ['no resolvable push range (new branch or empty stdin)'],
					}
				: {
						...selected!,
						commands: selected!.commands.filter((c) => !skip.has(c)),
					};
	}

	for (const reason of selection.reasons) console.log(`broad: ${reason}`);
	if (selection.commands.length === 0) {
		console.log('migration route: no migration suite inputs changed');
		return 0;
	}
	console.log(
		`migration route: ${selection.commands.length} suite(s) — ${selection.commands.join(', ')}`,
	);
	if (!argv.includes('--run')) return 0;
	return runCommands(selection.commands);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main(process.argv.slice(2)).then((code) => process.exit(code));
}
