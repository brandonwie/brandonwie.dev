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
import { createHash } from 'node:crypto';
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
 * FINGERPRINTS, NOT INFERENCE.
 *
 * Eleven review rounds tried to decide, from the TEXT of a shell script and a
 * YAML workflow, whether the router is actually invoked. Three strategies were
 * tried and all three leaked:
 *
 *   PARSING (rounds 2-7)  never finished. Quoted separators, inline comments,
 *                         heredocs in five spellings, short-circuits, block
 *                         bodies, `case` patterns, escapes inside quotes.
 *   EXECUTING (round 8)   answered the shell questions and opened new ones. All
 *                         stubs exited 0, the sandbox was a PATH rather than a
 *                         jail, and the script under test could write the record
 *                         it was judged by.
 *   CERTIFYING A LINE     still left the CONTAINER able to change the line's
 *   (rounds 9-10)         meaning: a Bash array assignment, an escaped quote
 *                         spanning lines, a folded `>` YAML scalar.
 *
 * Every one of those was a model of another language's semantics, and every
 * model had an edge its author had not met yet. So the guard stops modelling.
 * The three call sites are FINGERPRINTED in
 * `verification/certified-call-sites.json`, and this check compares bytes:
 * `migration:all` against a recorded exact string, `.husky/pre-push` and
 * `.github/workflows/ci.yml` against recorded SHA-256 digests.
 *
 * A call site that changes fails this guard until a human re-records it. That
 * friction is the point — re-recording is the human decision that the changed
 * call site still runs what it claims — and it is the only version of this
 * check whose correctness does not depend on out-parsing a shell.
 *
 * What stays computed rather than recorded: the tier and the exclusions are
 * read out of the certified string, and every excluded name must be a
 * registered suite, exactly as `excluded()` in the router requires. The guard
 * and the router cannot disagree about a suite that does not exist.
 */

/** The certified form, as a token sequence. Nothing else is accepted. */
const CERTIFIED_PREFIX = ['tsx', 'scripts/migration-route.ts', '--all', '--run', '--tier'];
const TIERS = new Set(['push', 'ci', 'all']);

export interface CallSiteManifest {
	scripts: Record<string, string>;
	/** Suites a ci.yml step names directly, certified by the workflow fingerprint. */
	named_in_ci: string[];
	files: Record<string, { sha256: string; certifies?: string }>;
}

export function readManifest(): CallSiteManifest {
	return JSON.parse(
		readFileSync(join(REPO_ROOT, 'verification/certified-call-sites.json'), 'utf8'),
	) as CallSiteManifest;
}

export const digest = (text: string): string =>
	createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * The tier and exclusions of a certified `migration:all`, or a diagnostic.
 *
 * The string is split on single spaces with NO normalisation: a newline, a tab
 * or a doubled space is a different string and is refused, because in a shell a
 * newline between `--tier` and its value is two commands.
 */
export function certifiedAll(
	argv: string,
	suites: readonly { command: string }[],
): { tier: 'push' | 'ci' | 'all'; excluded: Set<string> } | string {
	if (/[^A-Za-z0-9 :,./_-]/.test(argv)) {
		return `migration:all contains a character the certified form does not allow (a newline, quote or shell operator): ${JSON.stringify(argv)}`;
	}
	const tokens = argv.split(' ');
	for (let i = 0; i < CERTIFIED_PREFIX.length; i += 1) {
		if (tokens[i] !== CERTIFIED_PREFIX[i]) {
			return `migration:all is not the certified invocation \`${CERTIFIED_PREFIX.join(' ')} <push|ci|all> [--exclude <names>]\`: ${argv || '(missing script)'}`;
		}
	}
	const tier = tokens[CERTIFIED_PREFIX.length];
	if (!TIERS.has(tier)) return `migration:all names an unknown --tier: ${tier ?? '(none)'}`;
	const rest = tokens.slice(CERTIFIED_PREFIX.length + 1);
	if (rest.length === 0) return { tier: tier as 'push' | 'ci' | 'all', excluded: new Set() };
	if (rest.length !== 2 || rest[0] !== '--exclude') {
		return `migration:all carries arguments the certified form does not allow: ${rest.join(' ')}`;
	}
	const names = rest[1].split(',').filter(Boolean);
	const known = new Set(suites.map((suite) => suite.command));
	const unknown = names.filter((name) => !known.has(name));
	if (unknown.length > 0) {
		// The router itself exits 1 on this. A guard that accepted it would be
		// certifying a command that cannot run.
		return `migration:all excludes ${unknown.length} name(s) that are not registered suites, which the router rejects at startup: ${unknown.join(', ')}`;
	}
	return { tier: tier as 'push' | 'ci' | 'all', excluded: new Set(names) };
}

