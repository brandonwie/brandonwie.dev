/**
 * Changed-surface router for the migration verification suites (C1/C2).
 *
 * WHY THIS EXISTS
 *
 * `.husky/pre-push` already costs ~123 s before any migration check runs (lint,
 * format:check, build, check, validate:dates). Measured on this host, the
 * fourteen blocking migration commands add ~100 s and `migration:controls`
 * alone adds ~265 s. Bolting the whole set onto the hook makes an ordinary push
 * cost more than four minutes, and a hook that slow gets bypassed with
 * `--no-verify`, which is worse than a hook that runs less. So push-time runs
 * only the suites whose inputs actually changed, and CI runs the full superset
 * unconditionally.
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
 *   --all                           select every blocking suite in --tier (default push)
 *   --range <base>..<head>          derive changed paths from a git range
 *   --paths <p1,p2,...>             use an explicit change set (tests)
 *   (default)                       read pre-push stdin: `<lref> <lsha> <rref> <rsha>`
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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
	/** A non-blocking suite is reported, never enforced (parity is still open). */
	blocking: boolean;
}

export const SUITES: Suite[] = [
	{
		command: 'migration:corpus',
		entry: 'next/scripts/compile-corpus.ts',
		dataRoots: ['src/content/posts'],
		tier: 'push',
		blocking: true,
	},
	{
		command: 'migration:typography',
		entry: 'next/scripts/assert-corpus-typography.ts',
		dataRoots: ['src/content/posts', ...SVELTE_BUILD_SOURCES],
		tier: 'push',
		blocking: true,
	},
	{
		command: 'migration:typography:controls',
		entry: 'next/scripts/assert-corpus-typography-controls.ts',
		dataRoots: ['src/content/posts', ...SVELTE_BUILD_SOURCES],
		tier: 'push',
		blocking: true,
	},
	{
		command: 'migration:typography:oracle',
		entry: 'next/scripts/assert-typography-oracle.ts',
		dataRoots: [],
		tier: 'push',
		blocking: true,
	},
	{
		command: 'migration:typography:oracle:controls',
		entry: 'next/scripts/assert-typography-oracle-controls.ts',
		dataRoots: [],
		tier: 'push',
		blocking: true,
	},
	{
		command: 'migration:ast',
		entry: 'next/scripts/assert-mdsvex-ast.ts',
		dataRoots: ['src/content/posts'],
		tier: 'push',
		blocking: true,
	},
	{
		command: 'migration:ast:controls',
		entry: 'next/scripts/assert-mdsvex-ast-controls.ts',
		dataRoots: ['src/content/posts'],
		tier: 'push',
		blocking: true,
	},
	{
		command: 'migration:c13',
		entry: 'scripts/assert-c13-shell.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...BASELINE],
		tier: 'push',
		blocking: true,
	},
	{
		command: 'migration:c13:controls',
		entry: 'scripts/assert-c13-shell-controls.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...BASELINE],
		tier: 'push',
		blocking: true,
	},
	{
		command: 'migration:article',
		entry: 'scripts/assert-article-parity.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...SVELTE_BUILD_SOURCES],
		tier: 'push',
		blocking: true,
	},
	{
		command: 'migration:article:controls',
		entry: 'scripts/assert-article-parity-controls.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...SVELTE_BUILD_SOURCES],
		tier: 'push',
		blocking: true,
	},
	{
		command: 'migration:projection',
		entry: 'scripts/assert-baseline-projection.ts',
		dataRoots: [...BASELINE],
		tier: 'push',
		blocking: true,
	},
	{
		command: 'migration:projection:controls',
		entry: 'scripts/assert-baseline-projection-controls.ts',
		dataRoots: [...BASELINE],
		tier: 'push',
		blocking: true,
	},
	{
		command: 'migration:verify:svelte',
		entry: 'scripts/migration-verify.ts',
		dataRoots: [...SVELTE_BUILD_SOURCES, ...BASELINE],
		tier: 'push',
		blocking: true,
	},
	{
		// The router routes itself: its controls are a suite like any other, so a
		// change to the selector runs them. Without this row a router edit would
		// go broad over every suite EXCEPT the one that checks the router.
		command: 'migration:route:controls',
		entry: 'scripts/migration-route-controls.ts',
		dataRoots: [],
		tier: 'push',
		blocking: true,
	},
	{
		// 265 s — more than the other fourteen combined, because each of its 40
		// controls re-captures the whole 366-page build. CI only, in its own job.
		command: 'migration:controls',
		entry: 'scripts/migration-verify-controls.ts',
		dataRoots: [...SVELTE_BUILD_SOURCES, ...BASELINE],
		tier: 'ci',
		blocking: true,
	},
	{
		// Exits 1 by design until the surface port closes parity. Reported in CI
		// as a progress number, never enforced; enforcing it now would mean
		// disabling it later, which is how a gate becomes decorative.
		command: 'migration:verify:next',
		entry: 'scripts/migration-verify.ts',
		dataRoots: [...NEXT_BUILD_SOURCES, ...BASELINE],
		tier: 'ci',
		blocking: false,
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
 * Both statement forms, each anchored to the start of a line. The anchor matters:
 * an unanchored bare-`import` alternative also matches an import-shaped STRING
 * LITERAL mid-line, and since an unresolvable specifier is fatal here, that turns
 * a quoted example in a comment or a test fixture into a hard router failure.
 * Anchoring narrows it to something that can actually be a statement; a literal
 * that still starts its own line errs toward the fatal, never toward silence.
 */
const IMPORT_RE =
	/(?:^|\n)[ \t]*(?:import|export)[^'"\n]*?from[ \t]*['"]([^'"]+)['"]|(?:^|\n)[ \t]*import[ \t]*['"]([^'"]+)['"]/g;
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
	for (const match of source.matchAll(IMPORT_RE)) {
		const specifier = match[1] ?? match[2];
		if (!specifier || !specifier.startsWith('.')) continue;
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
	const all = () => inTier.filter((s) => s.blocking).map((s) => s.command);

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
			if (suite.blocking) selected.add(suite.command);
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

async function main(argv: string[]): Promise<number> {
	const tier = (flagValue(argv, '--tier') ?? 'push') as 'push' | 'ci' | 'all';
	const inTier = SUITES.filter((s) => tier === 'all' || s.tier === tier);

	if (argv.includes('--list')) {
		for (const suite of inTier) {
			console.log(`${suite.blocking ? 'blocking' : 'report  '}  ${suite.command}`);
		}
		return 0;
	}

	let selection: Selection;
	if (argv.includes('--all')) {
		selection = {
			commands: inTier.filter((s) => s.blocking).map((s) => s.command),
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
		selection =
			changed === null
				? {
						commands: inTier.filter((s) => s.blocking).map((s) => s.command),
						broad: true,
						reasons: ['no resolvable push range (new branch or empty stdin)'],
					}
				: select(changed, tier);
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
