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

import { execFileSync, spawnSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
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
 * Rounds five and six killed the same illusion twice: scanning text for
 * something that looks like a command is not deciding that a command RUNS.
 * Every form below cleared an earlier version of this recogniser while
 * executing no suite —
 *
 *   `node -e "" scripts/migration-route.ts …`   -e runs the string, not the file
 *   `node --v8-options scripts/…`               prints options and exits
 *   `node other.ts scripts/migration-route.ts`  the router is an argument
 *   `pnpm --help migration:controls`            looks it up, runs nothing
 *   `pnpm --filter __no_match__ migration:…`    matches no project, runs nothing
 *   `echo "skip; tsx scripts/…"`                quoted separator, one echo
 *   `echo "skip | pnpm run migration:all"`      quoted pipe, one echo
 *   `true || tsx scripts/… --run`               only runs if `true` fails
 *   `corepack pnpm run lint # tsx … --run`      a comment is not a command
 *   a heredoc body naming the router            data, not commands
 *
 * THE RULE. A command counts only when it is a TOP-LEVEL, UNCONDITIONAL
 * statement whose head, after transparent wrappers, is an accepted runner, and
 * whose every flag is on an allowlist. Concretely:
 *
 *   - quoting is modelled, so a quoted separator cannot manufacture a statement;
 *   - heredoc bodies are consumed as DATA, never parsed as commands;
 *   - `&&` and `||` make what follows conditional, and conditional statements do
 *     not count — `true || <router>` runs nothing when `true` succeeds;
 *   - statements inside `if` / `while` / `for` / `until` / `case` / `{ }` do not
 *     count, because whether they run depends on state this guard cannot see;
 *   - a pipeline counts: every member of `a | b` runs;
 *   - an UNKNOWN runner flag rejects the statement rather than being skipped,
 *     and only `-s` / `--silent` may precede `pnpm [run] <script>`.
 *
 * The accepted set is therefore finite and small: it is what this repository
 * actually writes in `package.json`, `ci.yml` and `.husky/pre-push`. Everything
 * else fails to match, and no match is REPORTED as a missing invocation — a
 * false alarm that reddens CI, never a silent clearance. Widening the set is a
 * deliberate edit with a positive self-check attached, which is the point.
 */

/** `scripts/migration-route.ts`, however the path is spelled. */
const ROUTER_PATH = /(?:^|\/)scripts\/migration-route\.ts$/;

/** Wrappers that pass their tail through unchanged: the command is what follows. */
const TRANSPARENT = new Set(['corepack', 'env', 'sudo', 'command']);
/** Runner heads that execute a script operand. */
const RUNNERS = new Set(['tsx', 'node']);
/**
 * The ONLY runner flags allowed before the operand. Everything else — `-e`,
 * `--help`, `--v8-options`, tomorrow's flag nobody here has read about —
 * rejects the statement, because a flag this guard does not know may change
 * what runs or run nothing at all.
 */
const RUNNER_BOOLEAN_FLAGS = new Set([
	'--no-warnings',
	'--enable-source-maps',
	'--experimental-strip-types',
	'--no-deprecation',
]);
/** Allowed runner flags that consume the NEXT token, which is not the operand. */
const RUNNER_VALUE_FLAGS = new Set([
	'--tsconfig',
	'--require',
	'-r',
	'--import',
	'--loader',
	'--conditions',
	'--env-file',
]);
/** The only flags allowed before `pnpm [run] <script>`. `--filter` is NOT one. */
const PNPM_BOOLEAN_FLAGS = new Set(['-s', '--silent']);

/**
 * STOP PARSING THE SHELL. RUN IT AND WATCH.
 *
 * Seven rounds of this guard tried to decide from TEXT whether a command runs,
 * and seven rounds found another construct that reads like an invocation and
 * executes nothing, or the reverse. Quoted separators, inline comments,
 * heredocs in four spellings, `&&` / `||` short-circuits, `if` and `select`
 * bodies, subshell-bodied functions, command substitutions, `case` patterns
 * whose `)` closes no subshell, backslash escapes inside double quotes. Each
 * fix was correct and each left the next construct unowned, because a
 * hand-written approximation of a shell grammar is never finished.
 *
 * So the shell decides. `observe()` runs the script under `bash` with `PATH`
 * pointing at a directory of RECORDING STUBS and nothing else, feeds it the
 * stdin it expects, and collects the argv of every command that actually ran.
 * A heredoc body is never executed, so it records nothing. `true || router`
 * short-circuits for real. A `case` branch that does not match does not run. An
 * `if` whose condition is false skips its body. None of that is modelled here;
 * it is observed, by the program whose semantics are the question.
 *
 * PATH contains ONLY the stubs, so a command this harness has not stubbed
 * cannot execute at all: a line that tried to touch the machine finds an empty
 * world.
 *
 * What remains for static analysis is exactly the part the shell cannot answer.
 * Given the argv that DID run, does that argv execute the router? `node -e ""
 * scripts/migration-route.ts` really does run, and really does not run the
 * file; `pnpm --filter __no_match__ x` really does run, and really runs no
 * script. That is an argv question, not a shell question, and it is decided
 * below by allowlists over the OBSERVED argv.
 */

/** Written by each stub after its argv, so multi-word arguments survive. */
const RECORD_END = '<<<route-record-end>>>';

/**
 * Commands the sandbox provides. `cat` is a real passthrough because scripts
 * read stdin through it; every other stub records its argv and exits 0.
 * Unlisted commands do not exist inside the sandbox.
 */
const STUBBED = [
	'pnpm',
	'corepack',
	'npx',
	'node',
	'tsx',
	'deno',
	'git',
	'printf',
	'echo',
	'sed',
	'awk',
	'grep',
	'find',
	'rm',
	'mkdir',
	'cp',
	'mv',
	'touch',
	'sleep',
	'true',
	'false',
	'env',
	'sh',
	'bash',
	'curl',
	'wget',
	'jq',
	'make',
	'ls',
	'date',
	'lsof',
	'kill',
];

let sandbox: string | null = null;
function sandboxBin(): string {
	if (sandbox !== null) return sandbox;
	const dir = mkdtempSync(join(tmpdir(), 'route-observe-'));
	const bin = join(dir, 'bin');
	mkdirSync(bin);
	for (const name of STUBBED) {
		const file = join(bin, name);
		writeFileSync(
			file,
			`#!/bin/sh\nprintf '%s\\n' "$0" "$@" >> "$ROUTE_RECORD"\nprintf '%s\\n' '${RECORD_END}' >> "$ROUTE_RECORD"\nexit 0\n`,
		);
		chmodSync(file, 0o755);
	}
	writeFileSync(join(bin, 'cat'), '#!/bin/sh\nexec /bin/cat "$@"\n');
	chmodSync(join(bin, 'cat'), 0o755);
	sandbox = bin;
	return bin;
}

/**
 * Every command the script ACTUALLY executes, as argv arrays.
 *
 * Returns an empty list when the script runs nothing, which is the honest
 * answer for a heredoc body, a skipped branch, or a short-circuit that never
 * fires.
 */
export function observe(script: string, stdin = ''): string[][] {
	const bin = sandboxBin();
	const record = join(bin, `record-${Math.random().toString(36).slice(2)}.log`);
	writeFileSync(record, '');
	try {
		spawnSync('/bin/bash', ['-c', script], {
			env: { PATH: bin, ROUTE_RECORD: record, HOME: bin },
			input: stdin,
			timeout: 15_000,
			encoding: 'utf8',
		});
		const argvs: string[][] = [];
		let current: string[] = [];
		for (const line of readFileSync(record, 'utf8').split('\n')) {
			if (line === RECORD_END) {
				if (current.length > 0) argvs.push(current);
				current = [];
				continue;
			}
			current.push(line);
		}
		return argvs;
	} finally {
		rmSync(record, { force: true });
	}
}

/** Drop the wrappers that pass their tail through unchanged. */
function unwrap(argv: string[]): string[] {
	const rest = argv.slice();
	// argv[0] arrives as the stub's absolute path.
	rest[0] = basename(rest[0]);
	for (;;) {
		if (rest.length > 1 && TRANSPARENT.has(rest[0]) && !rest[1].startsWith('-')) {
			rest.shift();
			continue;
		}
		if (rest.length > 2 && rest[0] === 'pnpm' && (rest[1] === 'exec' || rest[1] === 'dlx')) {
			rest.splice(0, 2);
			continue;
		}
		break;
	}
	return rest;
}

/**
 * The router's OWN arguments, for an observed argv that executes
 * `scripts/migration-route.ts`, or null when nothing observed does.
 *
 * The shell has already answered "did this run"; this answers "does running it
 * run the router". The operand is found positionally and every flag before it
 * must be on the allowlist, so `node -e ""` and `node --v8-options` reject
 * (they run something other than the file) and `node other.ts <router>` rejects
 * (the router is an argument to another program).
 */
export function routerSegment(script: string, stdin = ''): string[] | null {
	for (const observed of observe(script, stdin)) {
		const tokens = unwrap(observed);
		let i = 0;
		if (tokens[i] === 'deno') {
			if (tokens[i + 1] !== 'run') continue;
			i += 2;
		} else if (RUNNERS.has(tokens[i])) {
			i += 1;
		} else {
			continue;
		}
		let rejected = false;
		while (i < tokens.length && tokens[i].startsWith('-')) {
			const flag = tokens[i].split('=')[0];
			const denoPermission = tokens[0] === 'deno' && /^--allow-|^--deny-|^--no-/.test(flag);
			if (RUNNER_BOOLEAN_FLAGS.has(flag) || denoPermission) i += 1;
			else if (RUNNER_VALUE_FLAGS.has(flag)) i += tokens[i].includes('=') ? 1 : 2;
			else {
				rejected = true;
				break;
			}
		}
		if (rejected || i >= tokens.length) continue;
		if (!ROUTER_PATH.test(tokens[i])) continue;
		return tokens.slice(i + 1);
	}
	return null;
}

/**
 * True when running `script` actually executes `pnpm [run] <command>`.
 *
 * Only `-s` / `--silent` may precede it: `--help` runs nothing, and `--filter`
 * chooses which workspace projects run, so `pnpm --filter __no_match__ <script>`
 * exits 0 having run nothing at all.
 */
export function invokesScript(script: string, command: string): boolean {
	for (const observed of observe(script)) {
		const tokens = unwrap(observed);
		if (tokens[0] !== 'pnpm') continue;
		let i = 1;
		let rejected = false;
		while (i < tokens.length && tokens[i].startsWith('-')) {
			if (!PNPM_BOOLEAN_FLAGS.has(tokens[i])) {
				rejected = true;
				break;
			}
			i += 1;
		}
		if (rejected) continue;
		if (tokens[i] === 'run') i += 1;
		if (tokens[i] === command) return true;
	}
	return false;
}

/**
 * The commands a CI run actually executes: the payloads of active `run:` keys,
 * with comments removed and CONDITIONAL steps and jobs excluded.
 *
 * Scanning the raw workflow text was wrong three times over. A line such as
 * `- # run: pnpm run migration:all` does not start with `#`, so a leading-`#`
 * filter keeps it; prose in a `name:` or a `with:` value matched the same way a
 * real command did; and a payload extracted without its YAML context ignored
 * `if:` — a step or job carrying `if: false` runs nothing, while its `run:`
 * still read as execution.
 *
 * An `if:` ANYWHERE in an enclosing scope disqualifies the step, whatever the
 * expression says. Evaluating GitHub's expression language is not this guard's
 * job, and "it might not run" is exactly the answer that must fail closed.
 */
export function activeRunCommands(workflow: string): string[] {
	const lines = workflow
		.split('\n')
		// A `#` opens a comment at line start or after whitespace. Stripping is the
		// fail-closed direction: over-stripping hides an invocation and this guard
		// then reports it, which is the safe error.
		.map((line) => line.replace(/(^|\s)#.*$/, '$1').trimEnd());

	const indentOf = (line: string): number => line.length - line.trimStart().length;
	const keyOf = (line: string): { indent: number; key: string; rest: string } | null => {
		const match = /^(\s*)(-\s+)?([A-Za-z_][\w.-]*):(.*)$/.exec(line);
		if (!match) return null;
		return {
			indent: match[1].length + (match[2] ? match[2].length : 0),
			key: match[3],
			rest: match[4],
		};
	};

	/**
	 * The line range of the mapping a key belongs to: from the `- ` bullet or
	 * first sibling that opens it, to the last line still inside it.
	 *
	 * YAML mappings are UNORDERED, so a one-pass scanner that credits `run:`
	 * before reaching a later sibling `if:` credits a step that never runs. Each
	 * enclosing mapping is therefore read WHOLE before the decision.
	 */
	const blockOf = (at: number, indent: number): [number, number] => {
		let start = at;
		for (let i = at - 1; i >= 0; i -= 1) {
			if (lines[i].trim() === '') continue;
			const ind = indentOf(lines[i]);
			const bullet = /^\s*-\s+/.test(lines[i]);
			if (bullet && ind + 2 === indent) {
				start = i;
				break;
			}
			if (ind < indent) break;
			if (ind === indent) start = i;
		}
		let end = at;
		for (let i = at + 1; i < lines.length; i += 1) {
			if (lines[i].trim() === '') continue;
			const ind = indentOf(lines[i]);
			if (ind < indent) break;
			if (/^\s*-\s+/.test(lines[i]) && ind + 2 === indent) break;
			end = i;
		}
		return [start, end];
	};

	/** Does this scope, or any scope enclosing it, declare an `if:` — in either key order? */
	const guarded = (at: number, indent: number): boolean => {
		let scopeIndent = indent;
		let cursor = at;
		for (;;) {
			const [start, end] = blockOf(cursor, scopeIndent);
			for (let i = start; i <= end; i += 1) {
				const key = keyOf(lines[i]);
				if (key && key.key === 'if' && key.indent === scopeIndent) return true;
			}
			// Climb: the first line above this mapping that is less indented opens
			// the enclosing one. A job-level `if:` kills every step inside it.
			let outer = -1;
			for (let i = start - 1; i >= 0; i -= 1) {
				if (lines[i].trim() === '') continue;
				if (indentOf(lines[i]) < indentOf(lines[start])) {
					outer = i;
					break;
				}
			}
			if (outer === -1) return false;
			const key = keyOf(lines[outer]);
			if (!key) return false;
			cursor = outer;
			scopeIndent = key.indent;
		}
	};

	const commands: string[] = [];
	for (let i = 0; i < lines.length; i += 1) {
		const key = keyOf(lines[i]);
		if (!key || key.key !== 'run') continue;
		if (guarded(i, key.indent)) continue;
		const inline = key.rest.trim();
		if (inline !== '' && !/^[|>][-+\d]*$/.test(inline)) {
			commands.push(inline);
			continue;
		}
		// Block scalar: every following line indented past the key belongs to it.
		const raw = indentOf(lines[i]);
		const body: string[] = [];
		for (let j = i + 1; j < lines.length; j += 1) {
			if (lines[j].trim() === '') continue;
			if (indentOf(lines[j]) <= raw) break;
			body.push(lines[j].trim());
		}
		if (body.length > 0) commands.push(body.join('\n'));
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

	// Each step's payload is observed on its own: one step's `exit` must not
	// decide whether a later step's command counts.
	const runPayloads = activeRunCommands(workflow);
	const invokedInCI = (command: string): boolean =>
		runPayloads.some((payload) => invokesScript(payload, command));

	const allArgv = scripts['migration:all'] ?? '';
	// EVERY flag below is read off the OBSERVED router argv, never off the script
	// text. `echo tsx scripts/migration-route.ts --all --run --tier all` carries
	// every flag this guard looks for and executes nothing, so nothing is
	// observed and those flags are never consulted.
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
	// RUNS the router with --run. It is run whole, with the stdin git gives it,
	// so its own conditionals decide for themselves.
	const PUSH_REFS =
		'refs/heads/main 1111111111111111111111111111111111111111 ' +
		'refs/heads/main 2222222222222222222222222222222222222222\n';
	const hookArgv = routerSegment(hook, PUSH_REFS);
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
	// THE UNRUN-CONTEXT FAMILY. Each command is well-formed and never executes,
	// because of the context it sits in rather than anything about the command.
	{
		id: 'RX-23',
		what: 'the router appears in a spaced heredoc body — `cat << EOF`',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'cat << EOF > /tmp/note\ntsx scripts/migration-route.ts --run\nEOF\ncorepack pnpm run lint\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	{
		id: 'RX-24',
		what: "the router appears in a delimiter-attached, quoted heredoc body — `cat <<-'EOF'`",
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: "cat<<-'EOF' > /tmp/note\n\ttsx scripts/migration-route.ts --run\n\tEOF\n",
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	{
		id: 'RX-25',
		what: 'the CI step carrying the invocation is disabled by a step-level `if:`',
		expect: 'never invoked by an active ci.yml step',
		scripts: { 'migration:all': GOOD_ALL },
		workflow:
			'      - name: Full migration suite\n        if: false\n        run: pnpm run migration:all\n',
	},
	{
		id: 'RX-26',
		what: 'the whole job carrying the invocation is disabled by a job-level `if:`',
		expect: 'never invoked by an active ci.yml step',
		scripts: { 'migration:all': GOOD_ALL },
		workflow:
			'jobs:\n  migration:\n    if: false\n    steps:\n      - run: pnpm run migration:all\n',
	},
	{
		id: 'RX-27',
		what: 'the router sits in a loop body that never executes',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'while false; do\n\ttsx scripts/migration-route.ts --run\ndone\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	{
		id: 'RX-28',
		what: 'the router sits in a subshell-bodied function that is defined and never called',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'route() (\n\ttsx scripts/migration-route.ts --run\n)\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	// THE OBSERVED-CONTEXT FAMILY. Each is a command the shell parses fine and
	// never executes. None of these is decided by reading text: the script runs
	// under the sandbox and nothing is recorded.
	{
		id: 'RX-30',
		what: 'the router sits in the SECOND of two heredoc bodies',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'cat <<A > /tmp/a\nfirst\nA\ncat <<B > /tmp/b\ntsx scripts/migration-route.ts --run\nB\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	{
		id: 'RX-31',
		what: 'a plain `<<EOF` body whose terminator is indented, so the body never ends where a naive scan thinks',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'cat <<EOF > /tmp/a\ntsx scripts/migration-route.ts --run\n  EOF\ncorepack pnpm run lint\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	{
		id: 'RX-32',
		what: 'the step `if:` comes AFTER its `run:` — YAML mappings are unordered',
		expect: 'never invoked by an active ci.yml step',
		scripts: { 'migration:all': GOOD_ALL },
		workflow: '      - run: pnpm run migration:all\n        if: false\n',
	},
	{
		id: 'RX-33',
		what: 'the job `if:` comes after the steps it disables',
		expect: 'never invoked by an active ci.yml step',
		scripts: { 'migration:all': GOOD_ALL },
		workflow:
			'jobs:\n  migration:\n    steps:\n      - run: pnpm run migration:all\n    if: false\n',
	},
	{
		id: 'RX-34',
		what: 'the router sits in a `case` branch whose pattern does not match',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'case zzz in\n  aaa) tsx scripts/migration-route.ts --run ;;\nesac\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	{
		id: 'RX-35',
		what: 'an escaped quote inside an echo argument, with a router-looking tail',
		expect: 'not run scripts/migration-route.ts in command position',
		scripts: {
			'migration:all': 'echo "he said \\" ; tsx scripts/migration-route.ts --all --run --tier all"',
		},
		workflow: GOOD_WORKFLOW,
	},
	// THE NO-OP FAMILY. Each is a command that runs and executes no suite: a
	// terminal runner flag, a filter that matches no project, a short-circuit
	// that never fires, a heredoc body, and a conditional block.
	{
		id: 'RX-18',
		what: 'a terminal runner flag prints and exits, the operand never runs',
		expect: 'not run scripts/migration-route.ts in command position',
		scripts: {
			'migration:all': 'node --v8-options scripts/migration-route.ts --all --run --tier all',
		},
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-19',
		what: 'pnpm --filter selects no project, so the named suite runs nowhere',
		expect: 'executed by nothing',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:controls',
		},
		workflow:
			'      - run: pnpm run migration:all\n      - run: pnpm --filter __no_match__ migration:controls\n',
	},
	{
		id: 'RX-20',
		what: 'the hook router call is short-circuited behind `true ||`, so it never fires',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'true || tsx scripts/migration-route.ts --run\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	{
		id: 'RX-21',
		what: 'the router appears only inside a heredoc body — data being written, not a command',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'cat <<EOF > /tmp/note\ntsx scripts/migration-route.ts --run\nEOF\ncorepack pnpm run lint\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	{
		id: 'RX-22',
		what: 'the router call sits inside an if-block, so whether it runs depends on state this guard cannot see',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'if [ -n "$SKIP" ]; then\n\ttsx scripts/migration-route.ts --run\nfi\n',
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
			id: 'RX-00l',
			what: 'a conditional whose condition holds — the body really does run',
			scripts: { 'migration:all': GOOD_ALL },
			workflow: GOOD_WORKFLOW,
			hook: 'if true; then\n\ttsx scripts/migration-route.ts --run\nfi\n',
		},
		{
			id: 'RX-00k',
			what: 'the hook runs the router inside a command substitution — which really does run it',
			scripts: { 'migration:all': GOOD_ALL },
			workflow: GOOD_WORKFLOW,
			hook: 'OUT=$(tsx scripts/migration-route.ts --run)\n',
		},
		{
			id: 'RX-00j',
			what: 'a SIBLING step carries the `if:` and ours does not',
			scripts: { 'migration:all': GOOD_ALL },
			workflow:
				"      - name: other\n        if: github.event_name == 'push'\n        run: pnpm run build\n      - name: full\n        run: pnpm run migration:all\n",
			hook: GOOD_HOOK,
		},
		{
			id: 'RX-00i',
			what: 'the real hook shape: an assignment, an if-block, then the router at top level',
			scripts: { 'migration:all': GOOD_ALL },
			workflow: GOOD_WORKFLOW,
			hook:
				'PUSH_REFS=$(cat)\nif command -v deno >/dev/null 2>&1; then\n\tdeno install --frozen || exit 1\nelse\n\techo skip\nfi\n' +
				GOOD_HOOK,
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
