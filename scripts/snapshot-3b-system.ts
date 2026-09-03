#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
/**
 * scripts/snapshot-3b-system.ts — Sanitizing generator for the public /system/3b hub.
 *
 * READ-ONLY on the 3B repo. Projects a SANITIZED public subset of the 3B
 * architecture registry (model.json) into src/lib/data/system-snapshot.json,
 * consumed at build time by the prerendered /system/3b route.
 *
 * Privacy is the central concern: model.json interleaves public architecture
 * with private telemetry and filesystem paths, so this generator is the single
 * sanitizing chokepoint. It NEVER emits: model.json `narrative`, any flow step
 * action, raw flow.name, blog_post_angle, the private store/doc nodes, or any
 * filesystem path.
 *
 * Modes:
 *   (build, default) read 3B -> sanitize -> self-assert -> write snapshot.
 *   --check          read existing snapshot -> assert (privacy grep + schema +
 *                    graph integrity). CI runs this; it needs NO 3B access.
 *
 * Plan + decisions (D1-D8, post-REVISE): projects/3b/actives/3b-system-hub/plan.md
 */
import { walk } from 'https://deno.land/std@0.220.0/fs/walk.ts';
import { ensureDir } from 'https://deno.land/std@0.220.0/fs/ensure_dir.ts';
import { dirname, fromFileUrl, join, resolve } from 'https://deno.land/std@0.220.0/path/mod.ts';

// ---------- paths ----------
// --check needs NO env / 3B access — only BLOG_ROOT + OUT, derived from this
// file's own location (import.meta.url) — so CI can validate the committed
// snapshot without the 3B repo present. 3B paths are resolved lazily in build().
const BLOG_ROOT = resolve(dirname(fromFileUrl(import.meta.url)), '..');
const POSTS_EN = join(BLOG_ROOT, 'src', 'content', 'posts', 'en');
const OUT = join(BLOG_ROOT, 'src', 'lib', 'data', 'system-snapshot.json');
let THREEB = ''; // set in build(); read by the get-privacy helpers (build path only)

// ---------- privacy: node selection ----------
// 17 verified private store/doc/gate nodes — always dropped.
const DENY_NODE_IDS = new Set([
	'buffer',
	'friction-log',
	'friction-log-archive',
	'config-evolution',
	'journals-store',
	'active-status',
	'actives-store',
	'worktrees',
	'gate-hitl-log',
	'audit-streams',
	'repos-map',
	'command-policy',
	'claude-settings',
	'codex-rules',
	'twin-registry',
	'blog-target',
	'blog-sync-script',
]);
// store/doc DEFAULT-DENY: only these ids are public. Any store/doc node NOT
// listed here is dropped — so a future private store added to model.json is
// excluded by default rather than leaking.
const PUBLIC_STORE_DOC_IDS = new Set([
	'agents-dir',
	'rules-dir',
	'rules-index',
	'skills-dir',
	'claude-back-symlinks',
	'knowledge-store',
	'knowledge-index',
	'tmp-intake',
	'decisions-store',
	'graphify-out',
	'yaml-schema',
	'routing-field-schema',
	'change-discipline',
	'tier-model-rule',
	'intent-resolution',
	'information-layer-rule',
	'skill-caps-schema',
	'kfm-table',
	'hitl-rule',
	'concurrency-rule',
	'claude-template',
	'agents-md',
	'gemini-md',
	'codex-adapters',
	'agy-skill-manifest',
	'mcp-config',
	'model-routing-rule',
	'runtime-env-rule',
	'knowledge-categories',
]);
// Private repo identifiers (specific names; avoids English-word false positives).
const PRIVATE_REPO_RE = /\b(moba|crucio)\b/i;

