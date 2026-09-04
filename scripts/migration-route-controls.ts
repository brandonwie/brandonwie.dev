/**
 * Defect controls for the changed-surface router (`scripts/migration-route.ts`).
 *
 * A router is a check that decides which checks run, so a silent under-selection
 * is worse than any single suite failing: the suites that would have caught the
 * regression are simply never invoked, and the push reports green. Every rule
 * that can under-select therefore gets a control that BREAKS it and proves the
 * selection changes.
 *
 * Method: copy the real router source, apply one textual mutation, import the
 * mutant, and compare its selection against the real one. Two guards keep the
 * controls themselves honest —
 *
 *  - every mutation asserts its search text matched exactly once, so a control
 *    can never pass because its mutation silently matched nothing;
 *  - the vacuity guard below asserts the map is non-empty, every command exists
 *    as a `package.json` script, every entry file exists, and the derived import
 *    closures are actually larger than their entry files.
 *
 * Both exist because this lane has now shipped five separate checks that
 * reported success because they stopped looking.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { SUITES, importClosure, select, changedFromPushRefs } from './migration-route.ts';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ROUTER = join(REPO_ROOT, 'scripts/migration-route.ts');
const SOURCE = readFileSync(ROUTER, 'utf8');

interface Mutation {
	find: string;
	replace: string;
}

interface Control {
	id: string;
	kind: 'DEFECT' | 'INVARIANCE';
	what: string;
	mutations: Mutation[];
	/** The change set fed to both the real router and the mutant. */
	paths?: string[];
	/** Or a raw pre-push stdin payload, for the ref-parsing rules. */
	stdin?: string;
	/** Or a bespoke probe, for rules that are not expressible as a selection. */
	probe?: (mutant: RouterModule) => Promise<string>;
}

type RouterModule = typeof import('./migration-route.ts');

const ZERO = '0'.repeat(40);
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], {
	cwd: REPO_ROOT,
	encoding: 'utf8',
}).trim();
const PARENT = execFileSync('git', ['rev-parse', 'HEAD~1'], {
	cwd: REPO_ROOT,
	encoding: 'utf8',
}).trim();