/** Does this text match the digest recorded for that call site? */
export function fingerprintFailure(
	path: string,
	text: string,
	manifest: CallSiteManifest,
): string | null {
	const recorded = manifest.files[path];
	if (recorded === undefined) return `${path} has no recorded fingerprint`;
	const actual = digest(text);
	if (actual === recorded.sha256) return null;
	return (
		`${path} does not match its recorded fingerprint — recorded ${recorded.sha256.slice(0, 12)}, ` +
		`found ${actual.slice(0, 12)}. It certifies: ${recorded.certifies ?? '(no note)'}. ` +
		`If the change is intended, re-record with \`pnpm migration:route:controls --record\` in the same commit.`
	);
}

export function reachabilityFailures(
	scripts: Record<string, string>,
	workflow: string,
	hook: string,
	suites: readonly { command: string; tier: 'push' | 'ci' }[] = SUITES,
	manifest: CallSiteManifest = readManifest(),
): string[] {
	const problems: string[] = [];

	// 1. The workflow, byte for byte. Its recorded fingerprint certifies that an
	//    unconditional step runs `pnpm run migration:all` and that
	//    `migration-controls` has its own job.
	const workflowFailure = fingerprintFailure('.github/workflows/ci.yml', workflow, manifest);
	if (workflowFailure !== null) problems.push(workflowFailure);
	const allInvoked = workflowFailure === null;

	// 2. The hook, byte for byte. Its fingerprint certifies that step 7 runs the
	//    router unconditionally at top level — the only runner push-tier suites
	//    have once CI excludes them.
	const hookFailure = fingerprintFailure('.husky/pre-push', hook, manifest);
	if (hookFailure !== null) problems.push(hookFailure);
	const hookRuns = hookFailure === null;

	// 3. `migration:all` against the recorded string, and the recorded string
	//    against the certified form. Two comparisons, because a fingerprint that
	//    recorded a broken invocation would certify the breakage.
	const allArgv = scripts['migration:all'] ?? '';
	const recordedAll = manifest.scripts['migration:all'] ?? '';
	if (allArgv !== recordedAll) {
		problems.push(
			`migration:all does not match its recorded string — recorded ${JSON.stringify(recordedAll)}, found ${JSON.stringify(allArgv)}`,
		);
	}
	// Exclusion names are checked against the REAL registry, never the fixture
	// list a control passes in: the question is whether the router would accept
	// them, and the router reads SUITES.
	const certified = certifiedAll(recordedAll, SUITES);
	if (typeof certified === 'string') problems.push(certified);
	const allCertified = typeof certified !== 'string' && allArgv === recordedAll;
	const allTier = typeof certified === 'string' ? 'push' : certified.tier;
	const allExcluded = typeof certified === 'string' ? new Set<string>() : certified.excluded;

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
			// A suite named by its own ci.yml step: certified by the workflow
			// fingerprint, not by reading a `run:` payload out of its mapping.
			const viaNamedStep = allInvoked && (manifest.named_in_ci ?? []).includes(suite.command);
			return !viaAll && !viaNamedStep && !viaHook;
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
 * Committed negative controls for `reachabilityFailures`.
 *
 * The forty-six shell and YAML fixtures that lived here are GONE, with the
 * parser they tested. They pinned the behaviour of a guard that read shell
 * constructs; this one reads bytes, so a fixture describing a heredoc or a
 * folded scalar no longer describes anything the code does. What replaces them
 * is smaller and total: every way a fingerprint check can be wrong.
 *
 * Each control supplies a broken manifest-or-call-site pair and asserts the
 * guard reports it with the diagnostic that names the actual break.
 */
const RECORDED = readManifest();
const REAL_HOOK = readFileSync(join(REPO_ROOT, '.husky/pre-push'), 'utf8');
const REAL_WORKFLOW = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
const GOOD_ALL = RECORDED.scripts['migration:all'];
const DEFAULT_SUITES = [
	{ command: 'migration:all', tier: 'push' as const },
	{ command: 'migration:controls', tier: 'ci' as const },
];

/**
 * A byte difference that cannot be a no-op.
 *
 * FP-02 used to edit the hook with
 * `REAL_HOOK.replace('7/7 Migration verification', ...)`. Rename that display
 * label and the replacement matches nothing, so the "changed" hook is
 * byte-identical to the recorded one and the control fails for a reason that
 * has nothing to do with the guard — a legitimate re-record would have been
 * reported as a broken control. A mutation used as a fixture must not depend on
 * the wording of the file it mutates, so this one appends.
 */
function mutated(text: string): string {
	return `${text}\n# an edit nobody certified\n`;
}

/** A manifest with one field replaced, for a control to break deliberately. */
function withManifest(patch: Partial<CallSiteManifest>): CallSiteManifest {
	return {
		...RECORDED,
		...patch,
		// Replaced wholesale, not merged: a control that REMOVES an entry has to
		// see it gone, and a merge would quietly put it back.
		files: patch.files ?? RECORDED.files,
	};
}

const SELF_CHECKS: {
	id: string;
	what: string;
	/** A distinctive fragment of the diagnostic this break must produce. */
	expect: string;
	scripts: Record<string, string>;
	workflow: string;
	hook: string;
	manifest?: CallSiteManifest;
	suites?: { command: string; tier: 'push' | 'ci' }[];
}[] = [
	{
		id: 'FP-01',
		what: 'the workflow changed and nobody re-recorded it',
		expect: 'ci.yml does not match its recorded fingerprint',
		scripts: { 'migration:all': GOOD_ALL },
		workflow: mutated(REAL_WORKFLOW),
		hook: REAL_HOOK,
	},
	{
		id: 'FP-02',
		what: 'the hook changed and nobody re-recorded it',
		expect: 'pre-push does not match its recorded fingerprint',
		scripts: { 'migration:all': GOOD_ALL },
		workflow: REAL_WORKFLOW,
		hook: mutated(REAL_HOOK),
	},
	{
		id: 'FP-03',
		what: 'package.json drifted from the recorded string',
		expect: 'does not match its recorded string',
		scripts: { 'migration:all': `${GOOD_ALL} --plan` },
		workflow: REAL_WORKFLOW,
		hook: REAL_HOOK,
	},
	{
		id: 'FP-04',
		what: 'the RECORDED string is --list, which prints suite names and runs none',
		expect: 'is not the certified invocation',
		scripts: { 'migration:all': 'tsx scripts/migration-route.ts --all --list --tier all' },
		workflow: REAL_WORKFLOW,
		hook: REAL_HOOK,
		manifest: withManifest({
			scripts: { 'migration:all': 'tsx scripts/migration-route.ts --all --list --tier all' },
		}),
	},
	{
		id: 'FP-05',
		what: 'the recorded string excludes a name that is not a registered suite — the router exits 1 on it',
		expect: 'not registered suites',
		scripts: { 'migration:all': `${GOOD_ALL},not-a-suite` },
		workflow: REAL_WORKFLOW,
		hook: REAL_HOOK,
		manifest: withManifest({ scripts: { 'migration:all': `${GOOD_ALL},not-a-suite` } }),
	},
	{
		id: 'FP-06',
		what: 'the recorded string carries a newline, which in a shell is two commands',
		expect: 'a character the certified form does not allow',
		scripts: { 'migration:all': 'tsx scripts/migration-route.ts --all --run --tier\nall' },
		workflow: REAL_WORKFLOW,
		hook: REAL_HOOK,
		manifest: withManifest({
			scripts: { 'migration:all': 'tsx scripts/migration-route.ts --all --run --tier\nall' },
		}),
	},
	{
		id: 'FP-07',
		what: 'the recorded string names a tier that does not exist',
		expect: 'unknown --tier',
		scripts: { 'migration:all': 'tsx scripts/migration-route.ts --all --run --tier everything' },
		workflow: REAL_WORKFLOW,
		hook: REAL_HOOK,
		manifest: withManifest({
			scripts: { 'migration:all': 'tsx scripts/migration-route.ts --all --run --tier everything' },
		}),
	},
	{
		id: 'FP-08',
		what: 'a call site has no recorded fingerprint at all',
		expect: 'has no recorded fingerprint',
		scripts: { 'migration:all': GOOD_ALL },
		workflow: REAL_WORKFLOW,
		hook: REAL_HOOK,
		manifest: withManifest({
			files: Object.fromEntries(
				Object.entries(RECORDED.files).filter(([path]) => path !== '.husky/pre-push'),
			),
		}),
	},
	{
		id: 'FP-09',
		what: 'a ci-tier suite excluded from migration:all and named by no step is reachable by nothing',
		expect: 'executed by nothing',
		scripts: { 'migration:all': `${GOOD_ALL},migration:route:controls` },
		workflow: REAL_WORKFLOW,
		hook: REAL_HOOK,
		manifest: withManifest({
			scripts: { 'migration:all': `${GOOD_ALL},migration:route:controls` },
		}),
		suites: [{ command: 'migration:route:controls', tier: 'ci' }],
	},
	{
		id: 'FP-10',
		what: 'the hook stops being certified, stranding the push-tier suites CI excludes',
		expect: 'executed by nothing',
		scripts: { 'migration:all': GOOD_ALL },
		workflow: REAL_WORKFLOW,
		hook: 'echo "no routing here"\n',
		suites: [{ command: 'migration:c3', tier: 'push' }],
	},
];

function selfCheckFailures(): string[] {
	const problems: string[] = [];
	for (const check of SELF_CHECKS) {
		const reported = reachabilityFailures(
			check.scripts,
			check.workflow,
			check.hook,
			check.suites ?? DEFAULT_SUITES,
			check.manifest ?? RECORDED,
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
	// A control set that only ever feeds BROKEN state cannot tell "the guard
	// reports everything" from "the guard works". The recorded trio must pass.
	const intact = reachabilityFailures(
		{ 'migration:all': GOOD_ALL },
		REAL_WORKFLOW,
		REAL_HOOK,
		DEFAULT_SUITES,
		RECORDED,
	);
	if (intact.length > 0) {
		problems.push(`FP-00 the recorded call sites were reported as broken: ${intact.join('; ')}`);
	}
	// FP-00b: the fixtures that claim to change a file must actually change it.
	// This is the check that would have caught FP-02's text-dependent edit.
	if (mutated(REAL_HOOK) === REAL_HOOK || mutated(REAL_WORKFLOW) === REAL_WORKFLOW) {
		problems.push('FP-00b the mutation helper produced no byte difference');
	}
	// FP-11: A LEGITIMATE CHANGE, RE-RECORDED, PASSES.
	//
	// Refusing everything is not correctness. The whole design rests on a human
	// being able to edit a call site, run `--record`, and get a green guard; if
	// that path did not work the guard would be unusable and the pressure would
	// be to delete it. The edited hook here is the SAME text FP-02 rejects, and
	// the manifest comes from record()'s own algorithm.
	const editedHook = mutated(REAL_HOOK);
	const rerecorded = recordedManifest(RECORDED, GOOD_ALL, {
		'.husky/pre-push': editedHook,
		'.github/workflows/ci.yml': REAL_WORKFLOW,
	});
	const afterRecord = reachabilityFailures(
		{ 'migration:all': GOOD_ALL },
		REAL_WORKFLOW,
		editedHook,
		DEFAULT_SUITES,
		rerecorded,
	);
	if (afterRecord.length > 0) {
		problems.push(
			`FP-11 a re-recorded call-site change was still reported as broken: ${afterRecord.join('; ')}`,
		);
	}
	return problems;
}

/**
 * The manifest that recording the given call sites produces.
 *
 * Separated from `record()` so FP-11 can run THIS algorithm over an edited
 * hook held in memory rather than re-implementing it. A control that
 * re-implements the thing it certifies proves only that two copies agree.
 */
export function recordedManifest(
	base: CallSiteManifest,
	allScript: string,
	fileTexts: Record<string, string>,
): CallSiteManifest {
	return {
		...(base as CallSiteManifest & Record<string, unknown>),
		scripts: { 'migration:all': allScript },
		files: Object.fromEntries(
			Object.entries(base.files).map(([path, entry]) => [
				path,
				{ ...entry, sha256: digest(fileTexts[path]) },
			]),
		),
	};
}

/** `--record` mode: rewrite the manifest from the working tree. */
function record(): void {
	const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
		scripts: Record<string, string>;
	};
	const next = recordedManifest(
		RECORDED,
		pkg.scripts['migration:all'],
		Object.fromEntries(
			Object.keys(RECORDED.files).map((path) => [
				path,
				readFileSync(join(REPO_ROOT, path), 'utf8'),
			]),
		),
	);
	writeFileSync(
		join(REPO_ROOT, 'verification/certified-call-sites.json'),
		`${JSON.stringify(next, null, '\t')}\n`,
	);
	console.log('Recorded the working tree into verification/certified-call-sites.json.');
	console.log('Review that diff in the same commit as the call-site change it certifies.');
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
	if (process.argv.includes('--record')) {
		record();
		return 0;
	}
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
