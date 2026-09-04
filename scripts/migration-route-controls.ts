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

/**
 * A DECLARATIVE INVOCATION CONTRACT.
 *
 * Two strategies failed here before this one, and both failed the same way.
 *
 * PARSING (rounds 2-7). Seven rounds decided from text whether a command runs.
 * Each round found another construct that reads like an invocation and executes
 * nothing, or the reverse: quoted separators, inline comments, heredocs in five
 * spellings, short-circuits, block bodies, subshell functions, `case` patterns
 * whose `)` closes no subshell, escapes inside double quotes. A hand-written
 * approximation of a shell grammar is never finished.
 *
 * OBSERVING (round 8). Running the script under recording stubs answered the
 * shell questions and opened new ones. Every stub exited 0, so
 * `node -e 'process.exit(1)' && <router>` credited a router the real shell
 * never reaches; the sandbox was a PATH, not a jail, so builtins and absolute
 * paths still touched the host; and the record file was writable by the script
 * under test, which could forge the evidence. An oracle that the subject can
 * lie to is not an oracle.
 *
 * So this guard stops trying to certify ARBITRARY shell and instead requires
 * the three call sites to be written in a CANONICAL form it can certify. A
 * canonical invocation is one whole line, at nesting depth zero, matching an
 * anchored pattern with no room for a separator, a substitution, a redirection
 * or a comment. Anything else — an `echo` prefix, a `&&` chain, a `case` branch,
 * a heredoc body, a clever equivalent — is NOT CERTIFIED, and not-certified is
 * REPORTED as a missing invocation.
 *
 * That is a real constraint on the repository: these three lines must stay
 * boring. It is also the only version of this guard that cannot be talked out
 * of its answer, because it never asks what the shell would do — it asks
 * whether the call site is written in the one shape whose meaning is not in
 * question. Widening the accepted shapes is a deliberate edit with a positive
 * self-check attached.
 */

/**
 * THE EXACT FORMS. Not a pattern with room in it — the whole string.
 *
 * `migration:all` is certified by matching its ENTIRE script text. A round-10
 * probe showed why a permissive tail is not enough: `--list` passed an anchored
 * pattern that allowed arbitrary router flags, and `--list` exits 0 after
 * PRINTING thirty suite names and running none of them. The tier and the
 * exclusions are read out of this match, so the guard and the router cannot
 * disagree about them either.
 */
const CANONICAL_ALL =
	/^tsx scripts\/migration-route\.ts --all --run --tier (push|ci|all)(?: --exclude ([\w:.,-]+))?$/;

/**
 * The hook's router line, whole. `--run` is the only argv the hook may pass:
 * it routes by changed surface, which is the entire point of running it there.
 */
const CANONICAL_HOOK =
	/^(?:printf '%s\\n' "\$PUSH_REFS" \| )?(?:corepack )?(?:pnpm exec )?tsx scripts\/migration-route\.ts --run(?: \|\| exit \d+)?$/;

/** A suite invocation inside a workflow step, whole. */
const canonicalSuite = (command: string): RegExp =>
	new RegExp(
		`^(?:corepack )?pnpm(?: -s| --silent)?(?: run)? ${command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
	);

/** Openers and closers, for the one question left: is this line inside a block? */
const BLOCK_OPEN = /^(?:if|while|until|for|case|select|coproc|function)\b|^\{$|^\(|^\w+\s*\(\)/;
const BLOCK_CLOSE = /^(?:fi|done|esac)\b|^\}$|^\)$/;

/**
 * Constructs that make a shell file uncertifiable, whatever else it contains.
 *
 * Each one lets a line LOOK top level while being something else, and each was
 * demonstrated against an earlier version of this guard: a heredoc body, a
 * process substitution, a quote left open across lines, and a line ending in an
 * operator so the next line is its conditional right-hand side. Rather than
 * model any of them, the file is refused — and a refused file is REPORTED as
 * having no invocation, which is the fail-closed direction.
 */
function uncertifiableShell(text: string): boolean {
	if (/<<|<\(|>\(/.test(text)) return true;
	const joined = text.replace(/\\\n\s*/g, ' ');
	for (const raw of joined.split('\n')) {
		const line = raw.replace(/(^|\s)#.*$/, '$1').trim();
		if (line === '') continue;
		// An odd number of either quote leaves the quote open across lines.
		if ((line.match(/'/g) ?? []).length % 2 !== 0) return true;
		if ((line.match(/"/g) ?? []).length % 2 !== 0) return true;
		// A trailing operator makes the NEXT line conditional or piped-into.
		if (/(?:&&|\|\||\||&)$/.test(line)) return true;
	}
	return false;
}

/** Lines with comments removed, continuations joined, whitespace collapsed. */
function shellLines(text: string): string[] {
	return text
		.replace(/\\\n\s*/g, ' ')
		.split('\n')
		.map((line) =>
			line
				.replace(/(^|\s)#.*$/, '$1')
				.replace(/\s+/g, ' ')
				.trim(),
		)
		.filter((line) => line !== '');
}

/**
 * Depth contributed by an unbalanced command substitution or backtick on this
 * line. `X=$(cat)` is balanced and contributes nothing.
 */
function spanDepth(line: string): number {
	const opens = (line.match(/\$\(/g) ?? []).length;
	const closes = (line.match(/\)/g) ?? []).length;
	const ticks = (line.match(/`/g) ?? []).length;
	return Math.max(0, opens - closes) + (ticks % 2);
}