const CONTROLS: Control[] = [
	{
		id: 'RT-01',
		kind: 'DEFECT',
		what: 'an unrecognised path stops selecting everything',
		mutations: [
			{
				find: '\t\treturn { commands: all(), broad: true, reasons: [`unknown surface: ${path}`] };',
				replace: '\t\tcontinue;',
			},
		],
		paths: ['resources/cover.png'],
	},
	{
		id: 'RT-02',
		kind: 'DEFECT',
		what: 'a shared config is declared inert and the config rule no longer overrides it',
		mutations: [
			{ find: '\t/^package\\.json$/,\n', replace: '' },
			{ find: '\t/^docs\\//,', replace: '\t/^docs\\//,\n\t/^package\\.json$/,' },
		],
		paths: ['package.json'],
	},
	{
		id: 'RT-03',
		kind: 'DEFECT',
		what: 'the hooks are declared inert and the selector guard no longer overrides it',
		mutations: [
			{ find: '\t/^docs\\//,', replace: '\t/^docs\\//,\n\t/^\\.husky\\//,' },
			{ find: ', /^\\.husky\\//]', replace: ']' },
		],
		paths: ['.husky/pre-push'],
	},
	{
		id: 'RT-04',
		kind: 'DEFECT',
		what: 'a first push of a new branch stops selecting everything',
		mutations: [
			{
				find: '\t\tif (ZERO_SHA.test(remoteSha)) return null; // new branch — no base to diff',
				replace: '\t\tif (ZERO_SHA.test(remoteSha)) continue;',
			},
		],
		stdin: `refs/heads/main ${HEAD} refs/heads/main ${PARENT}\nrefs/heads/new ${HEAD} refs/heads/new ${ZERO}`,
	},
	{
		id: 'RT-05',
		kind: 'DEFECT',
		what: 'the typography suite stops declaring the post corpus as an input',
		mutations: [
			{
				find: "\t\tcommand: 'migration:typography',\n\t\tentry: 'next/scripts/assert-corpus-typography.ts',\n\t\tdataRoots: ['src/content/posts', ...SVELTE_BUILD_SOURCES],",
				replace:
					"\t\tcommand: 'migration:typography',\n\t\tentry: 'next/scripts/assert-corpus-typography.ts',\n\t\tdataRoots: [],",
			},
		],
		paths: ['src/content/posts/en/backend/example.md'],
	},
	{
		id: 'RT-06',
		kind: 'DEFECT',
		what: 'the import graph is no longer followed, so a plugin edit reaches no suite',
		mutations: [
			{
				find: '\tif (seen.has(entry)) return seen;\n\tseen.add(entry);',
				replace:
					'\tif (seen.has(entry)) return seen;\n\tseen.add(entry);\n\tif (seen.size > 0) return seen;',
			},
		],
		paths: ['next/src/markdown/plugins/remark-smart-typography.ts'],
	},
	{
		id: 'RT-07',
		kind: 'DEFECT',
		what: 'an unresolvable import is swallowed instead of being fatal',
		mutations: [
			{
				find: '\tthrow new Error(`unresolvable local import ${specifier} from ${fromFile}`);',
				replace: '\treturn fromFile;',
			},
		],
		probe: async (mutant) => {
			const probeFile = join(REPO_ROOT, 'scripts', '.route-control-probe.ts');
			const missing = './definitely' + '-not-a-file-here';
			writeFileSync(probeFile, `import '${missing}';\n`);
			try {
				mutant.importClosure('scripts/.route-control-probe.ts');
				return 'resolved';
			} catch {
				return 'threw';
			} finally {
				rmSync(probeFile, { force: true });
			}
		},
	},
	{
		id: 'RT-08',
		kind: 'DEFECT',
		what: 'root markdown stops being inert, so a docs-only push runs everything',
		mutations: [{ find: '\t/^[^/]+\\.md$/,\n', replace: '' }],
		paths: ['README.md', 'PROGRESS.md'],
	},
	{
		id: 'RT-10',
		kind: 'DEFECT',
		what: 'import discovery goes back to a line-bound regex and cannot see a multiline import',
		mutations: [
			{
				find: '\tconst scanned = ts.preProcessFile(source, true, true);\n\treturn scanned.importedFiles.map((file) => file.fileName);',
				replace:
					'\treturn [...source.matchAll(/(?:^|\\n)[ \\t]*import[^\'"\\n]*?from[ \\t]*[\'"]([^\'"]+)[\'"]/g)].map(\n\t\t(match) => match[1],\n\t);',
			},
		],
		// `migration:typography:oracle:controls` reaches the pipeline ONLY through
		// the multiline `import { ... } from './assert-typography-oracle'` at
		// `assert-typography-oracle-controls.ts:19-24`. The shipped regex missed it.
		paths: ['next/src/markdown/pipeline.ts'],
	},
	{
		id: 'RT-09',
		kind: 'INVARIANCE',
		what: 'widening the inert list elsewhere leaves a docs-only push selecting nothing — paired with RT-08 over the same surface',
		mutations: [{ find: '\t/^docs\\//,', replace: '\t/^docs\\//,\n\t/^resources\\//,' }],
		paths: ['README.md', 'docs/todos.md'],
	},
];

function mutate(control: Control): string {
	let source = SOURCE;
	for (const { find, replace } of control.mutations) {
		const occurrences = source.split(find).length - 1;
		// The no-op mutation guard. A control whose search text matches nothing
		// mutates nothing, and then "detects" a defect that was never introduced.
		if (occurrences !== 1) {
			throw new Error(
				`${control.id}: mutation matched ${occurrences} times, expected exactly 1 — ${JSON.stringify(find.slice(0, 60))}`,
			);
		}
		source = source.replace(find, replace);
	}
	if (source === SOURCE) throw new Error(`${control.id}: mutation left the source unchanged`);
	return source;
}

