/**
 * Contract C3 — dual runtime (Node and Deno): executable evidence.
 *
 *   pnpm migration:c3
 *
 * plan.md § C3 / AC11 row C3: every one of the 8 `deno.json` tasks and the 9
 * `package.json` `deno run` wrappers must carry executable evidence — the exact
 * command, its verbatim exit code, and the decisive pass/fail line captured
 * from its output. "Deferral is not discharge": a surface without a run is a
 * FAIL row, never a note.
 *
 * How each surface is exercised — through its manifest form, never by
 * re-typing the underlying `deno run` line:
 *
 *   T1–T8   `deno task <name>`  in the directory holding deno.json
 *   W1–W9   `pnpm -s <name>`    in the directory holding package.json, so the
 *                               wrapper's real `deno run` line is what executes
 *
 * Rules that decide a row (printed per row as its RULE column):
 *
 *   - Exit codes are recorded verbatim. Non-zero is FAIL unless the script
 *     itself documents that code as an expected non-error — only
 *     `snapshot-social.ts --check` does (exit 3 = drift).
 *   - Every row needs a DECISIVE LINE matched by a row-specific pattern. Exit 0
 *     with no matching line is FAIL: an empty pass is not a pass.
 *   - Every wrapper must still be a `deno run …` line, and every `deno run`
 *     wrapper / deno.json task must have a row: an unlisted surface fails the
 *     harness closed instead of silently escaping the contract.
 *   - `dev` and `preview` are bounded proofs: start, poll `/` on the vite
 *     port until an HTTP response or the timeout, record the status and the
 *     elapsed time, stop the process group (SIGTERM, then SIGKILL after a
 *     grace period), confirm the port is free. `preview` needs `build`, and
 *     `check` needs the Paraglide types `build` generates, so T2 runs first.
 *   - Write-capable surfaces (`sync`, `sync:reconcile`, `sync:rehash`,
 *     `snapshot:3b`, `snapshot:social`) run against scratch copies under
 *     `tmp/c3-scratch/`: the blog tree parts they write via `BLOG_ROOT`, the
 *     3B subtrees they read and write via `THREEB_PATH`. `snapshot:3b` derives
 *     its output path from the script's own location, not `BLOG_ROOT`, so its
 *     `deno task` runs from the scratch copy of deno.json (byte-identical).
 *   - Non-mutation is proven, not assumed: every real target those scripts
 *     could write is fingerprinted before and after the whole run, along with
 *     `git status --porcelain`; any change fails the harness.
 *
 * Importing this module is safe — its CLI is guarded on `process.argv[1]` —
 * so `assert-c3-runtimes-controls.ts` can drive `runAssertions()` against
 * scratch manifests, closed ports and a tripped guard.
 */
import { spawn } from 'node:child_process';
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
import { get as httpGet } from 'node:http';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';

export const DENO_TASKS = [
	'dev',
	'build',
	'preview',
	'check',
	'sync',
	'study:check',
	'snapshot:3b',
	'snapshot:3b:check',
] as const;

export const DENO_WRAPPERS = [
	'sync',
	'sync:check',
	'sync:diff',
	'sync:reconcile',
	'sync:rehash',
	'snapshot:social',
	'snapshot:social:check',
	'study:check',
	'hash',
] as const;

/** Rows that need the scratch copies (they can write). */
const SCRATCH_ROWS = ['T4', 'T7', 'W1', 'W4', 'W5', 'W6'];

export interface Options {
	/** Directory holding package.json — `pnpm -s <script>` runs here. */
	repoRoot: string;
	/** Directory holding deno.json — `deno task <name>` runs here. Defaults to repoRoot. */
	denoDir?: string;
	/** The real 3B checkout: read-only rows use it as-is, the guard fingerprints it. */
	threeB?: string;
	/** Scratch root for the copies write-capable rows run against. */
	scratchRoot?: string;
	/** Ports the bounded dev/preview proofs poll. Default: parsed from vite.config.ts. */
	ports?: { dev?: number; preview?: number };
	/** How long the health poll waits for the first HTTP response. */
	healthTimeoutMs?: number;
	/** Run only these row ids (controls use this to stay fast). */
	only?: string[];
	/** Paths the mutation guard fingerprints. Default: the real write targets. */
	guardPaths?: string[];
	/** Git checkout whose `status --porcelain` must be unchanged. Default: repoRoot. */
	gitRoot?: string;
	/** Control-only hook: runs after the rows, before the closing guard check. */
	afterRows?: () => void;
	quiet?: boolean;
}

