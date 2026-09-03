/**
 * Contract C11 — library ports (@xyflow and mermaid): executable evidence.
 *
 *   pnpm migration:c11
 *
 * Slice 2 ports the two third-party-library surfaces the migration cannot avoid:
 * the `/system/3b` architecture graph (`@xyflow/svelte` to `@xyflow/react`) and
 * the mermaid renderer. Both are places where a like-for-like rewrite compiles,
 * runs, looks right, and is still wrong — so every row here asserts a MECHANISM
 * rather than an appearance.
 *
 * The rows are grouped by what they hold onto:
 *
 *   P  port roll-call      every Svelte role has a Next counterpart, the
 *                          dependency is pinned, and the lazy boundary is
 *                          actually a boundary
 *   A  style and hover     edgeStyleObject returns an object and dimEdges
 *                          MERGES into it (the concatenation regression)
 *   B  markerEnd typing    the narrowing lands on markerEnd.type, proven by
 *                          widening it and counting the errors that appear
 *   C  typecheck           tsc exits 0 AND the ported files are in the program
 *   H  hydration contract  zero flow elements in the export, the flow code in
 *                          an UNREFERENCED chunk, the reporter in a referenced one
 *   N  shell accounting    every ledgered shell approval's claim about WHICH
 *                          normalized keys differ is recomputed, not trusted
 *   S  scenarios S6-S9     each failure induced through a seam, each paired
 *                          with the positive half that makes it falsifiable
 *   M  mermaid parity      config diffed key by key against the Svelte source
 *                          with ONE allowlisted divergence, plus a recomputed
 *                          corpus census behind that divergence's argument
 *
 * WHY N EXISTS. During this PR a claim reached a ledger reason — and a pushed
 * commit message — that `/system/3b` had eleven normalized shell differences.
 * It has one. The measurement had been taken from `extractFields(...).shell`,
 * the RAW shell, while `compare()` runs both sides through `normalizeShell`
 * first and absorbs three whole classes of difference before diffing. Six
 * correct records would have been rewritten as wrong. The N rows recompute what
 * every shell approval asserts, so that confusion fails a row instead of
 * becoming prose someone later trusts.
 *
 * Importing this module is safe — its CLI is guarded on `process.argv[1]` — so
 * `assert-c11-library-ports-controls.ts` can drive `runAssertions()` against
 * mutated sources, mutated build copies and substituted seams.
 */
import { execFileSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

import {
	buildDrilldown,
	buildOverview,
	dimEdges,
	edgeStyleObject,
	hasFallback,
	type DagreGraph,
	type FlowEdge,
	type SnapEdge,
	type SnapLayer,
	type SnapNode,
} from '../next/src/graph/system3b-graph.ts';
import { mermaidView, renderMermaid } from '../next/src/components/Mermaid.tsx';
import { capture, loadLedger, normalizeShell, type Baseline } from './migration-verify.ts';

// ---------------------------------------------------------------- the surface

/** Every Svelte role and the file that carries it now. A role with no row is
 *  not a port, it is an omission, so the list is exhaustive by construction. */
export const PORT_ROLES = [
	{
		role: 'data builder',
		svelte: 'src/lib/utils/system3b-graph.ts',
		next: 'next/src/graph/system3b-graph.ts',
	},
	{
		role: 'lazy boundary',
		svelte: 'src/lib/components/System3bGraph.svelte',
		next: 'next/src/components/System3bGraph.tsx',
	},
	{
		role: 'runtime importer',
		svelte: 'src/lib/components/System3bFlow.svelte',
		next: 'next/src/components/System3bFlow.tsx',
	},
	{
		role: 'custom node',
		svelte: 'src/lib/components/System3bNode.svelte',
		next: 'next/src/components/System3bNode.tsx',
	},
	{
		role: 'fit-view effect',
		svelte: 'src/lib/components/System3bFitView.svelte',
		next: 'next/src/components/System3bFitView.tsx',
	},
	{
		role: 'band node',
		svelte: 'src/lib/components/System3bBandNode.svelte',
		next: 'next/src/components/System3bBandNode.tsx',
	},
] as const;

/** Files with no Svelte counterpart that the port REQUIRES — the fallback that
 *  must not live in the lazy chunk, the boundary next/dynamic does not give
 *  you, and the build-time snapshot re-export. */
export const PORT_ADDITIONS = [
	'next/src/components/System3bFallback.tsx',
	'next/src/components/System3bGraphBoundary.tsx',
	'next/src/data/system-snapshot.ts',
] as const;

/** Exact pin, no caret: a minor bump moves @xyflow/system underneath it. */
export const XYFLOW_REACT_PIN = '12.11.6';
export const XYFLOW_SYSTEM_TRANSITIVE = '0.0.82';

/** The class marker every @xyflow/react DOM node carries. `svelte-flow__` in
 *  the old stack — the prefix is stack-specific, which is why the baseline's
 *  element counts could never have gone green as written. */
export const FLOW_SENTINEL = 'react-flow__';

/** Emitted by System3bFallback into the prerendered HTML. */
export const FALLBACK_SENTINEL = 's3b-fallback';

/** Emitted by System3bGraphBoundary.componentDidCatch. Its presence in an
 *  EAGERLY referenced chunk is what makes a rejected lazy chunk reportable. */
export const REPORTER_SENTINEL = '[System3bGraph] failed to load interactive graph';

/** The six lane counts the prerendered fallback prints, in lane order.
 *
 *  The plan's manual checkpoint for this was `grep -o '[0-9]* nodes'`, which
 *  returns NOTHING against the Next build: React separates interpolated text
 *  with `<!-- -->` comment markers, so the HTML reads `16<!-- --> <!-- -->nodes`.
 *  A check that stays silent when the code is CORRECT is worse than no check,
 *  so the comments are stripped before matching. */
export const LANE_COUNTS = [16, 17, 9, 15, 8, 10];

/** What each ledgered shell approval claims, recomputed by the N rows.
 *
 *  Keys, not counts: "the ONLY difference is preload-data" is a statement about
 *  WHICH key differs, and a count alone would let one difference disappear
 *  while another appeared. */
export const SHELL_CLAIMS: Record<string, string[]> = {
	'/': ['body:preload-data'],
	'/404': ['body:preload-data', 'link:<bundle>', 'meta:robots'],
	'/posts/giscus-sveltekit-integration': ['body:preload-data'],
	'/ko/posts/giscus-sveltekit-integration': ['body:preload-data'],
	'/feed': ['body:preload-data'],
	'/ko/feed': ['body:preload-data'],
	'/system/3b': ['body:preload-data'],
};

/** The Mermaid config key the Next side is ALLOWED to differ on, and why.
 *  Everything else must match the Svelte source key for key. */
export const MERMAID_DIVERGENCES: Record<string, { svelte: unknown; next: unknown; why: string }> =
	{
		securityLevel: {
			svelte: 'loose',
			next: 'strict',
			why: 'Behavior-identical on this corpus (see the M2 census) and compile-corpus.ts already asserts strict; reverting would turn a green assertion red.',
		},
	};

/** The corpus measurement the securityLevel divergence rests on.
 *
 *  Declared here and RECOMPUTED by M2 rather than cited from prose. Two counts
 *  stated as prose earlier in this PR turned out wrong, which is the whole
 *  reason this is a row. A mismatch is a FAIL that says re-measure: the
 *  argument for `strict` is only as good as the corpus it was measured over. */
export const MERMAID_CENSUS = {
	fences: 68,
	byType: {
		flowchart: 53,
		sequenceDiagram: 9,
		gantt: 3,
		graph: 2,
		'stateDiagram-v2': 1,
	} as Record<string, number>,
	fencesWithBr: 15,
};

/** Loose-only mermaid features. Any occurrence invalidates the divergence, so
 *  the required count is zero and the row says so rather than reporting a
 *  number nobody reads. */
export const RISKY_MERMAID = [
	{ label: 'click directive', re: /^\s*click\s+/m },
	{ label: 'classDef', re: /^\s*classDef\s+/m },
	{ label: 'linkStyle', re: /^\s*linkStyle\s+/m },
	{ label: 'style directive', re: /^\s*style\s+\S/m },
	{ label: 'fa: icon', re: /fa:/ },
	{ label: 'html anchor', re: /<a\s/i },
	{ label: 'inline emphasis tag', re: /<(b|i|strong|em)>/i },
	{ label: 'entity', re: /&[a-zA-Z]+;|&#\d+;/ },
];

// ------------------------------------------------------------------- plumbing

export interface C11Options {
	/** Repository root every relative path resolves against. */
	root?: string;
	/** The exported Next site. */
	buildDir?: string;
	/** Frozen comparator evidence for the N rows. */
	baselineFile?: string;
	/** Ledger the N rows read their claims' fingerprints from. */
	ledgerFile?: string;
	/** Replace a source file's CONTENT for one run: real path to scratch path.
	 *  The controls' injection surface for every text-reading row. */
	sourceOverrides?: Record<string, string>;
	/** Replace the six lane counts (controls prove the row can fail). */
	laneCounts?: number[];
	/** Replace the shell claims (controls prove N can fail). */
	shellClaims?: Record<string, string[]>;
	/** Replace the Mermaid divergence allowlist (controls widen and narrow it). */
	mermaidDivergences?: Record<string, { svelte: unknown; next: unknown; why: string }>;
	/** Replace the declared census (controls prove M2 can fail). */
	mermaidCensus?: typeof MERMAID_CENSUS;
	/** Skip the B3 falsification and the C typecheck. Controls that already
	 *  drive tsc set this so a single control does not pay for two runs. */
	skipTypecheck?: boolean;
	/** Where the S8 build copy is made. */
	scratchDir?: string;
	/** Where the B3 falsification program is built. Exactly two segments below
	 *  the repo root -- see falsifyMarkerEnd. */
	falsifyDir?: string;
	/** Quiet the per-row log (controls run this many times). */
	quiet?: boolean;
}

interface Row {
	id: string;
	what: string;
	ok: boolean;
	detail: string;
}

class Runner {
	rows: Row[] = [];
	constructor(private quiet: boolean) {}

	record(id: string, what: string, ok: boolean, detail: string): void {
		this.rows.push({ id, what, ok, detail });
		if (this.quiet) return;
		console.log(`${ok ? 'PASS' : 'FAIL'} ${id.padEnd(4)} ${what}`);
		if (detail) console.log(`       ${detail}`);
	}

	/** Run a row body, turning a thrown error into a FAIL rather than a crash:
	 *  a harness that dies on row 3 has not run rows 4 through 24. */
	async row(id: string, what: string, body: () => Promise<string> | string): Promise<void> {
		try {
			const detail = await body();
			this.record(id, what, true, detail);
		} catch (error) {
			this.record(id, what, false, (error as Error).message);
		}
	}
}

function must(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
}

/** Stable stringify: object key ORDER is an artifact of insertion, never part
 *  of what any row here is asserting. Comparing raw JSON.stringify output made
 *  the M2 census fail on the order two counters happened to be created in. */
function stable(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
	if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
	const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
		a < b ? -1 : 1,
	);
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
}

function eq(actual: unknown, expected: unknown, label: string): void {
	const a = stable(actual);
	const b = stable(expected);
	must(a === b, `${label}: got ${a}, want ${b}`);
}

/**
 * Strip comments and string literals so a source scan reads CODE, not prose.
 *
 * Both A4 and B1 first failed against files that are entirely correct: the
 * graph module's own doc comment says "Replaces edgeStyleString", and the
 * markerEnd comment says "never MarkerType.ArrowClosed". A row that a comment
 * explaining the rule can break is a row about spelling, not about behavior.
 */
export function codeOnly(source: string): string {
	let out = '';
	let inString: string | null = null;
	let inLine = false;
	let inBlock = false;
	for (let i = 0; i < source.length; i += 1) {
		const c = source[i];
		const next = source[i + 1];
		if (inLine) {
			if (c === '\n') {
				inLine = false;
				out += c;
			}
			continue;
		}
		if (inBlock) {
			if (c === '*' && next === '/') {
				inBlock = false;
				i += 1;
			}
			continue;
		}
		if (inString) {
			if (c === '\\') i += 1;
			else if (c === inString) {
				inString = null;
				out += c;
			}
			continue;
		}
		if (c === '/' && next === '/') {
			inLine = true;
			i += 1;
			continue;
		}
		if (c === '/' && next === '*') {
			inBlock = true;
			i += 1;
			continue;
		}
		if (c === '"' || c === "'" || c === '`') {
			inString = c;
			out += c;
			continue;
		}
		out += c;
	}
	return out;
}

// --------------------------------------------------------------- mermaid config

/**
 * Pull a config object literal out of a source file and evaluate it.
 *
 * A textual key-by-key diff was the alternative, and it would have compared the
 * two files' FORMATTING as much as their meaning: the Svelte side is an
 * argument to mermaid.initialize, the Next side a named const with a
 * `satisfies` clause, and both carry comments and trailing commas. Evaluating
 * gives real objects, so the diff is over values.
 *
 * The evaluated text is our own repository source, read from disk, never from
 * input — the same trust boundary every other row in this file works inside.
 */
export function extractConfigObject(source: string, anchor: string): Record<string, unknown> {
	const at = source.indexOf(anchor);
	must(at !== -1, `config anchor ${JSON.stringify(anchor)} not found`);
	const open = source.indexOf('{', at);
	must(open !== -1, `no object literal after ${JSON.stringify(anchor)}`);

	let depth = 0;
	let end = -1;
	let inString: string | null = null;
	let inLineComment = false;
	let inBlockComment = false;
	for (let i = open; i < source.length; i += 1) {
		const c = source[i];
		const next = source[i + 1];
		if (inLineComment) {
			if (c === '\n') inLineComment = false;
			continue;
		}
		if (inBlockComment) {
			if (c === '*' && next === '/') {
				inBlockComment = false;
				i += 1;
			}
			continue;
		}
		if (inString) {
			if (c === '\\') i += 1;
			else if (c === inString) inString = null;
			continue;
		}
		if (c === '/' && next === '/') {
			inLineComment = true;
			i += 1;
			continue;
		}
		if (c === '/' && next === '*') {
			inBlockComment = true;
			i += 1;
			continue;
		}
		if (c === '"' || c === "'" || c === '`') {
			inString = c;
			continue;
		}
		if (c === '{') depth += 1;
		else if (c === '}') {
			depth -= 1;
			if (depth === 0) {
				end = i;
				break;
			}
		}
	}
	must(end !== -1, 'unbalanced object literal');
	const literal = source.slice(open, end + 1);
	return new Function(`return (${literal});`)() as Record<string, unknown>;
}

/** Flatten to dotted keys so the diff names the exact leaf that moved. */
export function flatten(value: unknown, prefix = ''): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return { [prefix]: value };
	}
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		Object.assign(out, flatten(v, prefix ? `${prefix}.${k}` : k));
	}
	return out;
}

