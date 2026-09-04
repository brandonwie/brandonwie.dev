/**
 * Negative controls for the C3 runtime-evidence harness.
 *
 *   pnpm migration:c3:controls
 *
 * `assert-c3-runtimes.ts` reports pass rows for the Deno tasks and wrappers.
 * Those rows are worth nothing until the harness has been observed to go red
 * on the ways a runtime surface can quietly stop being proven — the same
 * argument `assert-c13-shell-controls.ts` makes for the shell table.
 *
 * Two kinds of control, proving opposite things:
 *
 *   DEFECT      the harness MUST exit 1 on a deliberately broken surface
 *   INVARIANCE  the harness MUST exit 0 on a benign change it should ignore
 *
 * Every control mutates a throwaway copy of the manifests under `tmp/` (or an
 * option the harness exposes for exactly this purpose: the port it polls, the
 * paths its mutation guard fingerprints), never the real `deno.json`,
 * `package.json` or content. A mutation that changes nothing is reported as a
 * failed control, not a passed one.
 *
 * Controls stay fast by running a single row each (`only`), except the port
 * control, which really starts `deno task dev` and then polls a port nothing
 * listens on.
 */
import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { runAssertions, probe, portFree, type Options } from './assert-c3-runtimes.ts';
import { createServer } from 'node:http';

type Kind = 'DEFECT' | 'INVARIANCE';

interface Control {
	id: string;
	kind: Kind;
	what: string;
	/** Which single row the control drives. */
	only: string[];
	/** Mutate the scratch manifests directory in place. */
	apply?: (dir: string) => void;
	/** Harness options the control overrides (ports, guard paths, hooks). */
	options?: (ctx: {
		dir: string;
		guard: string;
		realRepo: string;
		closedPort: number;
	}) => Partial<Options>;
}

const editJson = (
	file: string,
	edit: (json: Record<string, unknown>) => Record<string, unknown>,
): void => {
	const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
	writeFileSync(file, JSON.stringify(edit(json), null, '\t') + '\n');
};

const editTasks =
	(edit: (tasks: Record<string, string>) => Record<string, string>) =>
	(dir: string): void =>
		editJson(join(dir, 'deno.json'), (json) => ({
			...json,
			tasks: edit(json.tasks as Record<string, string>),
		}));

const editScripts =
	(edit: (scripts: Record<string, string>) => Record<string, string>) =>
	(dir: string): void =>
		editJson(join(dir, 'package.json'), (json) => ({
			...json,
			scripts: edit(json.scripts as Record<string, string>),
		}));

/**
 * LOOPBACK-FAMILY REGRESSION CONTROLS.
 *
 * The row controls below drive the real harness, which is the right shape for
 * task and script surfaces but cannot pin the bug this PR fixed: both probes
 * hard-coded `127.0.0.1` while Vite 8 binds `[::1]` only, so `dev` and
 * `preview` were reported dead while serving, and `portFree` called a held port
 * free. C3-06 covers a port with NO listener and passes either way, so nothing
 * in the existing set fails against the pre-fix harness.
 *
 * These two are deterministic and self-contained: they bind an IPv6-only
 * listener and assert the probes see it. Against the IPv4-only implementation
 * both fail, which is the property a regression control has to have.
 */
async function loopbackFailures(): Promise<string[]> {
	const problems: string[] = [];
	const server = createServer((_req, res) => {
		res.statusCode = 204;
		res.end();
	});
	await new Promise<void>((done, fail) => {
		server.once('error', fail);
		// `::1` only — deliberately no IPv4 listener, which is what Vite 8 does.
		server.listen(0, '::1', done);
	});
	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : 0;
	try {
		const status = await probe(port);
		if (status !== 204) {
			problems.push(
				`LB-01 an IPv6-only listener was not reached: probe returned ${status ?? 'null'}, expected 204`,
			);
		}
		const free = await portFree(port);
		if (free !== false) {
			problems.push('LB-02 a port held on [::1] was reported free');
		}
	} finally {
		await new Promise<void>((done) => server.close(() => done()));
	}
	return problems;
}