// ---------- curated, path-free, telemetry-free public content ----------
const SUBSYSTEM_INFO: Record<string, { one_liner: string; public_safe: boolean }> = {
	rules: {
		one_liner: 'Frontmatter-gated rule files decide what loads — always-on vs lazy — per agent.',
		public_safe: true,
	},
	skills: {
		one_liner:
			'Markdown-defined skills, signal-routed for Claude and mirrored to the other agents.',
		public_safe: true,
	},
	'sot-sync': {
		one_liner:
			'One canonical config store; a generator projects every edit into each agent profile.',
		public_safe: true,
	},
	knowledge: {
		one_liner:
			'An atomic, forward-linked Zettelkasten knowledge base — backlinks computed, never stored.',
		public_safe: false,
	},
	'info-lifecycle': {
		one_liner: 'A folder-as-destiny pipeline that refines content through progressive layers.',
		public_safe: true,
	},
	'journals-wrap': {
		one_liner:
			'A session engine: buffer to wrap to daily journal to knowledge, with clean-slate rollups.',
		public_safe: false,
	},
	'projects-tasks': {
		one_liner: 'Task setup gates work into isolated worktrees with explicit ownership and locks.',
		public_safe: false,
	},
	'governance-hitl': {
		one_liner:
			'A three-gate human-in-the-loop ladder governing every architecture-changing action.',
		public_safe: true,
	},
	'decisions-adr': {
		one_liner: 'An immutable ADR registry plus a per-folder decision-doc convention.',
		public_safe: true,
	},
	friction: {
		one_liner:
			'Captured friction accumulates into scored patterns and graduates into governed fixes.',
		public_safe: false,
	},
	'tooling-mcp': {
		one_liner:
			'A layered code-intelligence and doc-ingestion stack, each layer owning one waste vector.',
		public_safe: true,
	},
};
// Flows emit ONLY {id, display_label} — raw flow.name/steps/blog_post_angle leak.
const FLOW_LABELS: Record<string, string> = {
	'rule-edit-to-three-agents': 'One rule edit reaches three agents',
	'knowledge-graduation': 'How a session becomes durable knowledge',
	'friction-self-improvement': 'The harness improves itself',
	'task-starter-to-merge': 'From task setup to a merged change',
	'command-policy-to-runtimes': 'One permission policy, every runtime',
	'gate-b-self-reinforce': 'The governance gate guards itself',
	'skill-three-transports': 'One skill, three transports',
	'privacy-single-source': 'One privacy rule gates every index',
};