async function loadMutant(control: Control): Promise<{ mod: RouterModule; cleanup: () => void }> {
	// Written beside the real router so `import.meta.url`-derived REPO_ROOT and
	// every relative resolution behave exactly as they do in production.
	const dir = mkdtempSync(join(tmpdir(), 'route-control-'));
	const file = join(REPO_ROOT, 'scripts', `.route-control-${control.id}.ts`);
	writeFileSync(file, mutate(control));
	const mod = (await import(`${pathToFileURL(file).href}?v=${basename(dir)}`)) as RouterModule;
	return { mod, cleanup: () => rmSync(file, { force: true }) };
}

function describe(control: Control, mod: RouterModule): string {
	if (control.stdin !== undefined) {
		const changed = mod.changedFromPushRefs(control.stdin);
		return changed === null ? 'broad(null)' : `paths(${changed.length})`;
	}
	const selection = mod.select(control.paths!);
	return `${selection.broad ? 'broad' : 'scoped'}:${selection.commands.join('|')}`;
}

function baseline(control: Control): string {
	if (control.stdin !== undefined) {
		const changed = changedFromPushRefs(control.stdin);
		return changed === null ? 'broad(null)' : `paths(${changed.length})`;
	}
	const selection = select(control.paths!);
	return `${selection.broad ? 'broad' : 'scoped'}:${selection.commands.join('|')}`;
}

/**
 * The map itself must be real before any control means anything: a router over
 * zero suites, dangling entry files, or commands that are not scripts would let
 * every control below pass while routing nothing.
 */

/**
 * Which registered suites actually reach a runner, and why the answer is not
 * just "which tier does `migration:all` select".
 *
 * THE ORIGINAL DEFECT. `migration:all` selected `--tier push` while five
 * registered ci-tier suites sat in no runner at all, including the 86-control
 * `migration:gsap-palette:controls` that gate G2's approval cites as evidence.
 *
 * WHY SELECTION IS NOT EXECUTION. A first version of this check read only the
 * tier and exclusions and therefore could not see three other ways the chain
 * breaks, each of which scored a clean 10/10 against it:
 *
 *   1. `migration:all` loses `--run` — it selects suites and executes none.
 *   2. the `pnpm run migration:all` step leaves `ci.yml` — the script is correct
 *      and nothing calls it.
 *   3. a named step is commented out — inert, but still matches a naive grep.
 *
 * A SECOND ROUND found four more, every one of which also scored a clean 10/10:
 *
 *   4. `migration:all` loses `--all` — it then routes by changed surface, so a
 *      diff that touches nothing selects nothing, and CI proves nothing.
 *   5. `migration:all` is not the router at all — `echo --all --run --tier all`
 *      carries every flag this guard reads and executes no suite.
 *   6. the CI invocation survives only as an INLINE comment
 *      (`- # run: pnpm run migration:all`) — the line does not start with `#`,
 *      so a leading-`#` filter leaves it in the active text.
 *   7. the pre-push hook stops invoking the router — every push-tier suite was
 *      granted reachability from its tier alone, without anything reading the
 *      hook, which is precisely how `migration:c3`'s CI exclusion could have
 *      become a hiding place.
 *
 * Every link is now checked from the runner backwards: which YAML `run:` blocks
 * are ACTIVE, whether the script they name is the router, whether its argv makes
 * the router select and execute, and whether the hook still calls it.
 * `SELF_CHECKS` pins all seven shapes.
 *
 * Pure by construction: it takes the package scripts, the workflow text and the
 * hook text as arguments rather than reading them, so a control can hand it a
 * mutant.
 */