const CONTROLS: Control[] = [
	{
		id: 'C3-01',
		kind: 'DEFECT',
		what: 'the study:check task removed from deno.json — the surface must be reported missing',
		only: ['T6'],
		apply: editTasks(({ 'study:check': _dropped, ...rest }) => rest),
	},
	{
		id: 'C3-02',
		kind: 'DEFECT',
		what: 'the study:check wrapper replaced by `true` — exit 0 with no evidence must not pass',
		only: ['W8'],
		apply: editScripts((s) => ({ ...s, 'study:check': 'true' })),
	},
	{
		id: 'C3-03',
		kind: 'DEFECT',
		what: 'the wrapper keeps its deno run form but its output is silenced — an empty pass line must not pass',
		only: ['W8'],
		apply: editScripts((s) => ({ ...s, 'study:check': `${s['study:check']} >/dev/null` })),
	},
	{
		id: 'C3-04',
		kind: 'DEFECT',
		what: 'the wrapper prints the exact pass line from node instead of running deno — manifest form must be enforced',
		only: ['W8'],
		apply: editScripts((s) => ({
			...s,
			'study:check': `node -e "console.log('Study sources verified: 42 files across 4 courses')"`,
		})),
	},
	{
		id: 'C3-05',
		kind: 'DEFECT',
		what: 'the task prints its pass line and then exits 7 — exit codes are verbatim',
		only: ['T6'],
		apply: editTasks((t) => ({ ...t, 'study:check': `${t['study:check']} && exit 7` })),
	},
	{
		id: 'C3-06',
		kind: 'DEFECT',
		what: 'the dev health poll pointed at a port nothing listens on — the dev row must FAIL',
		only: ['T1'],
		options: ({ realRepo, closedPort }) => ({
			repoRoot: realRepo,
			denoDir: realRepo,
			ports: { dev: closedPort },
			healthTimeoutMs: 10_000,
		}),
	},
	{
		id: 'C3-07',
		kind: 'DEFECT',
		what: 'a file under a guarded target written during the run — the mutation guard must FAIL',
		only: ['T6'],
		options: ({ guard }) => ({
			guardPaths: [guard],
			afterRows: () => writeFileSync(join(guard, 'social-feed.json'), '{"tampered":true}\n'),
		}),
	},
	{
		id: 'C3-12',
		kind: 'INVARIANCE',
		what: 'a file written OUTSIDE the guard roots during the run — the guard must not trip; paired with C3-07',
		only: ['T6'],
		options: ({ dir, guard }) => ({
			guardPaths: [guard],
			afterRows: () => {
				const outside = join(dir, 'outside-the-guard');
				mkdirSync(outside, { recursive: true });
				writeFileSync(join(outside, 'stray.json'), '{"outside":true}\n');
			},
		}),
	},
	{
		id: 'C3-08',
		kind: 'INVARIANCE',
		what: 'deno.json re-indented with four spaces and a trailing blank line — paired with C3-01/05',
		only: ['T6'],
		apply: (dir) => {
			const file = join(dir, 'deno.json');
			const json = JSON.parse(readFileSync(file, 'utf8'));
			writeFileSync(file, JSON.stringify(json, null, '    ') + '\n\n');
		},
	},
	{
		id: 'C3-09',
		kind: 'INVARIANCE',
		what: 'package.json scripts listed in reverse order — paired with C3-02/03/04',
		only: ['W8'],
		apply: editScripts((s) => Object.fromEntries(Object.entries(s).reverse())),
	},
	{
		id: 'C3-10',
		kind: 'INVARIANCE',
		what: 'an unrelated non-deno script added to package.json — only deno run wrappers are in scope; paired with C3-11',
		only: ['W8'],
		apply: editScripts((s) => ({ ...s, 'c3:noise': 'echo not a deno surface' })),
	},
	{
		id: 'C3-11',
		kind: 'DEFECT',
		what: 'an extra deno run wrapper added with no C3 row — an unlisted Deno surface must fail closed',
		only: ['W8'],
		apply: editScripts((s) => ({
			...s,
			'sync:extra': 'deno run --allow-read scripts/sync-from-3b.ts --check',
		})),
	},
];

// ---------- scratch ----------

function walk(root: string, out: string[]): void {
	if (!existsSync(root)) return;
	if (statSync(root).isFile()) {
		out.push(root);
		return;
	}
	for (const name of readdirSync(root).sort()) walk(join(root, name), out);
}

/** Content hash of the scratch manifests + guard tree + option overrides, so a no-op control is detectable. */
function signature(dir: string, guard: string, overrides: Partial<Options> | undefined): string {
	const hash = createHash('sha256');
	const files: string[] = [];
	walk(join(dir, 'deno.json'), files);
	walk(join(dir, 'package.json'), files);
	walk(guard, files);
	for (const file of files) hash.update(file).update(readFileSync(file));
	const { afterRows, ...plain } = overrides ?? {};
	hash.update(JSON.stringify(plain)).update(afterRows ? 'afterRows' : '');
	return hash.digest('hex');
}

/**
 * The scratch manifests directory: deno.json, deno.lock, scripts/ and the one
 * data module `validate-study-sources.ts` imports, plus a package.json reduced
 * to its scripts so pnpm never tries to install anything here.
 */