// ----------------------------------------------------------------- the corpus

export interface Fence {
	file: string;
	type: string;
	body: string;
}

export function collectMermaidFences(root: string, postsDir: string): Fence[] {
	const fences: Fence[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.name.endsWith('.md')) {
				const text = readFileSync(full, 'utf8');
				const re = /^```mermaid[^\n]*\n([\s\S]*?)^```/gm;
				let hit: RegExpExecArray | null;
				while ((hit = re.exec(text)) !== null) {
					const body = hit[1];
					const first = body.split('\n').find((l) => l.trim() !== '') ?? '';
					fences.push({ file: relative(root, full), type: first.trim().split(/\s+/)[0], body });
				}
			}
		}
	};
	walk(join(root, postsDir));
	return fences;
}

// --------------------------------------------------------------- build reading

/** Every `/_next/static/**.{js,css}` path the exported page names. Collected
 *  from the whole document rather than from `<script src>` alone: Next also
 *  names chunks inside its bootstrap payload, and a chunk named there is
 *  eagerly fetched just the same. */
export function referencedAssets(html: string): Set<string> {
	const out = new Set<string>();
	for (const hit of html.matchAll(/\/_next\/static\/[A-Za-z0-9._/-]*\.(?:js|css)/g)) {
		out.add(hit[0].split('/').pop() as string);
	}
	return out;
}

export function listChunks(buildDir: string): string[] {
	const dir = join(buildDir, '_next', 'static', 'chunks');
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	const walk = (d: string): void => {
		for (const entry of readdirSync(d, { withFileTypes: true })) {
			const full = join(d, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.name.endsWith('.js') || entry.name.endsWith('.css')) out.push(full);
		}
	};
	walk(dir);
	return out.sort();
}

/** React separates interpolated text nodes with `<!-- -->`. Strip them before
 *  matching rendered prose — see LANE_COUNTS. */
export function stripReactComments(html: string): string {
	return html.replace(/<!-- -->/g, '');
}

// ------------------------------------------------------------------ assertions