export interface Row {
	id: string;
	name: string;
	command: string;
	resolved: string;
	exit: number | null;
	status: 'PASS' | 'FAIL';
	rule: string;
	line: string;
	env: string;
}

interface Surface {
	id: string;
	kind: 'task' | 'wrapper';
	name: string;
	args: string[];
	/** Scratch rows override BLOG_ROOT / THREEB_PATH; real rows inherit the environment. */
	env: Record<string, string>;
	cwd: string;
	rule: string;
	/** Exit codes the rule accepts. */
	okExit: number[];
	/** The decisive line must match this. */
	decisive: RegExp;
	timeoutMs: number;
	server?: { port: number };
}

// The escape byte is the point: captured child output carries real ANSI
// sequences and the decisive line must be compared without them.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const strip = (s: string): string => s.replace(ANSI, '');

// ---------- fingerprints ----------

function walkFiles(root: string, out: string[]): void {
	if (!existsSync(root)) return;
	const st = statSync(root);
	if (st.isFile()) {
		out.push(root);
		return;
	}
	for (const name of readdirSync(root).sort()) walkFiles(join(root, name), out);
}

/** path -> sha256 of content, for every file under the guard roots. */
export function fingerprint(paths: string[]): Map<string, string> {
	const files: string[] = [];
	for (const p of paths) walkFiles(p, files);
	const map = new Map<string, string>();
	for (const file of files) {
		map.set(file, createHash('sha256').update(readFileSync(file)).digest('hex'));
	}
	return map;
}

function diffFingerprints(before: Map<string, string>, after: Map<string, string>): string[] {
	const changed: string[] = [];
	for (const [file, hash] of before) {
		if (!after.has(file)) changed.push(`deleted  ${file}`);
		else if (after.get(file) !== hash) changed.push(`modified ${file}`);
	}
	for (const file of after.keys()) if (!before.has(file)) changed.push(`created  ${file}`);
	return changed;
}

// ---------- process helpers ----------

interface Captured {
	exit: number | null;
	output: string;
	timedOut: boolean;
}

function run(
	cmd: string,
	args: string[],
	cwd: string,
	env: Record<string, string>,
	timeoutMs: number,
): Promise<Captured> {
	return new Promise((resolvePromise) => {
		// Detached for the same reason runServer is: `pnpm` and `deno task` fork
		// grandchildren (deno, vite, svelte-check) that inherit these pipes.
		// SIGKILL on the direct child alone leaves a grandchild holding stdout
		// open, 'close' never fires, and the harness hangs instead of failing.
		const child = spawn(cmd, args, {
			cwd,
			env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...env },
			stdio: ['ignore', 'pipe', 'pipe'],
			detached: true,
		});
		let output = '';
		let timedOut = false;
		child.stdout.on('data', (d) => (output += d));
		child.stderr.on('data', (d) => (output += d));
		const timer = setTimeout(() => {
			timedOut = true;
			try {
				if (child.pid) process.kill(-child.pid, 'SIGKILL');
			} catch {
				child.kill('SIGKILL');
			}
		}, timeoutMs);
		child.on('close', (code) => {
			clearTimeout(timer);
			resolvePromise({ exit: code, output: strip(output), timedOut });
		});
		child.on('error', (err) => {
			clearTimeout(timer);
			resolvePromise({ exit: null, output: `spawn error: ${err.message}`, timedOut });
		});
	});
}

function portFree(port: number): Promise<boolean> {
	return new Promise((resolvePromise) => {
		const sock = createConnection({ host: '127.0.0.1', port });
		sock.once('connect', () => {
			sock.destroy();
			resolvePromise(false);
		});
		sock.once('error', () => resolvePromise(true));
	});
}