function makeScratch(realRepo: string, dir: string, guard: string): void {
	rmSync(dir, { recursive: true, force: true });
	rmSync(guard, { recursive: true, force: true });
	mkdirSync(join(dir, 'src', 'lib'), { recursive: true });
	for (const p of ['deno.json', 'deno.lock', 'scripts', 'src/lib/data']) {
		cpSync(join(realRepo, p), join(dir, p), { recursive: true });
	}
	const pkg = JSON.parse(readFileSync(join(realRepo, 'package.json'), 'utf8'));
	writeFileSync(
		join(dir, 'package.json'),
		JSON.stringify(
			{ name: 'c3-controls-scratch', private: true, scripts: pkg.scripts },
			null,
			'\t',
		) + '\n',
	);
	cpSync(join(realRepo, 'src', 'lib', 'data'), guard, { recursive: true });
}

// A SECOND, UNFIXED COPY OF THE SAME PROBE LIVED HERE.
//
// This file carried its own IPv4-only `portFree`, used to find a closed port for
// C3-06. Being a hoisted function declaration, it silently SHADOWED the
// `portFree` imported at the top of this file -- so the loopback regression
// controls below were exercising the unfixed implementation and reporting an
// IPv6-held port as free. Deleted rather than renamed: one definition of "is
// this port free" per repository is the point, and a scratch-port search that
// ignores IPv6 can hand a control a port that is not actually closed.

async function main(): Promise<number> {
	const loopback = await loopbackFailures();
	for (const failure of loopback) console.error(`LOOPBACK  ${failure}`);
	if (loopback.length > 0) {
		console.error(
			`\nRESULT: loopback regression controls failed with ${loopback.length} problem(s)`,
		);
		return 2;
	}

	const realRepo = resolve(process.cwd());
	const root = join(realRepo, 'tmp', 'c3-controls');
	const dir = join(root, 'manifests');
	const guard = join(root, 'guard');
	const scratchRoot = join(root, 'scratch');

	let closedPort = 5199;
	while (!(await portFree(closedPort))) closedPort += 1;

	const baseOptions = (): Options => ({
		repoRoot: dir,
		denoDir: dir,
		scratchRoot,
		guardPaths: [guard],
		gitRoot: realRepo,
		quiet: true,
	});

	// A control suite that never sees the unbroken manifests passing is not a
	// baseline, it is a coincidence.
	makeScratch(realRepo, dir, guard);
	const clean = await runAssertions({ ...baseOptions(), only: ['T6', 'W8'] });
	console.log(`BASELINE  scratch manifests unmodified (rows T6, W8) -> exit ${clean} (expected 0)`);
	if (clean !== 0) {
		console.error(
			'FATAL: the unmodified manifests do not pass; fix that before trusting any control below',
		);
		rmSync(root, { recursive: true, force: true });
		return 1;
	}

	const failures: string[] = [];
	for (const control of CONTROLS) {
		makeScratch(realRepo, dir, guard);
		const before = signature(dir, guard, undefined);
		control.apply?.(dir);
		const overrides = control.options?.({ dir, guard, realRepo, closedPort });
		const after = signature(dir, guard, overrides);
		// A mutation that silently matched nothing turns an INVARIANCE control
		// into a tautology and a DEFECT control into a coincidence.
		if (before === after) {
			failures.push(
				`${control.id} ${control.what}: the mutation changed nothing, so the control proves nothing`,
			);
			console.log(
				`FAIL  ${control.id}  ${control.kind.padEnd(10)} NO-OP MUTATION                  ${control.what}`,
			);
			continue;
		}
		const code = await runAssertions({ ...baseOptions(), only: control.only, ...overrides });
		const expected = control.kind === 'DEFECT' ? 1 : 0;
		const ok = code === expected;
		if (!ok) failures.push(`${control.id} ${control.what}: exit ${code}, expected ${expected}`);
		console.log(
			`${ok ? 'PASS' : 'FAIL'}  ${control.id}  ${control.kind.padEnd(10)} exit ${code} (expected ${expected})  ${control.what}`,
		);
	}
	rmSync(root, { recursive: true, force: true });

	const defects = CONTROLS.filter((c) => c.kind === 'DEFECT').length;
	const invariance = CONTROLS.length - defects;
	console.log(
		`\n${CONTROLS.length} controls: ${defects} defect (must exit 1), ${invariance} invariance (must exit 0)`,
	);
	if (failures.length) {
		for (const line of failures) console.error(`CONTROL FAILED ${line}`);
		console.error(
			`RESULT: ${failures.length}/${CONTROLS.length} control(s) failed — the C3 harness does not fail closed`,
		);
		return 1;
	}
	console.log(`RESULT: ${CONTROLS.length}/${CONTROLS.length} controls behaved as specified`);
	return 0;
}

main().then((code) => process.exit(code));