// ---------- privacy grep (final net; build self-assert + --check) ----------
const DENY_PATTERNS: { re: RegExp; name: string }[] = [
	{ re: /\/Users\//, name: 'absolute /Users path' },
	{ re: /dev\/personal\/3b/, name: '3B repo path' },
	{ re: /\.(claude|codex|gemini)\//, name: 'agent home/dir path' },
	{ re: PRIVATE_REPO_RE, name: 'private repo name (moba/crucio)' },
	{ re: /journals\//, name: 'journals path' },
	{ re: /(\.agents\/)?buffer\.md/, name: 'buffer path' },
	{ re: /friction-log/, name: 'friction log' },
	{ re: /gate-hitl-log/, name: 'gate HITL log' },
	{ re: /ACTIVE-STATUS/, name: 'active-status dashboard' },
	{ re: /DOUBLE_CONFIRM/, name: 'audit telemetry' },
	{ re: /REPOS\.md/, name: 'connected-repos inventory' },
	{ re: /\b\d+%/, name: 'numeric percentage telemetry' },
	{ re: /\b\d+-day\b/, name: 'day-window telemetry' },
	{ re: /\[Apply\]\[Dismiss\]\[Later\]/, name: 'HITL review card' },
	{ re: /Brandon (gets|edits|approves|picks|adds|runs|reviews)/, name: 'Brandon-as-actor phrase' },
];
const ALLOWED_KEYS = [
	'model_generated',
	'snapshot_built_at',
	'layers',
	'subsystems',
	'nodes',
	'edges',
	'blog_series',
	'evolution',
	'stats',
	'flows',
];

// ---------- helpers ----------
function titleCaseId(id: string): string {
	return id
		.split(/[-_]/)
		.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ');
}
// General output scrubber for every free-text string that reaches the snapshot
// (node names, edge labels, ADR titles). Strips backtick code spans, filesystem
// paths, and bare filenames, then neutralizes any deny-pattern token
// (telemetry/private refs) so the final grep is a net, not the sole guard.
function sanitizeForOutput(s: string): string {
	let out = String(s ?? '')
		.replace(/`[^`]*`/g, ' ') // backtick code spans (carry paths)
		.replace(/\S+\/\S*/g, ' ') // path-like a/b tokens (leaves leading "/wrap" alone)
		.replace(/\b[\w.-]+\.(md|js|ts|json|jsonl|sh|rules|html)\b/gi, ' '); // bare filenames
	for (const { re } of DENY_PATTERNS) {
		out = out.replace(
			new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'),
			' ',
		);
	}
	return out
		.replace(/\(\s*\)/g, ' ') // empty parens left by code-span removal
		.replace(/\s+([,;:])/g, '$1') // tighten before , ; : (NOT + / = — legit in prose)
		.replace(/[=+]\s*$/g, '') // drop a dangling trailing operator from token removal
		.replace(/\s{2,}/g, ' ')
		.trim();
}
// Render a path-free human label; fall back to a title-cased id when nothing
// publishable remains.
function humanizeLabel(label: string, id: string): string {
	const s = sanitizeForOutput(label.replace(/\([^)]*\)/g, ' '));
	return s.length < 3 ? titleCaseId(id) : s;
}
// Extract a 3B-repo-relative path candidate from a node label, or null.
function extractRepoPath(label: string): string | null {
	const m = label.match(/[A-Za-z0-9_.][A-Za-z0-9_.\-/]*\/[A-Za-z0-9_.\-/]*/);
	if (m) return m[0].replace(/[).,]+$/, '');
	const f = label.match(/\b[\w.-]+\.(md|js|ts|json|jsonl|sh|rules)\b/);
	return f ? f[0] : null;
}

// ---------- get-privacy (D6: cwd=3B root, repo-rel POSIX, non-zero=private) ----------
let GET_PRIVACY_OK = false;
async function probeGetPrivacy(): Promise<void> {
	try {
		const { code } = await new Deno.Command('node', {
			args: ['scripts/get-privacy.js', 'knowledge/_index.md'],
			cwd: THREEB,
			stdout: 'null',
			stderr: 'null',
		}).output();
		GET_PRIVACY_OK = code === 0 || code === 1; // 0=public 1=private => usable
	} catch {
		GET_PRIVACY_OK = false; // node missing / spawn failure
	}
}
async function getPrivacyPrivate(relPath: string): Promise<boolean> {
	try {
		const { code } = await new Deno.Command('node', {
			args: ['scripts/get-privacy.js', relPath],
			cwd: THREEB,
			stdout: 'null',
			stderr: 'null',
		}).output();
		return code !== 0; // fail-safe: anything but 0 (public) => private/skip
	} catch {
		return true;
	}
}

// ---------- ADR index -> evolution (id/title/date only, never description) ----------
function parseAdrIndex(md: string): { id: string; title: string; date: string }[] {
	const out: { id: string; title: string; date: string }[] = [];
	for (const line of md.split('\n')) {
		const m = line.match(
			/^\|\s*\[(\d{3})\]\([^)]+\)\s*\|\s*(.+?)\s*\|\s*[^|]+?\s*\|\s*[^|]+?\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/,
		);
		if (!m) continue;
		// split on a raw pipe first (defends against a category column leaking into
		// the captured title), then scrub + word-boundary truncate for the timeline.
		let title = sanitizeForOutput(m[2].split('|')[0]);
		if (title.length > 80) title = title.slice(0, 80).replace(/\s+\S*$/, '') + '…';
		out.push({ id: `ADR-${m[1]}`, title, date: m[3] });
	}
	out.sort((a, b) => a.id.localeCompare(b.id));
	return out;
}

// ---------- assertions (privacy grep + schema + graph integrity) ----------
const GRAPH_VALIDATION_METRIC = 'Graph validation (dangling / orphan / invalid)';

// Real graph integrity over the SANITIZED snapshot — single source of truth for both
// the `stats` value and assertClean's honesty check. dangling = edge endpoint missing
// from nodes; orphan = node with no incident edge (expected after privacy edge-filtering);
// invalid = node/edge missing a required non-empty string field.
function computeGraphValidation(
	nodes: { id?: unknown; kind?: unknown }[],
	edges: { from?: unknown; to?: unknown; kind?: unknown }[],
): { dangling: number; orphan: number; invalid: number } {
	const ids = new Set(nodes.map((n) => n.id));
	const connected = new Set<unknown>();
	let dangling = 0;
	for (const e of edges) {
		const okFrom = ids.has(e.from);
		const okTo = ids.has(e.to);
		if (!okFrom || !okTo) dangling++;
		if (okFrom) connected.add(e.from);
		if (okTo) connected.add(e.to);
	}
	let orphan = 0;
	for (const n of nodes) if (!connected.has(n.id)) orphan++;
	const nonEmpty = (v: unknown): boolean => typeof v === 'string' && v.length > 0;
	let invalid = 0;
	for (const n of nodes) if (!nonEmpty(n.id) || !nonEmpty(n.kind)) invalid++;
	for (const e of edges) if (!nonEmpty(e.from) || !nonEmpty(e.to) || !nonEmpty(e.kind)) invalid++;
	return { dangling, orphan, invalid };
}

// deno-lint-ignore no-explicit-any
function assertClean(snapshot: any): string[] {
	const errs: string[] = [];

	// Schema: top-level keys must match ALLOWED_KEYS exactly — reject extra AND missing.
	const actual = new Set(Object.keys(snapshot));
	for (const k of actual) {
		if (!ALLOWED_KEYS.includes(k)) errs.push(`unexpected top-level key: ${k}`);
	}
	for (const k of ALLOWED_KEYS) {
		if (!actual.has(k)) errs.push(`missing required top-level key: ${k}`);
	}
	if ('narrative' in snapshot) errs.push('forbidden field present: narrative');

	// Required shapes for the public contract (v2-reserved arrays must exist as arrays).
	for (const k of [
		'layers',
		'subsystems',
		'nodes',
		'edges',
		'blog_series',
		'evolution',
		'stats',
		'flows',
	]) {
		if (!Array.isArray(snapshot[k])) errs.push(`field ${k} must be an array`);
	}
	for (const k of ['model_generated', 'snapshot_built_at']) {
		if (typeof snapshot[k] !== 'string') errs.push(`field ${k} must be a string`);
	}

	for (const f of snapshot.flows ?? []) {
		const ks = Object.keys(f).sort().join(',');
		if (ks !== 'display_label,id') errs.push(`flow ${f.id} has unexpected keys: ${ks}`);
	}

	const blob = JSON.stringify(snapshot);
	for (const { re, name } of DENY_PATTERNS) {
		const hit = blob.match(re);
		if (hit) errs.push(`privacy leak [${name}]: "${hit[0]}"`);
	}

	// Graph integrity. Dangling edges and structurally invalid nodes/edges are hard
	// failures; orphans are allowed (a sanitized snapshot legitimately drops edges to
	// private nodes) but their count must be reported honestly in the stats block.
	const ids = new Set((snapshot.nodes ?? []).map((n: { id: string }) => n.id));
	for (const e of snapshot.edges ?? []) {
		if (!ids.has(e.from) || !ids.has(e.to)) errs.push(`dangling edge ${e.from} -> ${e.to}`);
	}
	const gv = computeGraphValidation(snapshot.nodes ?? [], snapshot.edges ?? []);
	if (gv.invalid > 0) errs.push(`${gv.invalid} structurally invalid node(s) or edge(s)`);
	const gvStat = (snapshot.stats ?? []).find(
		(s: { metric: string }) => s.metric === GRAPH_VALIDATION_METRIC,
	);
	const gvExpected = `${gv.dangling} / ${gv.orphan} / ${gv.invalid}`;
	if (!gvStat) errs.push(`missing stat: ${GRAPH_VALIDATION_METRIC}`);
	else if (gvStat.value !== gvExpected) {
		errs.push(`graph-validation stat mismatch: reported "${gvStat.value}", actual "${gvExpected}"`);
	}

	return errs;
}

async function countDirectMarkdownFiles(dir: string): Promise<number> {
	let count = 0;
	for await (const entry of Deno.readDir(dir)) {
		if (entry.isFile && entry.name.endsWith('.md')) count++;
	}
	return count;
}

async function countSkillDirectories(dir: string): Promise<number> {
	let count = 0;
	for await (const entry of Deno.readDir(dir)) {
		if (!entry.isDirectory) continue;
		try {
			const skill = await Deno.stat(join(dir, entry.name, 'SKILL.md'));
			if (skill.isFile) count++;
		} catch {
			/* not a skill directory */
		}
	}
	return count;
}

async function countMarkdownFilesRecursive(dir: string): Promise<number> {
	let count = 0;
	for await (const entry of walk(dir, { exts: ['.md'], includeDirs: false })) {
		if (entry.isFile) count++;
	}
	return count;
}

async function countDirectDirectories(dir: string): Promise<number> {
	let count = 0;
	for await (const entry of Deno.readDir(dir)) {
		if (entry.isDirectory) count++;
	}
	return count;
}

// First candidate directory that exists, else the first candidate (so the
// resulting error names the expected location).
function firstExistingDir(candidates: string[]): string {
	for (const candidate of candidates) {
		try {
			if (Deno.statSync(candidate).isDirectory) return candidate;
		} catch {
			/* not this one */
		}
	}
	return candidates[0];
}

// ---------- build ----------
async function build(): Promise<void> {
	const HOME = Deno.env.get('HOME')!;
	// C3 (dual-runtime evidence): 3B moved from ~/dev/personal/3b to ~/dev/3b —
	// THREEB_PATH first, then the first existing root (~/dev/3b, then legacy).
	THREEB =
		Deno.env.get('THREEB_PATH') ??
		firstExistingDir([join(HOME, 'dev', '3b'), join(HOME, 'dev', 'personal', '3b')]);
	const MODEL = join(THREEB, 'projects', '3b', 'architecture', 'model.json');
	const ADR_INDEX = join(THREEB, 'projects', '3b', 'decisions', '_index.md');
	// C3: rules moved from .agents/rules to .agent-ssot/rules in 3B; accept either.
	const RULES_DIR = firstExistingDir([
		join(THREEB, '.agents', 'rules'),
		join(THREEB, '.agent-ssot', 'rules'),
	]);
	const SKILLS_DIR = join(THREEB, '.agents', 'skills');
	const KNOWLEDGE_DIR = join(THREEB, 'knowledge');
	const model = JSON.parse(await Deno.readTextFile(MODEL));
	await probeGetPrivacy();
	if (!GET_PRIVACY_OK) {
		console.warn(
			'WARN: get-privacy.js unavailable — using denylist + default-deny + path-stripping only. ' +
				'No paths are emitted regardless, but the authoritative file-path check is skipped.',
		);
	}

	const layers = model.layers.map((l: { id: string; name: string; description: string }) => ({
		id: l.id,
		name: l.name,
		description: l.description,
	}));

	const subsystems = model.nodes
		.filter((n: { kind: string }) => n.kind === 'subsystem')
		.map((n: { subsystem: string; label: string }) => {
			const info = SUBSYSTEM_INFO[n.subsystem];
			return {
				key: n.subsystem,
				name: n.label,
				display_one_liner: info?.one_liner ?? titleCaseId(n.subsystem),
				public_safe: info?.public_safe ?? false,
			};
		});

	const keptIds = new Set<string>();
	const nodes: unknown[] = [];
	let droppedPrivate = 0;
	for (const n of model.nodes) {
		if (DENY_NODE_IDS.has(n.id)) {
			droppedPrivate++;
			continue;
		}
		if (PRIVATE_REPO_RE.test(n.id) || PRIVATE_REPO_RE.test(n.label)) {
			droppedPrivate++;
			continue;
		}
		if ((n.kind === 'store' || n.kind === 'doc') && !PUBLIC_STORE_DOC_IDS.has(n.id)) {
			droppedPrivate++;
			continue;
		}
		if (GET_PRIVACY_OK) {
			const p = extractRepoPath(n.label);
			if (p && /\.[a-z]+$/i.test(p) && (await getPrivacyPrivate(p))) {
				droppedPrivate++;
				continue;
			}
		}
		keptIds.add(n.id);
		nodes.push({
			id: n.id,
			kind: n.kind,
			layer: n.layer,
			subsystem: n.subsystem,
			name: humanizeLabel(n.label, n.id),
		});
	}

	const edges = model.edges
		.filter((e: { from: string; to: string }) => keptIds.has(e.from) && keptIds.has(e.to))
		.map((e: { from: string; to: string; kind: string; label?: string }) => ({
			from: e.from,
			to: e.to,
			kind: e.kind,
			label: sanitizeForOutput(e.label ?? ''),
		}));

	const flows = model.flows
		.filter((f: { id: string }) => FLOW_LABELS[f.id])
		.map((f: { id: string }) => ({ id: f.id, display_label: FLOW_LABELS[f.id] }));

	const publishedSlugs = new Set<string>();
	try {
		for await (const entry of walk(POSTS_EN, { exts: ['.md'], includeDirs: false })) {
			publishedSlugs.add(entry.name.replace(/\.md$/, ''));
		}
	} catch {
		/* posts dir absent in some checkouts -> all planned */
	}
	const blog_series = model.blog_series.map(
		(b: { order: number; slug: string; title: string }) => ({
			order: b.order,
			slug: b.slug,
			title: b.title,
			status: publishedSlugs.has(b.slug) ? 'published' : 'planned',
		}),
	);

	const evolution = parseAdrIndex(await Deno.readTextFile(ADR_INDEX));

	const gv = computeGraphValidation(nodes as { id?: unknown; kind?: unknown }[], edges);

	const sourceStats = {
		ruleFiles: await countDirectMarkdownFiles(RULES_DIR),
		skills: await countSkillDirectories(SKILLS_DIR),
		knowledgeEntries: await countMarkdownFilesRecursive(KNOWLEDGE_DIR),
		knowledgeCategories: await countDirectDirectories(KNOWLEDGE_DIR),
	};

	// Aggregate allowlist only; never per-category / repo / telemetry.
	const stats = [
		{ metric: 'Layers', value: String(model.layers.length) },
		{ metric: 'Architecture nodes', value: String(model.nodes.length) },
		{ metric: 'Architecture edges', value: String(model.edges.length) },
		{ metric: 'Documented flows', value: String(model.flows.length) },
		{ metric: 'Blog series posts', value: String(model.blog_series.length) },
		{ metric: 'ADRs', value: String(evolution.length) },
		{ metric: 'Rule files', value: String(sourceStats.ruleFiles) },
		{ metric: 'Skills', value: String(sourceStats.skills) },
		{ metric: 'Knowledge entries', value: String(sourceStats.knowledgeEntries) },
		{ metric: 'Knowledge categories', value: String(sourceStats.knowledgeCategories) },
		{ metric: 'Agent runtimes', value: '3' },
		{
			metric: GRAPH_VALIDATION_METRIC,
			value: `${gv.dangling} / ${gv.orphan} / ${gv.invalid}`,
		},
	];

	const snapshot = {
		model_generated: model.generated,
		snapshot_built_at: new Date().toISOString(),
		layers,
		subsystems,
		nodes,
		edges,
		blog_series,
		evolution,
		stats,
		flows,
	};

	const errs = assertClean(snapshot);
	if (errs.length) {
		console.error(
			'FAIL: snapshot failed self-assert (NOT written):\n' + errs.map((e) => `  - ${e}`).join('\n'),
		);
		Deno.exit(1);
	}

	await ensureDir(dirname(OUT));
	await Deno.writeTextFile(OUT, JSON.stringify(snapshot, null, 2) + '\n');

	const pubCount = blog_series.filter((b: { status: string }) => b.status === 'published').length;
	console.log('OK: wrote ' + OUT);
	console.log(
		`  layers=${layers.length} subsystems=${subsystems.length} ` +
			`nodes=${nodes.length} (dropped ${droppedPrivate} private) edges=${edges.length} ` +
			`flows=${flows.length} ADRs=${evolution.length} blog=${blog_series.length} (${pubCount} published)`,
	);
	console.log(
		`  get-privacy: ${GET_PRIVACY_OK ? 'active' : 'UNAVAILABLE (denylist-only fallback)'}`,
	);
}

// ---------- check ----------
async function check(): Promise<void> {
	let snap: unknown;
	try {
		snap = JSON.parse(await Deno.readTextFile(OUT));
	} catch {
		console.error(`FAIL --check: cannot read ${OUT}. Run \`deno task snapshot:3b\` first.`);
		Deno.exit(1);
	}
	const errs = assertClean(snap);
	if (errs.length) {
		console.error('FAIL --check:\n' + errs.map((e) => `  - ${e}`).join('\n'));
		Deno.exit(1);
	}
	console.log('OK --check: system-snapshot.json clean (privacy grep + schema + graph integrity).');
}

if (Deno.args.includes('--check')) {
	await check();
} else {
	await build();
}