function probe(port: number): Promise<number | null> {
	return new Promise((resolvePromise) => {
		const req = httpGet({ host: '127.0.0.1', port, path: '/', timeout: 2000 }, (res) => {
			res.resume();
			resolvePromise(res.statusCode ?? null);
		});
		req.on('timeout', () => {
			req.destroy();
			resolvePromise(null);
		});
		req.on('error', () => resolvePromise(null));
	});
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Bounded proof for a long-running task: start it detached (own process
 * group), poll the port, then stop the whole group and confirm the port is
 * free. The decisive line records status, elapsed time and how it stopped.
 */
async function runServer(
	cmd: string,
	args: string[],
	cwd: string,
	env: Record<string, string>,
	port: number,
	healthTimeoutMs: number,
): Promise<Captured & { decisive: string; ok: boolean }> {
	if (!(await portFree(port))) {
		return {
			exit: null,
			output: '',
			timedOut: false,
			ok: false,
			decisive: `port ${port} already in use before start — cannot attribute a response to this task`,
		};
	}
	const child = spawn(cmd, args, {
		cwd,
		env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...env },
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
	});
	let output = '';
	child.stdout.on('data', (d) => (output += d));
	child.stderr.on('data', (d) => (output += d));
	let exited: number | null | undefined;
	// Without this listener a spawn failure (binary absent, cwd gone) is thrown
	// as an uncaught exception: no FAIL row, no evidence table, no exit code.
	let spawnError = '';
	child.on('error', (err) => {
		spawnError = `spawn error: ${err.message}`;
		exited = null;
	});
	child.on('close', (code) => (exited = code));

	const started = Date.now();
	let status: number | null = null;
	let elapsed = 0;
	while (Date.now() - started < healthTimeoutMs && exited === undefined) {
		status = await probe(port);
		if (status !== null) {
			elapsed = Date.now() - started;
			break;
		}
		await sleep(500);
	}
	const announced = strip(output).match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)\//);
	const exitedDuringPoll = exited;

	// Stop the process group: SIGTERM, then SIGKILL after a grace period.
	let stoppedBy = 'already exited';
	if (exited === undefined && child.pid) {
		try {
			process.kill(-child.pid, 'SIGTERM');
			stoppedBy = 'SIGTERM';
		} catch {
			/* group already gone */
		}
		const grace = Date.now();
		while (exited === undefined && Date.now() - grace < 5000) await sleep(100);
		if (exited === undefined) {
			try {
				process.kill(-child.pid, 'SIGKILL');
				stoppedBy = 'SIGTERM ignored, SIGKILL';
			} catch {
				/* gone */
			}
			const hard = Date.now();
			while (exited === undefined && Date.now() - hard < 5000) await sleep(100);
		}
	}
	let free = false;
	const freeWait = Date.now();
	while (Date.now() - freeWait < 5000) {
		free = await portFree(port);
		if (free) break;
		await sleep(200);
	}

	const parts: string[] = [];
	if (status === null) {
		parts.push(
			exitedDuringPoll !== undefined
				? `process exited with ${exitedDuringPoll} before answering on :${port}`
				: `no HTTP response on 127.0.0.1:${port} within ${healthTimeoutMs}ms`,
		);
	} else {
		parts.push(`GET http://127.0.0.1:${port}/ -> ${status} after ${elapsed}ms`);
	}
	if (announced && Number(announced[1]) !== port) {
		parts.push(`server announced port ${announced[1]}, not the configured ${port}`);
	}
	if (spawnError) parts.unshift(spawnError);
	parts.push(`stopped: ${stoppedBy}`, free ? `port ${port} free` : `port ${port} STILL BOUND`);
	const ok =
		!spawnError &&
		status === 200 &&
		free &&
		(!announced || Number(announced[1]) === port) &&
		stoppedBy !== 'already exited';
	return {
		exit: exited ?? null,
		output: strip(output),
		timedOut: status === null,
		ok,
		decisive: parts.join('; '),
	};
}

// ---------- manifests ----------

