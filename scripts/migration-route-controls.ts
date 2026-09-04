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
 * A THIRD ROUND found the shape underneath all of them. Matching a command
 * ANYWHERE in a string is not recognising a command: `echo tsx
 * scripts/migration-route.ts --all --run` and `echo pnpm run migration:all` are
 * inert, and every regex above accepted both because the text they print is
 * spelled exactly like the command they do not run.
 *
 *   8.  `migration:all` = `echo tsx scripts/migration-route.ts --all --run …`
 *   9.  the CI step is `echo pnpm run migration:all`
 *   10. the only step naming an excluded suite is `echo pnpm run migration:controls`
 *   11. the hook line is `echo tsx scripts/migration-route.ts --run`
 *
 * So a command is now recognised only in COMMAND POSITION. The text is split on
 * shell separators, each segment is tokenised, leading environment assignments
 * and transparent wrappers (`corepack`, `env`, `npx`, `pnpm exec`) are stripped,
 * and the recognisers look at the resulting HEAD token. `echo` is a head like
 * any other, and it is not a runner.
 *
 * Every link is now checked from the runner backwards: which YAML `run:` blocks
 * are ACTIVE, which segment of them is in command position, whether that command
 * is the router, whether its own argv makes the router select and execute, and
 * whether the hook still calls it. `SELF_CHECKS` pins all eleven shapes, each
 * asserting the SPECIFIC diagnostic rather than merely a non-empty list.
 *
 * Pure by construction: it takes the package scripts, the workflow text and the
 * hook text as arguments rather than reading them, so a control can hand it a
 * mutant.
 */

/**
 * A DELIBERATELY NARROW COMMAND GRAMMAR.
 *
 * A FIFTH ROUND showed that "head token is a runner" is still not "this runs the
 * router". Five more inert forms cleared the previous recogniser:
 *
 *   12. `node -e "" scripts/migration-route.ts --all --run` — `-e` runs the
 *       string, never the file, and the path is merely an argument.
 *   13. `pnpm --help migration:controls` — prints help; the suite name was read
 *       as the script because every leading flag was skipped blindly.
 *   14. `echo "skip; tsx scripts/migration-route.ts --all --run"` — quote-blind
 *       splitting on `;` manufactured a segment whose head was `tsx`.
 *   15. `echo "skip | pnpm run migration:all"` — the same, on a pipe.
 *   16. `corepack pnpm run lint # tsx scripts/migration-route.ts --run` — a
 *       shell comment is not a command, and only line-leading `#` was dropped.
 *
 * So the grammar below ACCEPTS a finite set of forms and rejects everything
 * else, rather than approximating a shell and hoping. Quoting is modelled, not
 * ignored; the script operand is identified positionally; runner flags that
 * change what runs (`-e`, `--help`, `--version`, …) are terminal and reject the
 * segment. Anything this grammar cannot parse simply fails to match, and an
 * unmatched invocation is REPORTED as missing — a false alarm, which is the
 * survivable direction.
 */

/** `scripts/migration-route.ts`, however the path is spelled. */
const ROUTER_PATH = /(?:^|\/)scripts\/migration-route\.ts$/;

/** Wrappers that pass their tail through unchanged: the command is what follows. */
const TRANSPARENT = new Set(['corepack', 'env', 'sudo', 'command']);
/** Runner heads that execute a script operand. */
const RUNNERS = new Set(['tsx', 'node']);
/** Runner flags that change WHAT runs, so the operand after them is not executed. */
const TERMINAL_RUNNER_FLAGS = new Set([
	'-e',
	'--eval',
	'-p',
	'--print',
	'-c',
	'--check',
	'-i',
	'--interactive',
	'-h',
	'--help',
	'-v',
	'--version',
	'--stdin',
	'--completion-bash',
]);
/** Runner flags that consume the NEXT token, which is therefore not the operand. */
const VALUE_RUNNER_FLAGS = new Set([
	'--tsconfig',
	'--require',
	'-r',
	'--import',
	'--loader',
	'--experimental-loader',
	'--conditions',
	'--env-file',
]);
/** pnpm flags that leave `pnpm [run] <script>` intact. Everything else rejects. */
const PNPM_BOOLEAN_FLAGS = new Set([
	'-s',
	'--silent',
	'-r',
	'--recursive',
	'--workspace-root',
	'-w',
	'--if-present',
]);
const PNPM_VALUE_FLAGS = new Set(['-C', '--dir', '--filter', '--reporter', '--loglevel']);