/** Does a certifiable file contain the canonical hook invocation at top level? */
export function hookRunsRouter(text: string): boolean {
	if (uncertifiableShell(text)) return false;
	let depth = 0;
	for (const line of shellLines(text)) {
		if (BLOCK_CLOSE.test(line)) depth = Math.max(0, depth - 1);
		if (depth === 0 && CANONICAL_HOOK.test(line)) return true;
		if (BLOCK_OPEN.test(line)) depth += 1;
		depth += spanDepth(line);
	}
	return false;
}

/** True when a certifiable step payload runs `pnpm [run] <command>` at top level. */
export function invokesScript(text: string, command: string): boolean {
	if (uncertifiableShell(text)) return false;
	const pattern = canonicalSuite(command);
	let depth = 0;
	for (const line of shellLines(text)) {
		if (BLOCK_CLOSE.test(line)) depth = Math.max(0, depth - 1);
		if (depth === 0 && pattern.test(line)) return true;
		if (BLOCK_OPEN.test(line)) depth += 1;
		depth += spanDepth(line);
	}
	return false;
}

/**
 * A workflow this guard will read at all.
 *
 * It reads plain `key: value` YAML. A quoted key (`"if":`) or a space before
 * the colon (`if : false`) is the same mapping to a YAML parser and a different
 * one to this reader, so a workflow using either is refused rather than
 * half-understood.
 */