function readJson(file: string): Record<string, unknown> {
	return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

function parseVitePorts(repoRoot: string): { dev: number; preview: number } {
	const file = join(repoRoot, 'vite.config.ts');
	const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
	const dev = text.match(/server:\s*\{[^}]*?port:\s*(\d+)/)?.[1];
	const preview = text.match(/preview:\s*\{[^}]*?port:\s*(\d+)/)?.[1];
	return { dev: dev ? Number(dev) : 5173, preview: preview ? Number(preview) : 4173 };
}

/** First expanded post whose 3B source exists — the corpus slug rows W3/W5/W9 use. */
function pickSlug(repoRoot: string, threeB: string): { category: string; slug: string } | null {
	const postsEn = join(repoRoot, 'src', 'content', 'posts', 'en');
	if (!existsSync(postsEn)) return null;
	for (const category of readdirSync(postsEn).sort()) {
		const dir = join(postsEn, category);
		if (!statSync(dir).isDirectory()) continue;
		for (const file of readdirSync(dir).sort()) {
			if (!file.endsWith('.md')) continue;
			const text = readFileSync(join(dir, file), 'utf8');
			if (!/^expanded: true$/m.test(text)) continue;
			if (existsSync(join(threeB, 'knowledge', category, file))) {
				return { category, slug: file.replace(/\.md$/, '') };
			}
		}
	}
	return null;
}

// ---------- scratch copies ----------

function copyInto(src: string, dest: string): void {
	if (!existsSync(src)) return;
	mkdirSync(resolve(dest, '..'), { recursive: true });
	cpSync(src, dest, { recursive: true });
}

/**
 * The blog parts the write-capable scripts touch (posts, data files) plus what
 * `deno task snapshot:3b` needs to run from here: deno.json, deno.lock, scripts/.
 */
function makeScratchBlog(repoRoot: string, dest: string): void {
	for (const p of ['deno.json', 'deno.lock', 'scripts', 'src/content/posts', 'src/lib/data']) {
		copyInto(join(repoRoot, p), join(dest, p));
	}
}

/**
 * The 3B subtrees the scripts open, discovered from the code:
 *   sync-from-3b.ts        knowledge/ (reads every entry, writes source frontmatter)
 *   compute-content-hash   knowledge/
 *   snapshot-social.ts     personal/brandon/social-posts.jsonl
 *   snapshot-3b-system.ts  projects/3b/architecture/model.json,
 *                          projects/3b/decisions/_index.md, .agents/skills,
 *                          .agent-ssot/rules (rule-file count), knowledge/,
 *                          and `node scripts/get-privacy.js` with cwd = 3B root
 *                          (scripts/lib + .agent-ssot/rules/information-layer.md)
 */
function makeScratchThreeB(threeB: string, dest: string): void {
	for (const p of [
		'knowledge',
		'projects/3b/architecture',
		'projects/3b/decisions/_index.md',
		'.agents/skills',
		'.agent-ssot/rules',
		'personal/brandon/social-posts.jsonl',
		'scripts/get-privacy.js',
		'scripts/lib',
	]) {
		copyInto(join(threeB, p), join(dest, p));
	}
}

// ---------- the surfaces ----------

interface SurfaceContext {
	repoRoot: string;
	denoDir: string;
	healthTimeoutMs: number;
	ports: { dev: number; preview: number };
	scratchBlog: string;
	scratchThreeB: string;
	slug: { category: string; slug: string } | null;
	allowFile: string;
}

function buildSurfaces(ctx: SurfaceContext): Surface[] {
	const scratchEnv = { BLOG_ROOT: ctx.scratchBlog, THREEB_PATH: ctx.scratchThreeB };
	const slug = ctx.slug?.slug ?? '(no expanded post with a 3B source found)';
	const minutes = (n: number): number => n * 60_000;
	const make =
		(kind: 'task' | 'wrapper') =>
		(
			id: string,
			name: string,
			rule: string,
			decisive: RegExp,
			extra: Partial<Surface> = {},
		): Surface => ({
			id,
			kind,
			name,
			args: [],
			env: {},
			cwd: kind === 'task' ? ctx.denoDir : ctx.repoRoot,
			rule,
			okExit: [0],
			decisive,
			timeoutMs: minutes(5),
			...extra,
		});
	const task = make('task');
	const wrapper = make('wrapper');
	const bounded = (port: number): string =>
		`bounded: HTTP 200 on :${port} within ${ctx.healthTimeoutMs}ms, process group stopped, port free`;

	return [
		// build first: preview serves its output and check needs its Paraglide types.
		task('T2', 'build', 'exit 0 + pagefind index summary', /Indexed \d+ pages/, {
			timeoutMs: minutes(20),
		}),
		task('T3', 'preview', bounded(ctx.ports.preview), /./, { server: { port: ctx.ports.preview } }),
		task(
			'T5',
			'check',
			'exit 0 + svelte-check 0 errors (machine line when piped; check:next is tsc --noEmit, silent on success)',
			/svelte-check found 0 errors|COMPLETED \d+ FILES 0 ERRORS/,
			{ timeoutMs: minutes(10) },
		),
		task('T1', 'dev', bounded(ctx.ports.dev), /./, { server: { port: ctx.ports.dev } }),
		task(
			'T4',
			'sync',
			'exit 0 + sync summary (scratch BLOG_ROOT + THREEB_PATH)',
			/^\s*Synced: \d+/m,
			{
				env: scratchEnv,
			},
		),
		task('T6', 'study:check', 'exit 0 + verified-count line', /Study sources verified: \d+ files/),
		task(
			'T7',
			'snapshot:3b',
			'exit 0 + "OK: wrote" (deno task run from the scratch copy of deno.json; output path is script-relative)',
			/^OK: wrote /m,
			{ cwd: ctx.scratchBlog, env: scratchEnv },
		),
		task('T8', 'snapshot:3b:check', 'exit 0 + "OK --check"', /^OK --check/m),
		wrapper(
			'W1',
			'sync',
			'exit 0 + sync summary (scratch BLOG_ROOT + THREEB_PATH)',
			/^\s*Synced: \d+/m,
			{
				env: scratchEnv,
			},
		),
		wrapper(
			'W2',
			'sync:check',
			'exit 0 + Hash Guard Report; exit 1 = upstream drift, not documented as non-error, so FAIL',
			/^\s*Hash mismatches: \d+/m,
		),
		wrapper('W3', 'sync:diff', `exit 0 + Hash line for --slug=${slug}`, /^\s*Hash:\s+/m, {
			args: ['--', `--slug=${slug}`],
		}),
		wrapper(
			'W4',
			'sync:reconcile',
			'exit 0 + reconciliation report (scratch)',
			/^\s*Cleared: \d+/m,
			{
				env: scratchEnv,
			},
		),
		wrapper(
			'W5',
			'sync:rehash',
			`exit 0 + rehash summary for --allow=<scratch allowlist naming ${ctx.slug ? `${ctx.slug.category}/${slug}.md` : 'nothing'}> (scratch)`,
			/^\s*(Rehashed|Would rehash): \d+/m,
			{ args: ['--', `--allow=${ctx.allowFile}`], env: scratchEnv },
		),
		wrapper(
			'W6',
			'snapshot:social',
			'exit 0 + "Wrote … social-feed.json" (scratch)',
			/Wrote .*social-feed\.json \(\d+ campaigns\)/,
			{ env: scratchEnv },
		),
		wrapper(
			'W7',
			'snapshot:social:check',
			'exit 0 + "social snapshots clean." or exit 3 + DRIFT (3 is documented as drift, not error)',
			/social snapshots clean\.|snapshot DRIFT/,
			{ okExit: [0, 3] },
		),
		wrapper(
			'W8',
			'study:check',
			'exit 0 + verified-count line',
			/Study sources verified: \d+ files/,
		),
		wrapper('W9', 'hash', `exit 0 + 64-hex hash for --slug=${slug}`, /^[0-9a-f]{64}$/m, {
			args: ['--', `--slug=${slug}`],
		}),
	];
}

/** Last output line matching the row's pattern; pnpm's `$ cmd` echo and deno's `Task …` banner never count. */
function decisiveFor(surface: Surface, captured: Captured): string | null {
	const lines = captured.output
		.split('\n')
		.map((l) => l.trimEnd())
		.filter((l) => l.trim() && !/^\$ /.test(l) && !/^Task \S+ /.test(l));
	const re = new RegExp(surface.decisive.source, surface.decisive.flags.replace('m', ''));
	const matches = lines.filter((l) => re.test(l.trim()));
	return matches.length ? matches[matches.length - 1].trim() : null;
}

function failureLine(captured: Captured): string {
	const lines = captured.output.split('\n').filter((l) => l.trim());
	const err = lines.find((l) => /^error:|Error:|FAIL|ERROR|denied|NotFound/.test(l));
	return (err ?? lines[lines.length - 1] ?? '(no output)').trim();
}

// ---------- main ----------

export async function runAssertions(options: Options): Promise<number> {
	const repoRoot = resolve(options.repoRoot);
	const denoDir = resolve(options.denoDir ?? repoRoot);
	const threeB = resolve(options.threeB ?? process.env.THREEB_PATH ?? join(homedir(), 'dev', '3b'));
	const scratchRoot = resolve(options.scratchRoot ?? join(repoRoot, 'tmp', 'c3-scratch'));
	const vitePorts = parseVitePorts(repoRoot);
	const ports = {
		dev: options.ports?.dev ?? vitePorts.dev,
		preview: options.ports?.preview ?? vitePorts.preview,
	};
	const healthTimeoutMs = options.healthTimeoutMs ?? 60_000;
	const gitRoot = resolve(options.gitRoot ?? repoRoot);
	const guardPaths = options.guardPaths ?? [
		join(repoRoot, 'src', 'content', 'posts'),
		join(repoRoot, 'src', 'lib', 'data'),
		join(threeB, 'knowledge'),
		join(threeB, 'personal', 'brandon', 'social-posts.jsonl'),
		join(threeB, 'projects', '3b', 'architecture'),
		join(threeB, 'projects', '3b', 'decisions', '_index.md'),
	];
	const say = (...parts: unknown[]): void => {
		if (!options.quiet) console.log(...parts);
	};

	const failures: string[] = [];
	const rows: Row[] = [];

	// --- manifests: the 17 surfaces must exist in their exact form, and nothing extra may hide.
	const denoJson = join(denoDir, 'deno.json');
	const pkgJson = join(repoRoot, 'package.json');
	if (!existsSync(denoJson) || !existsSync(pkgJson)) {
		console.error(`FATAL: manifests not found: ${denoJson} / ${pkgJson}`);
		return 2;
	}
	const tasks = (readJson(denoJson).tasks ?? {}) as Record<string, string>;
	const scripts = (readJson(pkgJson).scripts ?? {}) as Record<string, string>;
	const only = options.only ? new Set(options.only) : null;

	for (const name of Object.keys(tasks)) {
		if (!(DENO_TASKS as readonly string[]).includes(name)) {
			failures.push(
				`deno.json task "${name}" has no C3 row — an unlisted Deno surface carries no evidence`,
			);
		}
	}
	for (const [name, cmd] of Object.entries(scripts)) {
		if (/^deno run\b/.test(cmd) && !(DENO_WRAPPERS as readonly string[]).includes(name)) {
			failures.push(`package.json script "${name}" is a deno run wrapper with no C3 row: ${cmd}`);
		}
	}

	// --- guard: fingerprint the real targets before anything runs.
	const gitBefore = await run('git', ['status', '--porcelain'], gitRoot, {}, 60_000);
	const fpBefore = fingerprint(guardPaths);
	say(
		`GUARD    ${fpBefore.size} files fingerprinted under ${guardPaths.length} real targets; git status captured`,
	);

	// --- scratch copies.
	const scratchBlog = join(scratchRoot, 'blog');
	const scratchThreeB = join(scratchRoot, '3b');
	const allowFile = join(scratchRoot, 'rehash-allow.txt');
	rmSync(scratchRoot, { recursive: true, force: true });
	mkdirSync(scratchRoot, { recursive: true });
	const slug = pickSlug(repoRoot, threeB);
	const needsScratch = !only || [...only].some((id) => SCRATCH_ROWS.includes(id));
	if (needsScratch) {
		makeScratchBlog(repoRoot, scratchBlog);
		makeScratchThreeB(threeB, scratchThreeB);
		writeFileSync(allowFile, slug ? `${slug.category}/${slug.slug}.md\n` : '');
		say(
			`SCRATCH  blog -> ${relative(repoRoot, scratchBlog)}  3b -> ${relative(repoRoot, scratchThreeB)} (copied from ${threeB})`,
		);
	}
	if (slug) say(`SLUG     ${slug.category}/${slug.slug} (first expanded post with a 3B source)`);

	const surfaces = buildSurfaces({
		repoRoot,
		denoDir,
		healthTimeoutMs,
		ports,
		scratchBlog,
		scratchThreeB,
		slug,
		allowFile,
	});

	for (const surface of surfaces) {
		if (only && !only.has(surface.id)) continue;
		const manifest = surface.kind === 'task' ? tasks : scripts;
		const command =
			surface.kind === 'task'
				? `deno task ${surface.name}`
				: `pnpm -s ${surface.name}${surface.args.length ? ' ' + surface.args.join(' ') : ''}`;
		const envNote = Object.entries(surface.env)
			.map(([k, v]) => `${k}=${relative(repoRoot, v) || '.'}`)
			.join(' ');
		const row: Row = {
			id: surface.id,
			name: surface.name,
			command,
			resolved: manifest[surface.name] ?? '(missing)',
			exit: null,
			status: 'FAIL',
			rule: surface.rule,
			line: '',
			env: envNote,
		};
		rows.push(row);
		const report = (): void => {
			if (row.status === 'FAIL')
				failures.push(`${surface.id} ${command}: exit ${row.exit} — ${row.line}`);
			say(
				`${row.status}  ${surface.id.padEnd(3)} ${command.padEnd(52)} exit ${String(row.exit ?? '-').padEnd(4)} ${row.line}${envNote ? `  [${envNote}]` : ''}`,
			);
		};

		if (!(surface.name in manifest)) {
			row.line = `${surface.kind === 'task' ? 'deno.json task' : 'package.json script'} "${surface.name}" is missing`;
			report();
			continue;
		}
		if (surface.kind === 'wrapper' && !/^deno run\b/.test(manifest[surface.name])) {
			row.line = `wrapper is not a \`deno run\` line: ${manifest[surface.name]}`;
			report();
			continue;
		}

		const bin = surface.kind === 'task' ? 'deno' : 'pnpm';
		const args =
			surface.kind === 'task' ? ['task', surface.name] : ['-s', surface.name, ...surface.args];

		if (surface.server) {
			const result = await runServer(
				bin,
				args,
				surface.cwd,
				surface.env,
				surface.server.port,
				healthTimeoutMs,
			);
			row.exit = result.exit;
			row.line = result.decisive;
			row.status = result.ok ? 'PASS' : 'FAIL';
		} else {
			const captured = await run(bin, args, surface.cwd, surface.env, surface.timeoutMs);
			row.exit = captured.exit;
			const decisive = decisiveFor(surface, captured);
			if (captured.timedOut) {
				row.line = `timed out after ${surface.timeoutMs}ms`;
			} else if (captured.exit === null || !surface.okExit.includes(captured.exit)) {
				// A report line beats a stack trace when the script did reach its summary.
				row.line = decisive ?? failureLine(captured);
			} else if (!decisive) {
				row.line = `exit ${captured.exit} but no decisive line matched ${surface.decisive} — an empty pass is not a pass`;
			} else {
				row.line = decisive;
				row.status = 'PASS';
			}
		}
		report();
	}

	options.afterRows?.();

	// --- guard: nothing real may have changed.
	const fpAfter = fingerprint(guardPaths);
	const changed = diffFingerprints(fpBefore, fpAfter);
	const gitAfter = await run('git', ['status', '--porcelain'], gitRoot, {}, 60_000);
	const gitChanged = gitAfter.output !== gitBefore.output;
	if (changed.length) {
		failures.push(`MUTATION GUARD: ${changed.length} real target file(s) changed during the run`);
		for (const c of changed) if (!options.quiet) console.error(`MUTATION GUARD  ${c}`);
	}
	if (gitChanged) {
		failures.push('MUTATION GUARD: git status --porcelain changed during the run');
		if (!options.quiet) {
			console.error(
				`MUTATION GUARD  git status before:\n${gitBefore.output}\n  after:\n${gitAfter.output}`,
			);
		}
	}
	say(
		changed.length || gitChanged
			? 'GUARD    FAIL — real targets mutated'
			: `GUARD    OK — ${fpAfter.size} files unchanged, git status unchanged`,
	);
	rmSync(scratchRoot, { recursive: true, force: true });

	// --- evidence table.
	if (!options.quiet) {
		console.log('\n| id | command | resolved manifest line | exit | rule | decisive line |');
		console.log('| -- | ------- | ---------------------- | ---- | ---- | ------------- |');
		for (const r of rows) {
			const cmd = r.env ? `${r.command} (${r.env})` : r.command;
			console.log(
				`| ${r.id} ${r.status} | \`${cmd}\` | \`${r.resolved}\` | ${r.exit ?? '-'} | ${r.rule} | ${r.line.replace(/\|/g, '\\|')} |`,
			);
		}
	}

	const pass = rows.filter((r) => r.status === 'PASS').length;
	const rowFails = rows.length - pass;
	const otherFails = failures.length - rowFails;
	if (options.quiet) return failures.length ? 1 : 0;
	for (const f of failures) console.error(`C3 FAIL  ${f}`);
	console.log(
		`\nRESULT: ${pass} pass, ${rowFails + otherFails} fail (${rows.length} of ${DENO_TASKS.length + DENO_WRAPPERS.length} surfaces run${otherFails ? `, ${otherFails} harness-level failure(s)` : ''})`,
	);
	return failures.length ? 1 : 0;
}

if (process.argv[1]?.endsWith('assert-c3-runtimes.ts')) {
	runAssertions({ repoRoot: process.cwd() }).then((code) => process.exit(code));
}