export async function runAssertions(options: C11Options = {}): Promise<number> {
	const root = resolve(options.root ?? process.cwd());
	const buildDir = resolve(root, options.buildDir ?? 'next/build');
	const baselineFile = resolve(
		root,
		options.baselineFile ?? 'verification/baseline/svelte-e23e808.json',
	);
	const ledgerFile = resolve(root, options.ledgerFile ?? 'verification/exception-ledger.json');
	const overrides = options.sourceOverrides ?? {};
	const laneCounts = options.laneCounts ?? LANE_COUNTS;
	const shellClaims = options.shellClaims ?? SHELL_CLAIMS;
	const divergences = options.mermaidDivergences ?? MERMAID_DIVERGENCES;
	const census = options.mermaidCensus ?? MERMAID_CENSUS;
	const scratchDir = resolve(root, options.scratchDir ?? 'tmp/c11-scratch');
	const falsifyDir = resolve(root, options.falsifyDir ?? 'tmp/c11-markerend');
	const r = new Runner(options.quiet ?? false);

	/** Read a repo file, honoring the controls' content overrides. */
	const read = (rel: string): string => {
		const override = overrides[rel];
		return readFileSync(override ? resolve(root, override) : resolve(root, rel), 'utf8');
	};
	const exists = (rel: string): boolean =>
		existsSync(overrides[rel] ? resolve(root, overrides[rel]) : resolve(root, rel));

	if (!existsSync(buildDir)) {
		console.error(`FATAL: ${relative(root, buildDir)} is missing. Run pnpm build:next first.`);
		return 2;
	}
	const pageFile = join(buildDir, 'system', '3b.html');
	const fixtureFile = join(buildDir, 'migration-fixture', 'mermaid.html');
	if (!existsSync(pageFile) || !existsSync(fixtureFile)) {
		console.error(
			`FATAL: the export is missing ${relative(buildDir, existsSync(pageFile) ? fixtureFile : pageFile)}. ` +
				'Rebuild; a route that silently failed to emit is not a passing run.',
		);
		return 2;
	}

	// ---------------------------------------------------------------- P group

	await r.row('P1', 'every Svelte role has a Next counterpart', () => {
		const missing: string[] = [];
		for (const role of PORT_ROLES) {
			if (!exists(role.svelte)) missing.push(`${role.role}: source ${role.svelte}`);
			if (!exists(role.next)) missing.push(`${role.role}: port ${role.next}`);
		}
		for (const add of PORT_ADDITIONS) if (!exists(add)) missing.push(`addition ${add}`);
		must(missing.length === 0, `absent: ${missing.join('; ')}`);
		return `${PORT_ROLES.length} roles mapped, ${PORT_ADDITIONS.length} required additions present`;
	});

	await r.row('P2', '@xyflow/react pinned exactly, transitive @xyflow/system recorded', () => {
		const pkg = JSON.parse(read('next/package.json')) as {
			dependencies?: Record<string, string>;
		};
		const spec = pkg.dependencies?.['@xyflow/react'];
		must(spec !== undefined, '@xyflow/react is not a dependency of next/package.json');
		must(
			spec === XYFLOW_REACT_PIN,
			`@xyflow/react is "${spec}", not the exact pin "${XYFLOW_REACT_PIN}". A caret lets @xyflow/system move underneath the port.`,
		);
		const lock = read('pnpm-lock.yaml');
		must(
			lock.includes(`'@xyflow/system@${XYFLOW_SYSTEM_TRANSITIVE}'`),
			`the lockfile does not resolve @xyflow/system@${XYFLOW_SYSTEM_TRANSITIVE}; the markerEnd types the B rows assert live in that package, not in @xyflow/react`,
		);
		return `@xyflow/react ${spec} over @xyflow/system ${XYFLOW_SYSTEM_TRANSITIVE}`;
	});

	await r.row('P3', 'the band node depends on @xyflow type-only', () => {
		const src = read('next/src/components/System3bBandNode.tsx');
		const imports = [...src.matchAll(/^import\s+(type\s+)?[^;]*from\s+'(@xyflow\/[^']+)';/gm)];
		must(imports.length > 0, 'no @xyflow import found at all');
		const value = imports.filter((m) => !m[1]);
		must(
			value.length === 0,
			`${value.length} VALUE import(s) from @xyflow: ${value.map((m) => m[0]).join(' | ')}. A value import drags the runtime into this chunk; the dependency here is NodeProps, which is erased.`,
		);
		return `${imports.length} @xyflow import(s), all type-only`;
	});

	await r.row(
		'P4',
		'the lazy boundary is a boundary: use client, ssr false, non-null loading',
		() => {
			const src = read('next/src/components/System3bGraph.tsx');
			must(/^'use client';/m.test(src), "the wrapper does not declare 'use client'");
			const call =
				/const\s+\w+\s*=\s*dynamic\(\s*\(\)\s*=>\s*import\('\.\/System3bFlow'\)\s*,\s*\{([\s\S]*?)\}\s*\)/m.exec(
					src,
				);
			must(call !== null, 'no module-scope dynamic(() => import(./System3bFlow), {...}) call');
			const body = (call as RegExpExecArray)[1];
			must(/ssr:\s*false/.test(body), 'the dynamic import does not set ssr: false');
			must(
				/loading:\s*\(\)\s*=>/.test(body),
				'the dynamic import has NO loading component. With ssr:false and no loading, next/dynamic wraps the subtree in its own <Suspense fallback={null}> and an outer Suspense cannot win — the static no-JS fallback silently disappears from the export, with no type error and no runtime error.',
			);
			const before = src.slice(0, (call as RegExpExecArray).index);
			const openFns = (before.match(/^export default function/gm) ?? []).length;
			must(
				openFns === 0,
				'dynamic() is called inside the component. A new lazy identity per render remounts the graph every time.',
			);
			return 'module-scope dynamic, ssr:false, loading present';
		},
	);

	await r.row(
		'P5',
		'provider, nodeTypes and the xyflow stylesheet are confined to the flow chunk',
		() => {
			const confined = ['ReactFlowProvider', 'nodeTypes', '@xyflow/react/dist/style.css'];
			const files = [
				...PORT_ROLES.map((p) => p.next),
				...PORT_ADDITIONS,
				'next/src/content/system-3b.tsx',
			].filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
			const leaks: string[] = [];
			for (const file of files) {
				if (file === 'next/src/components/System3bFlow.tsx' || !exists(file)) continue;
				const src = read(file);
				for (const token of confined)
					if (src.includes(token)) leaks.push(`${file} mentions ${token}`);
			}
			must(
				leaks.length === 0,
				`${leaks.join('; ')}. Any of these outside the flow component makes @xyflow a static import of the EAGER chunk, defeating the lazy boundary while every other row still passes.`,
			);
			const flow = read('next/src/components/System3bFlow.tsx');
			for (const token of confined)
				must(flow.includes(token), `System3bFlow.tsx does not carry ${token}`);
			return `all three confined to System3bFlow.tsx (${files.length - 1} other file(s) checked)`;
		},
	);

	// ---------------------------------------------------------------- A group

	await r.row('A1', 'edgeStyleObject returns a style OBJECT with stroke and width', () => {
		const style = edgeStyleObject('dependency', 3);
		must(typeof style === 'object' && style !== null, 'not an object');
		must(
			typeof style.stroke === 'string' && style.stroke !== '',
			`stroke is ${JSON.stringify(style.stroke)}`,
		);
		must(
			typeof style.strokeWidth === 'number',
			`strokeWidth is ${JSON.stringify(style.strokeWidth)}`,
		);
		must(
			!Object.values(style).some((v) => typeof v === 'string' && v.includes(':')),
			'a value still looks like a CSS declaration string; this replaced edgeStyleString and must not re-create it',
		);
		return `stroke ${style.stroke}, strokeWidth ${String(style.strokeWidth)}`;
	});

	await r.row('A2', 'dimEdges MERGES and preserves stroke and strokeWidth', () => {
		const edges: FlowEdge[] = [
			{
				id: 'a__b__0',
				source: 'a',
				target: 'b',
				animated: true,
				style: edgeStyleObject('dependency', 3),
				data: { kind: 'dependency', label: '' },
			} as FlowEdge,
		];
		const [dimmed] = dimEdges(edges, 'zzz');
		eq(dimmed.style?.opacity, 0.1, 'dimmed opacity');
		eq(dimmed.animated, false, 'dimmed animated');
		eq(dimmed.style?.stroke, edges[0].style?.stroke, 'dimmed stroke');
		eq(dimmed.style?.strokeWidth, edges[0].style?.strokeWidth, 'dimmed strokeWidth');
		must(
			Object.keys(dimmed.style ?? {}).length >= 3,
			`the dimmed style has ${Object.keys(dimmed.style ?? {}).length} key(s). Returning { opacity: 0.1 } alone is also an object, also type-correct, and also wrong.`,
		);
		return `${Object.keys(dimmed.style ?? {}).join(', ')}`;
	});

	await r.row('A3', 'dimEdges leaves incident edges untouched', () => {
		const base: FlowEdge = {
			id: 'a__b__0',
			source: 'a',
			target: 'b',
			animated: true,
			style: edgeStyleObject('dependency', 1),
			data: { kind: 'dependency', label: '' },
		} as FlowEdge;
		for (const hovered of ['a', 'b', null]) {
			const [out] = dimEdges([base], hovered);
			must(out === base, `hovering ${JSON.stringify(hovered)} rewrote an incident edge`);
		}
		return 'source, target and no-hover all return the same object identity';
	});

	await r.row('A4', 'no style STRING survives in the ported graph', () => {
		const raw = read('next/src/graph/system3b-graph.ts');
		const src = codeOnly(raw);
		must(
			!/edgeStyleString/.test(src),
			'edgeStyleString is still referenced in CODE (its mention in the doc comment is fine and expected)',
		);
		must(
			!/opacity:\s*0\.1['"`;]/.test(src),
			'a style DECLARATION string carrying opacity is still built — the exact regression the object merge replaces',
		);
		must(
			raw.includes('edgeStyleString'),
			'the doc comment no longer records what edgeStyleObject replaced; the next reader needs that name to find the old behavior',
		);
		return 'no edgeStyleString in code, no style-string concatenation, the rename still documented';
	});

	// ---------------------------------------------------------------- B group

	const snapshot = JSON.parse(read('src/lib/data/system-snapshot.json')) as {
		nodes: SnapNode[];
		edges: SnapEdge[];
		layers: SnapLayer[];
	};

	await r.row('B1', "markerEnd.type is the plain literal 'arrowclosed'", () => {
		const model = buildOverview(snapshot.nodes, snapshot.edges, snapshot.layers);
		must(model.edges.length > 0, 'the overview produced no edges');
		for (const edge of model.edges) {
			eq(
				(edge.markerEnd as { type?: string } | undefined)?.type,
				'arrowclosed',
				`edge ${edge.id} markerEnd.type`,
			);
		}
		const sources = [
			codeOnly(read('next/src/graph/system3b-graph.ts')),
			codeOnly(read('next/src/components/System3bFlow.tsx')),
		];
		for (const src of sources) {
			must(
				!/MarkerType\./.test(src),
				"MarkerType.ArrowClosed is over-prescription: EdgeMarker's type is a `${MarkerType}` template-literal arm, which accepts the plain string",
			);
		}
		return `${model.edges.length} edges, all 'arrowclosed', zero MarkerType. references`;
	});

	await r.row('B2', 'the assignability proof binds FlowEdge[] to @xyflow Edge[]', () => {
		const src = read('next/src/graph/system3b-graph.types-check.ts');
		const bindings = [...src.matchAll(/:\s*Edge\[\]\s*=/g)];
		must(
			bindings.length >= 2,
			`only ${bindings.length} Edge[] binding(s); the proof needs both the overview and the drilldown model, since they build markerEnd separately`,
		);
		must(
			/from\s+'@xyflow\/react'/.test(src),
			'the proof does not import Edge from @xyflow/react, so it proves assignability to nothing',
		);
		return `${bindings.length} Edge[] bindings against the real @xyflow/react types`;
	});

	if (options.skipTypecheck) {
		r.record(
			'B3',
			'widening markerEnd.type is SHOWN to fail',
			true,
			'skipped by option (a control already drives tsc)',
		);
	} else {
		await r.row(
			'B3',
			'widening markerEnd.type is SHOWN to fail, with the error count asserted',
			() => {
				const result = falsifyMarkerEnd(root, falsifyDir, read);
				must(
					result.errors === 2,
					`widening markerEnd.type to string produced ${result.errors} error(s), expected 2 (one per Edge[] binding). ${result.errors === 0 ? 'ZERO means the guard proves nothing: it has never been shown to fail.' : 'A different count means the proof has drifted from what it claims to cover.'}`,
				);
				must(
					result.baselineErrors === 0,
					`the UNWIDENED scratch copy already reports ${result.baselineErrors} error(s), so the widened run's errors cannot be attributed to the widening`,
				);
				return `unwidened 0 errors, widened exactly 2 (${result.codes.join(', ')})`;
			},
		);
	}

	// ---------------------------------------------------------------- C group

	if (options.skipTypecheck) {
		r.record(
			'C1',
			'tsc is clean AND the ported files are in the program',
			true,
			'skipped by option',
		);
	} else {
		await r.row('C1', 'tsc is clean AND the ported files are in the program', () => {
			const listed = typecheckWithFileList(root);
			must(
				listed.exit === 0,
				`tsc exited ${listed.exit}:\n${listed.output.split('\n').slice(0, 12).join('\n')}`,
			);
			const want = [...PORT_ROLES.map((p) => p.next), ...PORT_ADDITIONS].filter(
				(f) => !f.endsWith('.svelte'),
			);
			const absent = want.filter((f) => !listed.files.has(resolve(root, f)));
			must(
				absent.length === 0,
				`tsc exited 0 but never READ ${absent.join(', ')}. A widened exclude keeps the typecheck green while checking nothing, which is why this row asserts program membership and not just the exit code.`,
			);
			return `${listed.files.size} files in the program, all ${want.length} ported files among them`;
		});
	}

	// ---------------------------------------------------------------- H group

	const pageHtml = readFileSync(pageFile, 'utf8');

	await r.row('H1', 'the exported page contains ZERO flow elements', () => {
		const hits = pageHtml.split(FLOW_SENTINEL).length - 1;
		eq(hits, 0, `${FLOW_SENTINEL} occurrences in system/3b.html`);
		return 'the prerender bails to CSR, so the export holds the Suspense fallback only';
	});

	await r.row(
		'H2',
		'the exported page carries the localized no-JS fallback with its lane counts',
		() => {
			must(pageHtml.includes(FALLBACK_SENTINEL), `${FALLBACK_SENTINEL} is absent from the export`);
			const stripped = stripReactComments(pageHtml);
			const counts = [...stripped.matchAll(/(\d+)\s*nodes/g)].map((m) => Number(m[1]));
			eq(counts, laneCounts, 'lane counts in the prerendered fallback');
			return `${FALLBACK_SENTINEL} present, lanes ${counts.join(',')}`;
		},
	);

	const referenced = referencedAssets(pageHtml);
	const chunks = listChunks(buildDir);

	await r.row('H3', 'flow code lives ONLY in chunks the page does not reference', () => {
		must(chunks.length > 0, 'no chunks found under _next/static/chunks');
		const carrying = chunks.filter((f) => readFileSync(f, 'utf8').includes(FLOW_SENTINEL));
		must(
			carrying.length > 0,
			`no chunk contains ${FLOW_SENTINEL}; the flow code is not in this build at all`,
		);
		const eager = carrying.filter((f) => referenced.has(f.split('/').pop() as string));
		must(
			eager.length === 0,
			`${eager.length} EAGER chunk(s) carry ${FLOW_SENTINEL}: ${eager.map((f) => f.split('/').pop()).join(', ')}. The lazy boundary is defeated — this goes red the moment the dynamic import becomes a static one.`,
		);
		return `${carrying.length} chunk(s) carry flow code, ${referenced.size} referenced asset(s), overlap 0`;
	});

	await r.row('H4', 'the failure reporter ships in an EAGER chunk', () => {
		const carrying = chunks.filter((f) => readFileSync(f, 'utf8').includes(REPORTER_SENTINEL));
		must(carrying.length > 0, 'the boundary reporter is in no chunk at all');
		const eager = carrying.filter((f) => referenced.has(f.split('/').pop() as string));
		must(
			eager.length > 0,
			'the reporter exists only in chunks the page never loads. A reporter that arrives with the chunk it reports on cannot report that chunk failing to arrive.',
		);
		return `${eager.length} eager chunk(s) carry the boundary reporter`;
	});

	// ---------------------------------------------------------------- N group

	await r.row(
		'N1',
		'every ledgered shell approval names the keys that actually differ',
		async () => {
			const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as Baseline;
			const candidate = await capture(buildDir);
			const ledger = loadLedger(ledgerFile);
			const shellEntries = ledger.filter((e) => e.field === 'shell');
			must(shellEntries.length > 0, 'the ledger holds no shell approvals at all');
			const problems: string[] = [];
			for (const entry of shellEntries) {
				const claim = shellClaims[entry.url];
				if (!claim) {
					problems.push(
						`${entry.url} has a shell approval but no recomputed claim in SHELL_CLAIMS`,
					);
					continue;
				}
				const base = baseline.pages[entry.url];
				const cand = candidate.pages[entry.url];
				if (!base || !cand) {
					problems.push(`${entry.url} is not an intersected page, so its shell is never compared`);
					continue;
				}
				// NORMALIZED, exactly as compare() sees it. Reading the raw shells here
				// is the mistake this row exists to make impossible.
				const a = normalizeShell(entry.url, base.shell);
				const b = normalizeShell(entry.url, cand.shell);
				const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
					.filter((k) => a[k] !== b[k])
					.sort();
				const want = [...claim].sort();
				if (JSON.stringify(keys) !== JSON.stringify(want)) {
					problems.push(
						`${entry.url} differs on [${keys.join(', ')}], its approval claims [${want.join(', ')}]`,
					);
				}
			}
			must(
				problems.length === 0,
				`${problems.join('; ')}. Measure through normalizeShell, which compare() applies to BOTH sides before diffing — the raw shells differ in classes the comparator absorbs.`,
			);
			const total = Object.values(shellClaims).reduce((n, keys) => n + keys.length, 0);
			return `${shellEntries.length} shell approval(s), ${total} claimed key difference(s), all recomputed`;
		},
	);

	// ---------------------------------------------------------------- S group

	await r.row('S6a', 'positive half: the real snapshot falls back on NOTHING', () => {
		const model = buildOverview(snapshot.nodes, snapshot.edges, snapshot.layers);
		must(
			!hasFallback(model.fallbacks),
			`the shipped data already reports fallbacks (${JSON.stringify(model.fallbacks)}), so S6b's forced failure would prove nothing`,
		);
		return `${model.nodes.length} nodes, ${model.edges.length} edges, empty fallback report`;
	});

	await r.row('S6b', 'an unmapped kind still RENDERS and says so', () => {
		// The two halves are induced at DIFFERENT altitudes on purpose. The
		// overview renders subsystem chips only, so rewriting a node's kind there
		// does not surface an unmapped kind -- it removes the chip, because
		// subsystemNodes() selects on kind === 'subsystem'. The first version of
		// this row did exactly that and failed for a reason that had nothing to do
		// with the fallback report. Node kinds are only visible at the drilldown
		// altitude, so that is where the node half belongs.
		const subKey = subsystemKey(snapshot.nodes);
		const cleanDrill = buildDrilldown(snapshot.nodes, snapshot.edges, snapshot.layers, subKey);
		const mutatedNodes = snapshot.nodes.map((n) =>
			n.subsystem === subKey && n.kind !== 'subsystem' ? { ...n, kind: 'no-such-kind' } : n,
		);
		must(
			mutatedNodes.some((n) => n.kind === 'no-such-kind'),
			`no leaf node under subsystem ${subKey} to rewrite; the mutation matched nothing, which makes the failure a coincidence rather than an induction`,
		);
		const drill = buildDrilldown(mutatedNodes, snapshot.edges, snapshot.layers, subKey);
		must(
			drill.nodes.length === cleanDrill.nodes.length,
			`the unmapped node kind removed nodes (${cleanDrill.nodes.length} -> ${drill.nodes.length}); it must still render`,
		);
		must(
			drill.fallbacks.kinds.includes('no-such-kind'),
			'the unmapped node kind was absorbed by KIND_FALLBACK and reported NOTHING — a fallback indistinguishable from a mapped kind is exactly what S6 exists to rule out',
		);

		// Every edge, not the first one. The overview AGGREGATES raw edges into
		// subsystem super-edges, so a single rewritten edge can be folded into a
		// super-edge that takes its kind from a different member, or dropped
		// entirely when both endpoints share a subsystem -- and the mutation then
		// matches nothing while looking like a real induction. A mutation that
		// changes nothing turns a defect control into a coincidence.
		const clean = buildOverview(snapshot.nodes, snapshot.edges, snapshot.layers);
		must(
			clean.edges.length > 0,
			'the overview produced no edges, so no edge-kind mutation could surface',
		);
		const mutatedEdges = snapshot.edges.map((e) => ({ ...e, kind: 'no-such-edge-kind' }));
		const model = buildOverview(snapshot.nodes, mutatedEdges, snapshot.layers);
		must(
			model.edges.length === clean.edges.length,
			`the unmapped edge kind removed edges (${clean.edges.length} -> ${model.edges.length})`,
		);
		must(
			hasFallback(model.fallbacks) && model.fallbacks.edgeKinds.includes('no-such-edge-kind'),
			'the unmapped edge kind was absorbed by EDGE_FALLBACK and reported nothing',
		);
		return `drilldown reports ${JSON.stringify(drill.fallbacks.kinds)}, overview reports ${JSON.stringify(model.fallbacks.edgeKinds)}`;
	});

	await r.row('S7a', 'positive half: dagre actually reorders', () => {
		const model = buildOverview(snapshot.nodes, snapshot.edges, snapshot.layers);
		const insertion = buildOverview(snapshot.nodes, snapshot.edges, snapshot.layers, {
			layout: () => {
				throw new Error('forced');
			},
		});
		must(!model.degraded, `the real build is already degraded: ${String(model.degradedReason)}`);
		const withDagre = model.nodes.map((n) => `${n.id}@${Math.round(n.position.x)}`).join('|');
		const withoutDagre = insertion.nodes
			.map((n) => `${n.id}@${Math.round(n.position.x)}`)
			.join('|');
		must(
			withDagre !== withoutDagre,
			'dagre produced the same placement as insertion order, so "dagre ran" is unfalsifiable here',
		);
		return 'dagre placement differs from the insertion-order fallback';
	});

	await r.row('S7b', 'a thrown layout degrades LOUDLY and still renders', () => {
		const boom = (_g: DagreGraph): void => {
			throw new Error('dagre exploded');
		};
		const model = buildOverview(snapshot.nodes, snapshot.edges, snapshot.layers, { layout: boom });
		const clean = buildOverview(snapshot.nodes, snapshot.edges, snapshot.layers);
		must(model.nodes.length === clean.nodes.length, 'the layout failure dropped nodes');
		must(
			model.degraded === true,
			'the layout threw and the model does not report degraded. The Svelte original carried the comment "dagre failure -> fall back to insertion order (still renders)", which is precisely why nothing ever caught it.',
		);
		must(
			typeof model.degradedReason === 'string' && model.degradedReason !== '',
			'degraded is set but carries no reason',
		);
		const drill = buildDrilldown(
			snapshot.nodes,
			snapshot.edges,
			snapshot.layers,
			subsystemKey(snapshot.nodes),
			{
				layout: boom,
			},
		);
		must(drill.degraded === true, 'the drilldown altitude absorbs the same failure silently');
		return `both altitudes report degraded: ${model.degradedReason}`;
	});

	await r.row('S8', 'a destroyed lazy chunk leaves the page and its reporter intact', () => {
		const copy = join(scratchDir, 'build-s8');
		rmSync(copy, { recursive: true, force: true });
		mkdirSync(scratchDir, { recursive: true });
		cpSync(buildDir, copy, { recursive: true, dereference: true });
		const copiedChunks = listChunks(copy).filter((f) =>
			readFileSync(f, 'utf8').includes(FLOW_SENTINEL),
		);
		must(copiedChunks.length > 0, 'no flow chunk to destroy in the copy');
		for (const chunk of copiedChunks) {
			// Truncate rather than delete: a missing file is a 404, a truncated one
			// is a chunk that loads and then fails to evaluate — the harder case.
			cpSync(join(copy, 'index.html'), chunk, { dereference: true });
		}
		const copiedPage = readFileSync(join(copy, 'system', '3b.html'), 'utf8');
		must(
			copiedPage.includes(FALLBACK_SENTINEL),
			'destroying the lazy chunk changed the prerendered page, which means the fallback was inside it',
		);
		const stillReports = listChunks(copy).some((f) => {
			if (readFileSync(f, 'utf8').includes(FLOW_SENTINEL)) return false;
			return (
				referenced.has(f.split('/').pop() as string) &&
				readFileSync(f, 'utf8').includes(REPORTER_SENTINEL)
			);
		});
		must(
			stillReports,
			'with the flow chunks destroyed, no surviving EAGER chunk carries the reporter. The failure would be a blank hole: indistinguishable from still-loading and from never-existed.',
		);
		rmSync(copy, { recursive: true, force: true });
		return `${copiedChunks.length} flow chunk(s) destroyed; fallback and reporter both survive`;
	});

	await r.row('S9a', 'the fixture route exports both fences as pending, neither as failed', () => {
		const html = readFileSync(fixtureFile, 'utf8');
		const pending = html.split('data-mermaid=""').length - 1;
		const failed = html.split('data-mermaid-error').length - 1;
		eq(pending, 2, 'data-mermaid blocks in the export');
		eq(
			failed,
			0,
			'data-mermaid-error blocks in the export (the server never attempts a render, so neither fence can be failed yet)',
		);
		return '2 pending diagrams, 0 failed, exactly as a server render must leave them';
	});

	await r.row('S9b', 'the rendered states are DISJOINT by attribute', () => {
		const ok = mermaidView({ code: 'flowchart LR\n A --> B', error: null }) as {
			props: Record<string, unknown>;
		};
		const bad = mermaidView({ code: 'flowchart LR\n A --> B', error: 'boom' }) as {
			props: Record<string, unknown>;
		};
		must('data-mermaid' in ok.props, 'the healthy view carries no data-mermaid marker');
		must(!('data-mermaid-error' in ok.props), 'the healthy view also carries the error marker');
		must('data-mermaid-error' in bad.props, 'the failed view carries no data-mermaid-error marker');
		must(
			!('data-mermaid' in bad.props),
			'the failed view ALSO carries data-mermaid, so a diagram the renderer rejected is indistinguishable from one it has not tried yet',
		);
		return 'data-mermaid and data-mermaid-error never co-occur';
	});

	await r.row(
		'S9c',
		'the mermaid error path is reachable, and the healthy path is not',
		async () => {
			const failures: string[] = [];
			const svgs: string[] = [];
			await renderMermaid({
				code: 'notADiagramType XYZ',
				id: 'probe',
				loadMermaid: async () =>
					({
						initialize: () => {},
						render: () => {
							throw new Error('No diagram type detected matching given configuration');
						},
					}) as never,
				setSvg: (s) => svgs.push(s),
				setError: (m) => failures.push(m),
			});
			eq(svgs.length, 0, 'setSvg calls on a rejected diagram');
			eq(failures.length, 1, 'setError calls on a rejected diagram');
			must(
				failures[0].includes('No diagram type detected'),
				`the error message was swallowed and replaced: ${failures[0]}`,
			);
			const okSvgs: string[] = [];
			const okErrors: string[] = [];
			await renderMermaid({
				code: 'flowchart LR\n A --> B',
				id: 'probe2',
				loadMermaid: async () =>
					({
						initialize: () => {},
						render: async () => ({ svg: '<svg id="ok"/>' }),
					}) as never,
				setSvg: (s) => okSvgs.push(s),
				setError: (m) => okErrors.push(m),
			});
			eq(okErrors.length, 0, 'setError calls on a healthy diagram');
			eq(okSvgs, ['<svg id="ok"/>'], 'setSvg payload on a healthy diagram');
			return 'a throwing renderer reports; a working one does not';
		},
	);

	// ---------------------------------------------------------------- M group

	await r.row('M1', 'the mermaid config matches the Svelte source key by key', () => {
		const svelteConfig = extractConfigObject(
			read('src/lib/components/Mermaid.svelte'),
			'mermaid.initialize(',
		);
		const nextConfig = extractConfigObject(
			read('next/src/components/Mermaid.tsx'),
			'const MERMAID_CONFIG =',
		);
		const a = flatten(svelteConfig);
		const b = flatten(nextConfig);
		const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
		const differing = keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
		const unexpected = differing.filter((k) => !(k in divergences));
		must(
			unexpected.length === 0,
			`${unexpected.length} UNDECLARED divergence(s): ${unexpected
				.map((k) => `${k} (svelte ${JSON.stringify(a[k])}, next ${JSON.stringify(b[k])})`)
				.join(
					'; ',
				)}. These are invisible to the comparator — the SVG is client-rendered and the export holds only the fence source — so nothing else in the harness would ever see them.`,
		);
		const absent = Object.keys(divergences).filter((k) => !differing.includes(k));
		must(
			absent.length === 0,
			`the allowlist declares ${absent.join(', ')} as a divergence, but the two configs AGREE there. An allowlist entry that matches nothing is how an allowlist stops describing reality.`,
		);
		for (const key of differing) {
			eq(a[key], divergences[key].svelte, `${key} on the Svelte side`);
			eq(b[key], divergences[key].next, `${key} on the Next side`);
		}
		return `${keys.length} config keys compared, ${differing.length} declared divergence(s): ${differing.join(', ')}`;
	});

	await r.row('M2', 'the corpus still supports the securityLevel divergence', () => {
		const fences = collectMermaidFences(root, 'src/content/posts');
		const byType: Record<string, number> = {};
		for (const f of fences) byType[f.type] = (byType[f.type] ?? 0) + 1;
		const withBr = fences.filter((f) => /<br\s*\/?>/i.test(f.body)).length;

		const risky: string[] = [];
		for (const fence of fences) {
			for (const probe of RISKY_MERMAID) {
				if (probe.re.test(fence.body)) risky.push(`${probe.label} in ${fence.file}`);
			}
		}
		must(
			risky.length === 0,
			`${risky.length} loose-only feature(s) now in the corpus: ${risky.slice(0, 5).join('; ')}. 'strict' is only free while the corpus uses none of them; this is the check that turns that argument from prose into something that expires.`,
		);
		eq(fences.length, census.fences, 'mermaid fences in the corpus');
		eq(byType, census.byType, 'fence type census');
		eq(withBr, census.fencesWithBr, 'fences containing <br>');
		return `${fences.length} fences (${Object.entries(byType)
			.map(([k, v]) => `${k} ${v}`)
			.join(', ')}), ${withBr} with <br>, 0 loose-only features`;
	});

	// ------------------------------------------------------------------ result

	const failed = r.rows.filter((row) => !row.ok);
	if (!options.quiet) {
		console.log('');
		console.log(
			`C11: ${r.rows.length - failed.length}/${r.rows.length} rows pass across ` +
				'P port roll-call, A style+hover, B markerEnd typing, C typecheck, H hydration, ' +
				'N shell accounting, S scenarios S6-S9, M mermaid parity',
		);
		console.log(
			'  NOT CHECKED here: on-screen hover dimming, hydrated element counts in a real ' +
				'browser, and screenshots (AC7/AC9) — those need the flow probe, not this harness.',
		);
	}
	return failed.length === 0 ? 0 : 1;
}

// ------------------------------------------------------------------- typecheck

export interface TypecheckResult {
	exit: number;
	output: string;
	files: Set<string>;
}

/** `--listFiles` is the point, not `--noEmit`. A widened `exclude` makes tsc
 *  exit 0 while reading none of the ported files, and only the file list can
 *  tell those two greens apart. */
export function typecheckWithFileList(
	root: string,
	project = 'next/tsconfig.json',
): TypecheckResult {
	let output: string;
	let exit = 0;
	try {
		output = execFileSync(
			'node',
			[
				join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
				'--noEmit',
				'--listFiles',
				'-p',
				join(root, project),
			],
			{ cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
		);
	} catch (error) {
		const e = error as { status?: number; stdout?: string; stderr?: string };
		exit = e.status ?? 1;
		output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
	}
	const files = new Set<string>();
	for (const line of output.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.startsWith('/') && /\.(ts|tsx|d\.ts)$/.test(trimmed)) files.add(trimmed);
	}
	return { exit, output, files };
}

// ---------------------------------------------------------------- falsification

export interface FalsifyResult {
	baselineErrors: number;
	errors: number;
	codes: string[];
}

/**
 * Show the B-group guard failing, and COUNT the failures.
 *
 * A guard never shown to fail proves nothing, and "it goes red" is not the same
 * claim as "it goes red in both places". The two `Edge[]` bindings in the
 * types-check file cover the overview and the drilldown separately because each
 * builds its own markerEnd; if widening produced one error instead of two, one
 * of those bindings would have stopped covering anything.
 *
 * The scratch copy holds only the two files plus a tsconfig, with node_modules
 * symlinked to `next/`'s so `@xyflow/react` and `dagre` resolve. Copying the
 * whole app to change one type would cost a full program per run.
 */
export function falsifyMarkerEnd(
	root: string,
	scratchDir: string,
	read: (rel: string) => string,
): FalsifyResult {
	// The scratch program must be CLEAN before the widening, or the widened
	// count means nothing. That forces the layout: `system-snapshot.ts` reaches
	// the shared JSON with `../../../`, so its scratch copy has to sit exactly
	// three levels below the repository root, and the graph files sit beside it
	// the same way they do in `next/src/`. The first version of this proof put
	// both files flat in one directory, the snapshot import failed to resolve,
	// and the widened run reported three errors instead of two -- two real ones
	// and one artifact of the scratch layout.
	const depth = relative(root, scratchDir).split('/').filter(Boolean);
	must(
		depth.length === 2,
		`the scratch root must be exactly two segments below the repo root so the snapshot import resolves; got ${depth.join('/')} (${depth.length} segment(s))`,
	);
	rmSync(scratchDir, { recursive: true, force: true });
	mkdirSync(join(scratchDir, 'graph'), { recursive: true });
	mkdirSync(join(scratchDir, 'data'), { recursive: true });
	try {
		const nodeModules = join(scratchDir, 'node_modules');
		if (!existsSync(nodeModules))
			symlinkSync(join(root, 'next', 'node_modules'), nodeModules, 'dir');

		const graphFile = join(scratchDir, 'graph', 'system3b-graph.ts');
		const graph = read('next/src/graph/system3b-graph.ts');
		writeFileSync(
			join(scratchDir, 'graph', 'system3b-graph.types-check.ts'),
			read('next/src/graph/system3b-graph.types-check.ts'),
		);
		writeFileSync(
			join(scratchDir, 'data', 'system-snapshot.ts'),
			read('next/src/data/system-snapshot.ts'),
		);

		const tsconfig = JSON.parse(read('next/tsconfig.json')) as {
			compilerOptions: Record<string, unknown>;
		};
		delete tsconfig.compilerOptions.plugins;
		delete tsconfig.compilerOptions.incremental;
		delete tsconfig.compilerOptions.paths;
		writeFileSync(
			join(scratchDir, 'tsconfig.json'),
			JSON.stringify(
				{
					compilerOptions: tsconfig.compilerOptions,
					files: ['./graph/system3b-graph.ts', './graph/system3b-graph.types-check.ts'],
				},
				null,
				'\t',
			),
		);

		writeFileSync(graphFile, graph);
		const before = runScratchTsc(root, scratchDir);

		const widened = graph.replace(
			/markerEnd\?: \{ type: 'arrowclosed'/,
			'markerEnd?: { type: string',
		);
		must(
			widened !== graph,
			'could not widen markerEnd.type -- the declaration this proof targets has moved, so the mutation changed nothing and a green result would be a coincidence',
		);
		writeFileSync(graphFile, widened);
		const after = runScratchTsc(root, scratchDir);

		return { baselineErrors: before.count, errors: after.count, codes: after.codes };
	} finally {
		rmSync(scratchDir, { recursive: true, force: true });
	}
}

function runScratchTsc(root: string, dir: string): { count: number; codes: string[] } {
	let output: string;
	try {
		output = execFileSync(
			'node',
			[
				join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
				'--noEmit',
				'-p',
				join(dir, 'tsconfig.json'),
			],
			{ cwd: dir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
		);
	} catch (error) {
		const e = error as { stdout?: string; stderr?: string };
		output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
	}
	const codes = [...output.matchAll(/error (TS\d+):/g)].map((m) => m[1]);
	return { count: codes.length, codes: [...new Set(codes)] };
}

/** A subsystem key with real members, so the drilldown altitude in S7b has
 *  something to lay out. Keyed on `subsystem`, which is what memberNodesOf
 *  filters on — the subsystem NODE's id is a different string. */
function subsystemKey(nodes: SnapNode[]): string {
	const counts = new Map<string, number>();
	for (const n of nodes) {
		if (n.subsystem) counts.set(n.subsystem, (counts.get(n.subsystem) ?? 0) + 1);
	}
	const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
	must(best !== undefined, 'the snapshot holds no node carrying a subsystem key');
	return best[0];
}

// -------------------------------------------------------------------- the CLI

if (process.argv[1] && process.argv[1].endsWith('assert-c11-library-ports.ts')) {
	runAssertions()
		.then((code) => process.exit(code))
		.catch((error: unknown) => {
			console.error(`FATAL: ${(error as Error).stack ?? String(error)}`);
			process.exit(2);
		});
}