/**
 * Quote-aware tokenizer. Returns one token list per shell command.
 *
 * Quoting is the point: inside quotes a `;`, `|` or `#` is TEXT, so
 * `echo "skip; tsx scripts/migration-route.ts"` is one command whose head is
 * `echo` — not two commands, the second of which looks like a router run.
 * Outside quotes, `#` at the start of a token opens a comment to end of line.
 */
export function commandSegments(text: string): string[][] {
	const segments: string[][] = [];
	let tokens: string[] = [];
	let current = '';
	let started = false;
	let quote: string | null = null;

	const endToken = (): void => {
		if (started) tokens.push(current);
		current = '';
		started = false;
	};
	const endSegment = (): void => {
		endToken();
		if (tokens.length > 0) segments.push(tokens);
		tokens = [];
	};

	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];
		if (quote !== null) {
			if (ch === quote) quote = null;
			else current += ch;
			continue;
		}
		if (ch === '\\') {
			// `\` before a newline is a LINE CONTINUATION: both characters vanish and
			// the token continues. Keeping the newline glued the operand to the next
			// line and made a real, wrapped invocation report as missing.
			if (text[i + 1] === '\n') {
				i += 1;
				continue;
			}
			i += 1;
			if (i < text.length) {
				current += text[i];
				started = true;
			}
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			started = true;
			continue;
		}
		if (ch === '#' && !started) {
			while (i < text.length && text[i] !== '\n') i += 1;
			endSegment();
			continue;
		}
		if (ch === '\n') {
			endSegment();
			continue;
		}
		if (/\s/.test(ch)) {
			endToken();
			continue;
		}
		if (ch === ';' || ch === '&' || ch === '|' || ch === '(' || ch === ')') {
			endSegment();
			continue;
		}
		current += ch;
		started = true;
	}
	endSegment();

	return segments
		.map((segment) => {
			let rest = segment;
			// `FOO=bar cmd` — assignments precede the command, they are not it.
			while (rest.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0])) rest = rest.slice(1);
			for (;;) {
				// A wrapper is transparent only when what follows is a command, not a
				// flag: `corepack --help pnpm run x` runs no script.
				if (rest.length > 1 && TRANSPARENT.has(rest[0]) && !rest[1].startsWith('-')) {
					rest = rest.slice(1);
					continue;
				}
				if (rest.length > 2 && rest[0] === 'pnpm' && (rest[1] === 'exec' || rest[1] === 'dlx')) {
					rest = rest.slice(2);
					continue;
				}
				break;
			}
			return rest;
		})
		.filter((tokens) => tokens.length > 0);
}

/**
 * The router's OWN arguments, for the segment that executes
 * `scripts/migration-route.ts`, or null when no segment does.
 *
 * The operand is found positionally: runner flags are consumed by name, the
 * first remaining non-flag token is what the runner executes, and it must be the
 * router. `node -e "" scripts/migration-route.ts --all` rejects on `-e`;
 * `node other.ts scripts/migration-route.ts` rejects because the operand is
 * `other.ts` and the router path is just an argument to it.
 */