/** `tsx scripts/migration-route.ts`, however the caller spells the runner. */
const ROUTER_INVOCATION =
	/(?:^|[\s;&|(])(?:corepack\s+)?(?:pnpm\s+exec\s+|npx\s+)?(?:tsx|node|deno\s+run(?:\s+-{1,2}\S+)*)\s+(?:-{1,2}\S+\s+)*(?:\.\/)?scripts\/migration-route\.ts(?=\s|$)/;

/**
 * The commands a CI run actually executes: the payloads of active `run:` keys,
 * with full-line AND inline YAML comments removed first.
 *
 * Scanning the raw workflow text was wrong twice over. A line such as
 * `- # run: pnpm run migration:all` does not start with `#`, so a leading-`#`
 * filter keeps it; and any prose in a `name:` or a `with:` value matched the
 * same way a real command did.
 */
export function activeRunCommands(workflow: string): string[] {
	const lines = workflow
		.split('\n')
		// A `#` opens a comment at line start or after whitespace. Stripping is the
		// fail-closed direction: over-stripping hides an invocation and this guard
		// then reports it, which is the safe error.
		.map((line) => line.replace(/(^|\s)#.*$/, '$1').trimEnd());

	const commands: string[] = [];
	for (let i = 0; i < lines.length; i += 1) {
		const match = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lines[i]);
		if (!match) continue;
		const indent = match[1].length;
		const inline = match[2].trim();
		if (inline !== '' && !/^[|>][-+\d]*$/.test(inline)) {
			commands.push(inline);
			continue;
		}
		// Block scalar: every following line indented past the key belongs to it.
		for (let j = i + 1; j < lines.length; j += 1) {
			if (lines[j].trim() === '') continue;
			if (lines[j].length - lines[j].trimStart().length <= indent) break;
			commands.push(lines[j].trim());
		}
	}
	return commands;
}

export function reachabilityFailures(
	scripts: Record<string, string>,
	workflow: string,
	hook: string,
	suites: readonly { command: string; tier: 'push' | 'ci' }[] = SUITES,
): string[] {
	const problems: string[] = [];

	const activeRuns = activeRunCommands(workflow).join('\n');
	const invokedInCI = (command: string): boolean =>
		new RegExp(`pnpm (?:run |exec )?${command.replace(/[:]/g, '[:]')}(\\s|$)`, 'm').test(
			activeRuns,
		);

	const allArgv = scripts['migration:all'] ?? '';
	const allTier = /--tier\s+(push|ci|all)/.exec(allArgv)?.[1] ?? 'push';
	// Trimmed to match `excluded()` in the router: the two must agree on what is
	// excluded, or this guard clears a suite the router is quietly dropping.
	const allExcluded = new Set(
		(/--exclude\s+(\S+)/.exec(allArgv)?.[1] ?? '')
			.split(',')
			.map((n) => n.trim())
			.filter(Boolean),
	);

	// The argv's flags mean nothing unless the script they belong to is the
	// router. `echo --all --run --tier all` reads identically to every flag check
	// below and executes nothing.
	const allIsRouter = ROUTER_INVOCATION.test(allArgv);
	if (!allIsRouter) {
		problems.push(
			`migration:all does not invoke scripts/migration-route.ts — its flags route nothing: ${allArgv || '(missing script)'}`,
		);
	}
	const allSelectsEverything = /(^|\s)--all(\s|$)/.test(allArgv);
	if (!allSelectsEverything) {
		problems.push(
			`migration:all has no --all, so it routes by changed surface and a diff that touches nothing runs nothing: ${allArgv || '(missing script)'}`,
		);
	}
	const allRuns = /(^|\s)--run(\s|$)/.test(allArgv);
	if (!allRuns) {
		problems.push(
			`migration:all selects suites but does not run them — its argv has no --run: ${allArgv || '(missing script)'}`,
		);
	}
	const allInvoked = invokedInCI('migration:all');
	if (!allInvoked) {
		problems.push(
			'migration:all is never invoked by an active ci.yml step — the suites it selects reach no runner',
		);
	}

	// The hook is the ONLY runner a push-tier suite has once CI excludes it, so
	// its tier is evidence of nothing until something confirms the hook still
	// calls the router with --run.
	const hookRuns = hook
		.split('\n')
		.filter((line) => !/^\s*#/.test(line))
		.some((line) => ROUTER_INVOCATION.test(line) && /(^|\s)--run(\s|$)/.test(line));
	if (!hookRuns) {
		problems.push(
			'.husky/pre-push does not invoke scripts/migration-route.ts --run — push-tier suites have no runner at all',
		);
	}

	// THREE WAYS A SUITE CAN BE REACHED, and no fourth:
	//   1. `migration:all` selects AND runs it, it is the router, and an active
	//      ci.yml step invokes it;
	//   2. an active `ci.yml` step names the suite itself;
	//   3. it is PUSH tier AND the pre-push hook verifiably runs the router, so
	//      the router selects it on the developer machine when its inputs change.
	//
	// (3) is what makes a CI exclusion honest rather than a hiding place:
	// `migration:c3` drives Deno scripts that read the 3B knowledge base, which
	// CI has no checkout of, so its 3B-dependent rows are excluded there and
	// carried at push tier instead — while its hermetic rows and its loopback
	// controls stay in CI as `migration:c3:hermetic`. A CI-tier suite that is
	// excluded and unnamed is reachable by nothing at all, and still fails here.
	const unreached = suites
		.filter((suite) => {
			const viaAll =
				allIsRouter &&
				allSelectsEverything &&
				allRuns &&
				allInvoked &&
				(allTier === 'all' || suite.tier === allTier) &&
				!allExcluded.has(suite.command);
			const viaHook = suite.tier === 'push' && hookRuns;
			return !viaAll && !invokedInCI(suite.command) && !viaHook;
		})
		.map((s) => s.command);
	if (unreached.length > 0) {
		problems.push(
			`${unreached.length} registered suite(s) are executed by nothing — ` +
				`neither migration:all (tier ${allTier}) nor a named ci.yml step nor the pre-push hook: ${unreached.join(', ')}`,
		);
	}
	return problems;
}

/**
 * Committed negative controls for `reachabilityFailures`. Each supplies a
 * deliberately broken invocation chain and asserts the guard reports it. They
 * are pure string inputs, so they neither mutate the tree nor depend on it.
 */
const GOOD_ALL = 'tsx scripts/migration-route.ts --all --run --tier all';
const GOOD_HOOK =
	'printf \'%s\\n\' "$PUSH_REFS" | corepack pnpm exec tsx scripts/migration-route.ts --run || exit 1\n';
const GOOD_WORKFLOW = '      - run: pnpm run migration:all\n';
const DEFAULT_SUITES = [
	{ command: 'migration:all', tier: 'push' as const },
	{ command: 'migration:controls', tier: 'ci' as const },
];

const SELF_CHECKS: {
	id: string;
	what: string;
	scripts: Record<string, string>;
	workflow: string;
	hook?: string;
	suites?: { command: string; tier: 'push' | 'ci' }[];
}[] = [
	{
		id: 'RX-01',
		what: 'migration:all selects but never runs (--run dropped)',
		scripts: { 'migration:all': 'tsx scripts/migration-route.ts --all --tier all' },
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-02',
		what: 'migration:all is correct but no active ci.yml step invokes it',
		scripts: { 'migration:all': GOOD_ALL },
		workflow: '      - run: pnpm run build\n',
	},
	{
		id: 'RX-03',
		what: 'the only step naming a suite is commented out',
		scripts: { 'migration:all': 'tsx scripts/migration-route.ts --all --run --tier push' },
		workflow: '      - run: pnpm run migration:all\n      # - run: pnpm run migration:controls\n',
	},
	{
		id: 'RX-04',
		what: 'a ci-tier suite excluded from migration:all and named by no step — reachable by nothing',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:controls',
		},
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-05',
		what: 'migration:all loses --all, so it routes by changed surface instead of running everything',
		scripts: { 'migration:all': 'tsx scripts/migration-route.ts --run --tier all' },
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-06',
		what: 'migration:all carries every routing flag but is not the router (echo)',
		scripts: { 'migration:all': 'echo --all --run --tier all' },
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-07',
		what: 'the CI invocation survives only as an inline comment on an active line',
		scripts: { 'migration:all': GOOD_ALL },
		workflow: '      - run: pnpm run build # run: pnpm run migration:all\n',
	},
	{
		id: 'RX-08',
		what: 'the pre-push hook stops invoking the router, stranding every CI-excluded push suite',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'echo "Running pre-push checks..."\ncorepack pnpm run lint || exit 1\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
];

function selfCheckFailures(): string[] {
	const problems: string[] = [];
	for (const check of SELF_CHECKS) {
		const reported = reachabilityFailures(
			check.scripts,
			check.workflow,
			check.hook ?? GOOD_HOOK,
			check.suites ?? DEFAULT_SUITES,
		);
		if (reported.length === 0) {
			problems.push(`${check.id} did not fail closed: ${check.what}`);
		}
	}
	// A self-check set that only ever feeds BROKEN chains cannot tell "the guard
	// reports everything" from "the guard works". The intact chain must pass.
	const intact = reachabilityFailures(
		{ 'migration:all': GOOD_ALL },
		GOOD_WORKFLOW,
		GOOD_HOOK,
		DEFAULT_SUITES,
	);
	if (intact.length > 0) {
		problems.push(`RX-00 the intact invocation chain was reported as broken: ${intact.join('; ')}`);
	}
	return problems;
}

function vacuityGuard(): string[] {
	const failures: string[] = [];
	const scripts = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
		.scripts as Record<string, string>;
	if (SUITES.length < 10) failures.push(`suite map has only ${SUITES.length} entries`);
	for (const suite of SUITES) {
		if (!(suite.command in scripts)) failures.push(`${suite.command} is not a package.json script`);
		if (!existsSync(join(REPO_ROOT, suite.entry)))
			failures.push(`${suite.command}: missing entry ${suite.entry}`);
		for (const root of suite.dataRoots) {
			if (!existsSync(join(REPO_ROOT, root)))
				failures.push(`${suite.command}: missing data root ${root}`);
		}
	}
	// The edge a reviewer found missing. Pinned by name because a scanner can be
	// complete for every form this repository happens to use today and blind to
	// the one it gains tomorrow; this is the one that was actually wrong.
	const oracleControls = importClosure('next/scripts/assert-typography-oracle-controls.ts');
	if (!oracleControls.has('next/scripts/assert-typography-oracle.ts')) {
		failures.push(
			'the multiline import at assert-typography-oracle-controls.ts:19-24 is invisible to import discovery',
		);
	}

	// EVERY REGISTERED SUITE MUST BE EXECUTED BY SOMETHING.
	//
	// This is the guard that was missing. `migration:all` selected `--tier push`
	// only, so five registered ci-tier suites ran nowhere: not in the hook, not
	// in `migration:all`, not in any `ci.yml` step. `migration:gsap-palette:controls`
	// -- 86 controls, cited by gate G2's approval as its evidence -- was among
	// them, and nothing would have noticed if it had started failing.
	//
	// The computation lives in `reachabilityFailures` so it can be exercised
	// against mutated inputs without touching the working tree; `SELF_CHECKS`
	// below does exactly that. See that function for why selection alone is not
	// enough.
	const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
		scripts: Record<string, string>;
	};
	const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
	const hook = readFileSync(join(REPO_ROOT, '.husky/pre-push'), 'utf8');
	failures.push(...reachabilityFailures(pkg.scripts, workflow, hook));
	failures.push(...selfCheckFailures());

	// At least one suite must reach a real dependency graph, or the derivation is
	// decorative and the map is a hand-written table wearing a computation.
	const derived = SUITES.filter((s) => importClosure(s.entry).size > 1);
	if (derived.length < SUITES.length / 2) {
		failures.push(
			`only ${derived.length}/${SUITES.length} suites derive a non-trivial import closure`,
		);
	}
	return failures;
}

async function main(): Promise<number> {
	const vacuity = vacuityGuard();
	for (const failure of vacuity) console.error(`VACUITY  ${failure}`);
	if (vacuity.length > 0) {
		console.error(`\nRESULT: vacuity guard failed with ${vacuity.length} problem(s)`);
		return 2;
	}

	let passed = 0;
	for (const control of CONTROLS) {
		const before = control.probe ? 'threw' : baseline(control);
		const { mod, cleanup } = await loadMutant(control);
		let after: string;
		try {
			after = control.probe ? await control.probe(mod) : describe(control, mod);
		} finally {
			cleanup();
		}
		const reference = control.probe ? 'threw' : before;
		const changed = after !== reference;
		const ok = control.kind === 'DEFECT' ? changed : !changed;
		if (ok) passed += 1;
		console.log(
			`${ok ? 'PASS' : 'FAIL'}  ${control.id}  ${control.kind}  ${control.what}\n        ${reference}  ->  ${after}`,
		);
	}
	console.log(`\nRESULT: ${passed}/${CONTROLS.length}`);
	return passed === CONTROLS.length ? 0 : 1;
}

main().then((code) => process.exit(code));
