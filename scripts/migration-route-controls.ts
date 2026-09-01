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