export function routerSegment(text: string): string[] | null {
	for (const tokens of commandSegments(text)) {
		let i = 0;
		if (tokens[i] === 'deno') {
			if (tokens[i + 1] !== 'run') continue;
			i += 2;
		} else if (RUNNERS.has(tokens[i])) {
			i += 1;
		} else {
			continue;
		}
		let terminal = false;
		while (i < tokens.length && tokens[i].startsWith('-')) {
			const flag = tokens[i].split('=')[0];
			if (TERMINAL_RUNNER_FLAGS.has(flag)) {
				terminal = true;
				break;
			}
			// `--flag=value` carries its value; `--flag value` eats the next token.
			if (VALUE_RUNNER_FLAGS.has(flag) && !tokens[i].includes('=')) i += 1;
			i += 1;
		}
		if (terminal || i >= tokens.length) continue;
		if (!ROUTER_PATH.test(tokens[i])) continue;
		return tokens.slice(i + 1);
	}
	return null;
}

/**
 * True when some segment RUNS `pnpm [run] <command>` — not prints it, and not
 * `pnpm --help <command>`, which looks the command up and runs nothing.
 */
export function invokesScript(text: string, command: string): boolean {
	for (const tokens of commandSegments(text)) {
		if (tokens[0] !== 'pnpm') continue;
		let i = 1;
		let rejected = false;
		while (i < tokens.length && tokens[i].startsWith('-')) {
			const flag = tokens[i].split('=')[0];
			if (PNPM_BOOLEAN_FLAGS.has(flag)) i += 1;
			else if (PNPM_VALUE_FLAGS.has(flag)) i += tokens[i].includes('=') ? 1 : 2;
			else {
				// An unrecognised flag may be terminal (`--help`, `--version`) or may
				// change what runs. Refusing is the fail-closed answer.
				rejected = true;
				break;
			}
		}
		if (rejected) continue;
		if (tokens[i] === 'run') i += 1;
		if (tokens[i] === command) return true;
	}
	return false;
}

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
	const invokedInCI = (command: string): boolean => invokesScript(activeRuns, command);

	const allArgv = scripts['migration:all'] ?? '';
	// EVERY flag below is read off the ROUTER SEGMENT, never off the whole script
	// text. `echo tsx scripts/migration-route.ts --all --run --tier all` carries
	// every flag this guard looks for and runs nothing; its head is `echo`, so
	// `routerSegment` returns null and those flags are never consulted.
	const routerArgv = routerSegment(allArgv);
	const allIsRouter = routerArgv !== null;
	if (!allIsRouter) {
		problems.push(
			`migration:all does not run scripts/migration-route.ts in command position — its flags route nothing: ${allArgv || '(missing script)'}`,
		);
	}
	const argv = routerArgv ?? [];
	const flagValue = (name: string): string | undefined => {
		const at = argv.indexOf(name);
		return at >= 0 ? argv[at + 1] : undefined;
	};
	const allTier = (['push', 'ci', 'all'] as const).find((t) => flagValue('--tier') === t) ?? 'push';
	// Trimmed to match `excluded()` in the router: the two must agree on what is
	// excluded, or this guard clears a suite the router is quietly dropping.
	const allExcluded = new Set(
		(flagValue('--exclude') ?? '')
			.split(',')
			.map((n) => n.trim())
			.filter(Boolean),
	);

	const allSelectsEverything = argv.includes('--all');
	if (allIsRouter && !allSelectsEverything) {
		problems.push(
			`migration:all has no --all, so it routes by changed surface and a diff that touches nothing runs nothing: ${allArgv || '(missing script)'}`,
		);
	}
	const allRuns = argv.includes('--run');
	if (allIsRouter && !allRuns) {
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
	// RUNS the router with --run.
	const hookActive = hook
		.split('\n')
		.filter((line) => !/^\s*#/.test(line))
		.join('\n');
	const hookArgv = routerSegment(hookActive);
	const hookRuns = hookArgv !== null && hookArgv.includes('--run');
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
	/**
	 * A distinctive fragment of the diagnostic this broken chain must produce.
	 * Asserting merely "some problem was reported" would let one recogniser's
	 * message cover another recogniser's blind spot -- which is how four echo
	 * shapes survived a round that already had eight self-checks.
	 */
	expect: string;
	scripts: Record<string, string>;
	workflow: string;
	hook?: string;
	suites?: { command: string; tier: 'push' | 'ci' }[];
}[] = [
	{
		id: 'RX-01',
		expect: 'does not run them',
		what: 'migration:all selects but never runs (--run dropped)',
		scripts: { 'migration:all': 'tsx scripts/migration-route.ts --all --tier all' },
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-02',
		expect: 'never invoked by an active ci.yml step',
		what: 'migration:all is correct but no active ci.yml step invokes it',
		scripts: { 'migration:all': GOOD_ALL },
		workflow: '      - run: pnpm run build\n',
	},
	{
		id: 'RX-03',
		expect: 'executed by nothing',
		what: 'the only step naming a suite is commented out',
		scripts: { 'migration:all': 'tsx scripts/migration-route.ts --all --run --tier push' },
		workflow: '      - run: pnpm run migration:all\n      # - run: pnpm run migration:controls\n',
	},
	{
		id: 'RX-04',
		expect: 'executed by nothing',
		what: 'a ci-tier suite excluded from migration:all and named by no step — reachable by nothing',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:controls',
		},
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-05',
		expect: 'has no --all',
		what: 'migration:all loses --all, so it routes by changed surface instead of running everything',
		scripts: { 'migration:all': 'tsx scripts/migration-route.ts --run --tier all' },
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-06',
		expect: 'not run scripts/migration-route.ts in command position',
		what: 'migration:all carries every routing flag but is not the router (echo)',
		scripts: { 'migration:all': 'echo --all --run --tier all' },
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-07',
		expect: 'never invoked by an active ci.yml step',
		what: 'the CI invocation survives only as an inline comment on an active line',
		scripts: { 'migration:all': GOOD_ALL },
		workflow: '      - run: pnpm run build # run: pnpm run migration:all\n',
	},
	{
		id: 'RX-08',
		expect: 'does not invoke scripts/migration-route.ts --run',
		what: 'the pre-push hook stops invoking the router, stranding every CI-excluded push suite',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'echo "Running pre-push checks..."\ncorepack pnpm run lint || exit 1\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	// THE ECHO FAMILY. Each prints text spelled exactly like the command it does
	// not run. They are separate rows rather than one because they exercise three
	// different recognisers, and a shared message would hide two of them.
	{
		id: 'RX-09',
		what: 'migration:all echoes a correct router invocation instead of running it',
		expect: 'not run scripts/migration-route.ts in command position',
		scripts: { 'migration:all': `echo ${GOOD_ALL}` },
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-10',
		what: 'the ci.yml step echoes `pnpm run migration:all` instead of running it',
		expect: 'never invoked by an active ci.yml step',
		scripts: { 'migration:all': GOOD_ALL },
		workflow: '      - run: echo pnpm run migration:all\n',
	},
	{
		id: 'RX-11',
		what: 'the only step naming an excluded suite echoes it',
		expect: 'executed by nothing',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:controls',
		},
		workflow:
			'      - run: pnpm run migration:all\n      - run: echo pnpm run migration:controls\n',
	},
	{
		id: 'RX-13',
		what: 'migration:all is `node -e` with the router path as a mere argument',
		expect: 'not run scripts/migration-route.ts in command position',
		scripts: { 'migration:all': 'node -e "" scripts/migration-route.ts --all --run --tier all' },
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-14',
		what: 'the CI step is `pnpm --help migration:all`, which looks the script up and runs nothing',
		expect: 'never invoked by an active ci.yml step',
		scripts: { 'migration:all': GOOD_ALL },
		workflow: '      - run: pnpm --help migration:all\n',
	},
	{
		id: 'RX-15',
		what: 'a quoted separator manufactures a router segment inside an echo argument',
		expect: 'not run scripts/migration-route.ts in command position',
		scripts: { 'migration:all': `echo "skip; ${GOOD_ALL}"` },
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-16',
		what: 'a quoted pipe manufactures a CI invocation inside an echo argument',
		expect: 'never invoked by an active ci.yml step',
		scripts: { 'migration:all': GOOD_ALL },
		workflow: '      - run: echo "skip | pnpm run migration:all"\n',
	},
	{
		id: 'RX-17',
		what: "the hook's router call survives only after an inline shell comment",
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'corepack pnpm run lint # tsx scripts/migration-route.ts --run\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	{
		id: 'RX-12',
		what: 'the hook echoes the router invocation instead of running it',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'echo tsx scripts/migration-route.ts --run\n',
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
		} else if (!reported.some((line) => line.includes(check.expect))) {
			problems.push(
				`${check.id} reported the wrong break — expected a diagnostic containing ` +
					`"${check.expect}", got: ${reported.join('; ')}`,
			);
		}
	}
	// A self-check set that only ever feeds BROKEN chains cannot tell "the guard
	// reports everything" from "the guard works", and a grammar this narrow can
	// fail by rejecting real forms as easily as by clearing inert ones. Every
	// shape below is a WORKING chain and must be reported as silent.
	const POSITIVE: {
		id: string;
		what: string;
		scripts: Record<string, string>;
		workflow: string;
		hook: string;
	}[] = [
		{
			id: 'RX-00',
			what: 'the intact chain',
			scripts: { 'migration:all': GOOD_ALL },
			workflow: GOOD_WORKFLOW,
			hook: GOOD_HOOK,
		},
		{
			id: 'RX-00b',
			what: 'corepack in front of the CI invocation',
			scripts: { 'migration:all': GOOD_ALL },
			workflow: '      - run: corepack pnpm run migration:all\n',
			hook: GOOD_HOOK,
		},
		{
			id: 'RX-00c',
			what: 'pnpm -s and no `run` keyword',
			scripts: { 'migration:all': GOOD_ALL },
			workflow: '      - run: pnpm -s migration:all\n',
			hook: GOOD_HOOK,
		},
		{
			id: 'RX-00d',
			what: 'a runner value flag before the operand (--tsconfig)',
			scripts: {
				'migration:all':
					'tsx --tsconfig tsconfig.scripts.json scripts/migration-route.ts --all --run --tier all',
			},
			workflow: GOOD_WORKFLOW,
			hook: GOOD_HOOK,
		},
		{
			id: 'RX-00e',
			what: 'an echo followed by a real invocation in the same script',
			scripts: { 'migration:all': `echo routing; ${GOOD_ALL}` },
			workflow: GOOD_WORKFLOW,
			hook: GOOD_HOOK,
		},
		{
			id: 'RX-00g',
			what: 'a hook invocation wrapped across a backslash-newline continuation',
			scripts: { 'migration:all': GOOD_ALL },
			workflow: GOOD_WORKFLOW,
			hook: 'corepack pnpm exec tsx \\\n\tscripts/migration-route.ts \\\n\t--run || exit 1\n',
		},
		{
			id: 'RX-00h',
			what: 'a CI step wrapped across a backslash-newline continuation',
			scripts: { 'migration:all': GOOD_ALL },
			workflow: '      - run: |\n          pnpm run \\\n            migration:all\n',
			hook: GOOD_HOOK,
		},
		{
			id: 'RX-00f',
			what: 'the hook invocation inside a pipeline, after a comment line',
			scripts: { 'migration:all': GOOD_ALL },
			workflow: GOOD_WORKFLOW,
			hook: `# routed by changed surface\n${GOOD_HOOK}`,
		},
	];
	for (const check of POSITIVE) {
		const reported = reachabilityFailures(
			check.scripts,
			check.workflow,
			check.hook,
			DEFAULT_SUITES,
		);
		if (reported.length > 0) {
			problems.push(
				`${check.id} a working chain was reported as broken (${check.what}): ${reported.join('; ')}`,
			);
		}
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