export function uncertifiableWorkflow(workflow: string): boolean {
	for (const raw of workflow.split('\n')) {
		const line = raw.replace(/(^|\s)#.*$/, '$1');
		if (line.trim() === '') continue;
		if (/^\s*(?:-\s+)?['"][\w.-]+['"]\s*:/.test(line)) return true;
		if (/^\s*(?:-\s+)?[\w.-]+\s+:/.test(line)) return true;
	}
	return false;
}

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

	// A workflow this reader cannot read plainly is refused whole: a quoted key
	// or a space before the colon is the same mapping to YAML and a different one
	// here, and half-understood is the state this guard exists to avoid.
	if (uncertifiableWorkflow(workflow)) {
		problems.push(
			'ci.yml uses a YAML spelling this guard does not read plainly (a quoted key, or a space before a colon) — no step can be certified',
		);
	}
	// Each step's payload is certified on its own: one step's text must not
	// decide whether a later step's command counts.
	const runPayloads = uncertifiableWorkflow(workflow) ? [] : activeRunCommands(workflow);
	const invokedInCI = (command: string): boolean =>
		runPayloads.some((payload) => invokesScript(payload, command));

	const allArgv = (scripts['migration:all'] ?? '').trim().replace(/\s+/g, ' ');
	// The WHOLE script text must be the permitted form. Reading flags out of a
	// pattern that allowed a free tail is how `--list` — which prints thirty
	// suite names and runs none — passed an earlier version of this check.
	const canonical = CANONICAL_ALL.exec(allArgv);
	if (canonical === null) {
		problems.push(
			`migration:all is not the certified invocation \`tsx scripts/migration-route.ts --all --run --tier <push|ci|all> [--exclude <names>]\`: ${allArgv || '(missing script)'}`,
		);
	}
	const allTier = (canonical?.[1] ?? 'push') as 'push' | 'ci' | 'all';
	// Read from the same match the router's own argv is certified by, so the two
	// cannot disagree about what is excluded.
	const allExcluded = new Set(
		(canonical?.[2] ?? '')
			.split(',')
			.map((n) => n.trim())
			.filter(Boolean),
	);
	const allCertified = canonical !== null;

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
	const hookRuns = hookRunsRouter(hook);
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
				allCertified &&
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
		expect: 'is not the certified invocation',
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
		expect: 'is not the certified invocation',
		what: 'migration:all loses --all, so it routes by changed surface instead of running everything',
		scripts: { 'migration:all': 'tsx scripts/migration-route.ts --run --tier all' },
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-06',
		expect: 'is not the certified invocation',
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
		expect: 'is not the certified invocation',
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
		expect: 'is not the certified invocation',
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
		expect: 'is not the certified invocation',
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
	// THE EXACT-FORM FAMILY. Each is a call site that a permissive pattern read
	// as an invocation. The contract names one string per call site; these are
	// the near-misses that used to slip past it.
	{
		id: 'RX-40',
		what: 'migration:all uses --list, which prints thirty suite names and runs none',
		expect: 'is not the certified invocation',
		scripts: { 'migration:all': 'tsx scripts/migration-route.ts --all --list --tier all' },
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-41',
		what: 'migration:all carries an extra flag the contract does not name',
		expect: 'is not the certified invocation',
		scripts: { 'migration:all': `${GOOD_ALL} --plan` },
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-42',
		what: 'the hook line before the invocation ends in `||`, making it a conditional right-hand side',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'true ||\ncorepack pnpm exec tsx scripts/migration-route.ts --run\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	{
		id: 'RX-43',
		what: 'the hook invocation sits inside a quote left open across lines',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'echo "opening\ncorepack pnpm exec tsx scripts/migration-route.ts --run\nclosing"\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	{
		id: 'RX-44',
		what: 'the hook invocation sits inside a process substitution',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'diff <(\ncorepack pnpm exec tsx scripts/migration-route.ts --run\n) /dev/null\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	{
		id: 'RX-45',
		what: 'the disabling `if` is a QUOTED key — the same mapping to YAML, a different one to a plain reader',
		expect: 'does not read plainly',
		scripts: { 'migration:all': GOOD_ALL },
		workflow: '      - run: pnpm run migration:all\n        "if": false\n',
	},
	{
		id: 'RX-46',
		what: 'the disabling key is spelled `if : false`, with a space before the colon',
		expect: 'does not read plainly',
		scripts: { 'migration:all': GOOD_ALL },
		workflow: '      - run: pnpm run migration:all\n        if : false\n',
	},
	// THE UNCERTIFIED FAMILY. Each of these may well run the router — two of them
	// demonstrably do. They are reported anyway, because the contract certifies a
	// canonical line at top level and nothing else. "It probably runs" is the
	// answer this guard exists to refuse.
	{
		id: 'RX-36',
		what: 'an echo and the invocation share a line, so no line is canonical',
		expect: 'is not the certified invocation',
		scripts: { 'migration:all': `echo routing; ${GOOD_ALL}` },
		workflow: GOOD_WORKFLOW,
	},
	{
		id: 'RX-37',
		what: 'the invocation runs inside a command substitution — it executes, and it is not a certified call site',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'OUT=$(\ntsx scripts/migration-route.ts --run\n)\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	{
		id: 'RX-38',
		what: 'the invocation sits in a conditional body whose condition happens to hold',
		expect: 'does not invoke scripts/migration-route.ts --run',
		scripts: {
			'migration:all':
				'tsx scripts/migration-route.ts --all --run --tier all --exclude migration:c3',
		},
		workflow: GOOD_WORKFLOW,
		hook: 'if true; then\ntsx scripts/migration-route.ts --run\nfi\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
	{
		id: 'RX-39',
		what: 'a `&&` chain behind a command that fails — the router is never reached',
		expect: 'is not the certified invocation',
		scripts: { 'migration:all': `node -e 'process.exit(1)' && ${GOOD_ALL} || true` },
		workflow: GOOD_WORKFLOW,
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
		expect: 'is not the certified invocation',
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
		expect: 'is not the certified invocation',
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
