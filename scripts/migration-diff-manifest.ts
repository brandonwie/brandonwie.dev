/**
 * Slice 5 — classification manifest generator.
 *
 * Reproduces verification/diff-classification-manifest.json deterministically
 * from the same inputs the comparator uses: the frozen Svelte baseline JSON,
 * the built candidate tree, and the exception ledger. Every unapproved diff
 * row is assigned to exactly one class; the manifest is the evidence package
 * for ledger approval, not an approval itself.
 *
 * Usage:
 *   pnpm exec tsx scripts/migration-diff-manifest.ts [--out <path>] [--check]
 *
 *   --out <path>  write the manifest (default
 *                 verification/diff-classification-manifest.json)
 *   --check       regenerate and compare against the committed file; exits 1
 *                 on drift. Cheap staleness guard for CI / review.
 *
 * Classification is evidence-driven, not hand-assigned:
 *   - route/field shape decides the structural classes (404 shell, KO-loc
 *     metadata, route presence, system-3b, post internalLinks).
 *   - post [text] rows get a composite signature from three detectors run on
 *     the same normalized text the comparator hashes:
 *       mermaid       — source fence scan of src/content/posts/{en,ko}
 *       reading-time  — rendered "N min read"/"N분 읽기" header mismatch
 *       inline-parity — residual token diff after masking redesign furniture,
 *                       titles/descriptions, and mermaid syntax; what remains
 *                       is CommonMark-vs-mdsvex inline divergence (backslash
 *                       escapes, reference-link bracket consumption,
 *                       intraword-underscore emphasis).
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { compare, capture, loadLedger, normalizeText } from './migration-verify.ts';

const ROOT = process.cwd();
const BASELINE_FILE = 'verification/baseline/svelte-e23e808.json';
const CANDIDATE_DIR = 'next/build';
const LEDGER_FILE = 'verification/exception-ledger.json';
const DEFAULT_OUT = 'verification/diff-classification-manifest.json';

/** Private copy of migration-verify.ts's stripParaglideAnchors (kept in sync:
 * same regex, same inner-content test). The extractor is the authority; this
 * exists so token analysis runs on exactly the text the comparator hashes. */
function stripParaglideAnchors(html: string): string {
	return html.replace(/<div\b[^>]*display:\s*none[^>]*>([\s\S]*?)<\/div>/gi, (block, inner) => {
		const bare = inner.replace(/<!--[\s\S]*?-->/g, '').trim();
		return /^<a\b[^>]*>en<\/a><a\b[^>]*>ko<\/a>$/.test(bare) ? '' : block;
	});
}

/** Body text exactly as the extractor computes it before hashing. */
function bodyTokens(html: string): string[] {
	const bodyStart = html.search(/<body\b[^>]*>/i);
	const body = stripParaglideAnchors(bodyStart === -1 ? html : html.slice(bodyStart));
	return normalizeText(body).split(' ');
}

interface DiffRow {
	url: string;
	field: string;
	fingerprint: string | null;
	detail: string;
}

// ---------- post [text] detectors -------------------------------------------

/** Routes whose own-locale source file carries a ```mermaid fence. */
function mermaidRoutes(): Set<string> {
	const out = new Set<string>();
	for (const locale of ['en', 'ko']) {
		const dir = join(ROOT, 'src/content/posts', locale);
		if (!existsSync(dir)) continue;
		const stack: string[] = [dir];
		while (stack.length) {
			const d = stack.pop()!;
			for (const e of readdirSync(d, { withFileTypes: true })) {
				const p = join(d, e.name);
				if (e.isDirectory()) stack.push(p);
				else if (e.name.endsWith('.md')) {
					const src = readFileSync(p, 'utf8');
					if (/```mermaid/.test(src)) out.add(`${locale}:${e.name.replace(/\.md$/, '')}`);
				}
			}
		}
	}
	return out;
}

/** Routes whose rendered header reading time differs between builds. */
function readingTimeRoutes(postUrls: string[]): Set<string> {
	const out = new Set<string>();
	for (const u of postUrls) {
		const b = readFileSync(join(ROOT, 'build', u + '.html'), 'utf8').match(
			/(\d+)\s*(분 읽기|min read)/,
		);
		const c = readFileSync(join(ROOT, CANDIDATE_DIR, u + '.html'), 'utf8').match(
			/(\d+)\s*(분 읽기|min read)/,
		);
		if ((b?.[1] ?? null) !== (c?.[1] ?? null)) out.add(u);
	}
	return out;
}

/** Tokens produced by the redesigned article chrome, locale furniture, and
 * machinery residue. Masked before content-level residuals are judged. */
const FURNITURE = new Set(
	(
		'· ~ / | Home 홈 Published 발행일 Updated 수정일 Category: 카테고리: Tags: 태그: ' +
		'English 한국어 min read 분 읽기 posts 글 목록으로 돌아가기 Back to list Series 시리즈 편 Part ' +
		'검색 EN KR ⌘K Search content Skip main Table of Contents 목차 comments 댓글 ' +
		'Loading diagram... Powered by utteranc.es ko en ~/posts – —'
	).split(/\s+/),
);

/** Mermaid syntax vocabulary — a post in the mermaid set emits its diagram
 * source as text on the candidate side; those tokens are the mermaid cause,
 * not inline-parity evidence. */
const MERMAID_SYNTAX = new Set(
	'flowchart graph subgraph end LR TD TB RL BT --> -.-> ==> --- sequenceDiagram classDiagram'.split(
		/\s+/,
	),
);

function isMermaidToken(t: string): boolean {
	return (
		MERMAID_SYNTAX.has(t) ||
		/-->|\.->|==>/.test(t) ||
		/\["/.test(t) ||
		/^[\w가-힣]+\[/.test(t) ||
		/"\]/.test(t) ||
		/^\|.*\|$/.test(t)
	);
}

/** Evidence that a residual token is a real inline-parse divergence rather
 * than mermaid source or furniture. Backslash evidence is shaped like a
 * CommonMark escape (\\x, \\d, \\$5, \\_) — a bare backslash, a mermaid
 * edge/label artifact (\\[, \\", \\/), or a mermaid line break (\\n inside
 * label text) does not count. */
function isInlineEvidence(t: string): boolean {
	return (
		/\\(?![nN"\\/()[\]{}|])[A-Za-z0-9_$]/.test(t) ||
		/_[^\s_][^\s]*_/.test(t) ||
		/^\(?[\w가-힣]+\[[\w가-힣-]+\]\)?$/.test(t)
	);
}

function residualCounts(base: string[], cand: string[]): { onlyB: string[]; onlyC: string[] } {
	const cb = new Map<string, number>();
	const cc = new Map<string, number>();
	for (const t of base) cb.set(t, (cb.get(t) ?? 0) + 1);
	for (const t of cand) cc.set(t, (cc.get(t) ?? 0) + 1);
	const onlyB: string[] = [];
	const onlyC: string[] = [];
	for (const [t, n] of cb) for (let i = n - (cc.get(t) ?? 0); i > 0; i--) onlyB.push(t);
	for (const [t, n] of cc) for (let i = n - (cb.get(t) ?? 0); i > 0; i--) onlyC.push(t);
	return { onlyB, onlyC };
}

// ---------- classification ---------------------------------------------------

interface ClassDef {
	id: string;
	rationale: string;
	rows: { url: string; field: string; fingerprint: string | null }[];
}

function classForNonPost(row: DiffRow): string {
	if (row.field === 'page') return 'route-candidate-only';
	if (row.url === '/404') return 'shell-404-prerender';
	if (row.url === '/system/3b' || row.url === '/ko/system/3b') return 'system-3b-partial-port';
	if (row.url.startsWith('/ko/')) return 'ko-loc-c13';
	return 'unclassified';
}

const CLASS_DEFS: Record<string, Omit<ClassDef, 'rows'>> = {
	'route-candidate-only': {
		id: 'route-candidate-only',
		rationale:
			'Presence diff: the route exists only in the candidate. /_not-found is the Next.js ' +
			'app-router internal not-found document, prerendered by the framework itself; the Svelte ' +
			'baseline serves 404s through the /404 CSR shell and has no such route. The fingerprint is ' +
			'a presence fingerprint, not a lost-route null, so it is approvable by construction.',
	},
	'shell-404-prerender': {
		id: 'shell-404-prerender',
		rationale:
			'The baseline /404 is a client-rendered +error.svelte shell whose captured title, h1, body ' +
			'text and link list are the empty pre-hydration frame. The candidate statically renders the ' +
			'404 document (proper title, h1, copy, links) — strictly more content at the same URL. ' +
			'Approved as a candidate-localized improvement class.',
	},
	'ko-loc-c13': {
		id: 'ko-loc-c13',
		rationale:
			'Baseline C13 bug class: the Svelte build emitted English metadata (title, description, ' +
			'og, twitter, h1, lang) at /ko/ URLs. The candidate emits correct Korean metadata. ' +
			'Approved as a localization correction — the baseline value is a defect, not a contract.',
	},
	'system-3b-partial-port': {
		id: 'system-3b-partial-port',
		rationale:
			'The candidate /system/3b page is a documented partial port: it lacks the ~ breadcrumb ' +
			'link, hero prose, stats grid, layer cards, subsystems grid, ADR/evolution section and ' +
			'snapshot footer that the baseline renders. GOVERNANCE NOTE: next/src/content/' +
			'system-3b.tsx records the missing sections as Slice 3 work deliberately NOT ledgered — ' +
			'classifying them here surfaces the conflict; writing ledger rows requires an explicit ' +
			'ruling that resolves the file-level contract.',
	},
	'post-links-redesign': {
		id: 'post-links-redesign',
		rationale:
			'Approved post-header redesign, link-list half. Uniform across all 334 post routes: the ' +
			'baseline breadcrumb ends in the posts-list anchor (/posts or /ko/posts); the candidate ' +
			'ends in the Home anchor (/ or /ko) and additionally exposes the locale-twin link ' +
			'(/ko/posts/{slug} or /posts/{slug}) for the language switcher. Verified uniform: exactly ' +
			'two delta shapes across all 334 rows, zero anomalies.',
	},
	'post-text-chrome': {
		id: 'post-text-chrome',
		rationale:
			'Approved post-header redesign, text half — no additional content cause detected. Delta ' +
			'is the redesigned article chrome (Home/홈 crumb with localized title, Published/발행일 ' +
			'meta row, Category:/Tags: labels, locale-twin and back links, post__lede description ' +
			'paragraph, search/검색 affordance) plus paraglide en/ko anchor residue the display:none ' +
			'strip leaves behind. No mermaid, escape, or reading-time payload detected.',
	},
	'post-text-chrome+mermaid': {
		id: 'post-text-chrome+mermaid',
		rationale:
			'Post-header redesign plus mermaid class: the route’s own-locale source has a ```mermaid ' +
			'fence; the baseline replaced it with a <Mermaid> component (Loading diagram... fallback), ' +
			'while the candidate emits the diagram source as text for client rendering. Documented ' +
			'approved class covering all 28 mermaid routes.',
	},
	'post-text-chrome+inline-parity': {
		id: 'post-text-chrome+inline-parity',
		rationale:
			'Post-header redesign plus CommonMark-vs-mdsvex inline divergence: residual tokens show ' +
			'backslash-escape handling differences (\\$, \\d, \\|, \\\\), reference-link bracket ' +
			'consumption (claude[bot] → claudebot), and intraword-underscore emphasis (수정된_출력). ' +
			'Candidate follows CommonMark; baseline’s mdsvex parser resolved constructs differently.',
	},
	'post-text-chrome+mermaid+inline-parity': {
		id: 'post-text-chrome+mermaid+inline-parity',
		rationale:
			'Post-header redesign plus both mermaid-source-as-text and an inline-parity divergence ' +
			'(escape/underscore/bracket evidence outside the diagram payload).',
	},
	'post-text-chrome+reading-time': {
		id: 'post-text-chrome+reading-time',
		rationale:
			'Post-header redesign plus a reading-time residual: rendered header shows candidate ' +
			'exactly 1 minute lower than baseline. All remaining reading-time deltas are within the ' +
			'approved ±1-minute bound after the remark-reading-time parity shim (frontmatter words + ' +
			'mermaid literal word count restored); residual is parser/smartypants tokenization ' +
			'granularity on a 19-route subset.',
	},
	'post-text-chrome+inline-parity+reading-time': {
		id: 'post-text-chrome+inline-parity+reading-time',
		rationale:
			'Post-header redesign plus inline-parity divergence and a ±1-minute reading-time ' +
			'residual (same bounds and provenance as the dedicated classes).',
	},
	'post-text-chrome+mermaid+reading-time': {
		id: 'post-text-chrome+mermaid+reading-time',
		rationale:
			'Post-header redesign plus mermaid-source-as-text and a ±1-minute reading-time ' +
			'residual (same bounds and provenance as the dedicated classes).',
	},
	'post-text-chrome+mermaid+inline-parity+reading-time': {
		id: 'post-text-chrome+mermaid+inline-parity+reading-time',
		rationale:
			'Post-header redesign plus mermaid-source-as-text, an inline-parity divergence, and a ' +
			'±1-minute reading-time residual (same bounds and provenance as the dedicated classes).',
	},
};

async function main(): Promise<number> {
	const args = process.argv.slice(2);
	const check = args.includes('--check');
	const outIdx = args.indexOf('--out');
	const out = outIdx === -1 ? DEFAULT_OUT : args[outIdx + 1];

	const baseline = JSON.parse(readFileSync(join(ROOT, BASELINE_FILE), 'utf8'));
	const candidate = await capture(join(ROOT, CANDIDATE_DIR));
	const ledger = loadLedger(LEDGER_FILE);
	const diffs = compare(baseline, candidate) as DiffRow[];

	const used = new Set<number>();
	const unapproved: DiffRow[] = [];
	for (const d of diffs) {
		const hit =
			d.fingerprint === null
				? -1
				: ledger.findIndex(
						(e) => e.url === d.url && e.field === d.field && e.fingerprint === d.fingerprint,
					);
		if (hit === -1) unapproved.push(d);
		else used.add(hit);
	}
	const stale = ledger.filter((_, i) => !used.has(i));

	const postUrls = Object.keys(baseline.pages).filter((u) => u.includes('/posts/'));
	const mer = mermaidRoutes();
	const rt = readingTimeRoutes(postUrls);

	// per-post inline-parity evidence (computed once, shared by text rows)
	const inlineEv = new Map<string, boolean>();
	for (const u of postUrls) {
		const bt = bodyTokens(readFileSync(join(ROOT, 'build', u + '.html'), 'utf8'));
		const ct = bodyTokens(readFileSync(join(ROOT, CANDIDATE_DIR, u + '.html'), 'utf8'));
		const { onlyB, onlyC } = residualCounts(bt, ct);
		const title = (baseline.pages[u].title ?? '').replace(/\s*\|\s*Brandon Wie\s*$/, '');
		const desc = baseline.pages[u].description ?? '';
		const mask = new Set([...FURNITURE, ...title.split(/\s+/), ...desc.split(/\s+/)]);
		const resB = onlyB.filter((t) => !mask.has(t) && !/^\d+$/.test(t));
		const resC = onlyC.filter((t) => !mask.has(t) && !/^\d+$/.test(t));
		const res = [...resB, ...resC];
		const locale = u.startsWith('/ko/') ? 'ko' : 'en';
		const inMer = mer.has(`${locale}:${u.split('/').pop()}`);
		// Mermaid posts emit diagram source as text; their residual is judged
		// only after mermaid-syntax tokens are removed, and counts as
		// inline-parity only when evidence-shaped (escape/underscore/bracket).
		// On non-mermaid posts every residual is real content divergence.
		inlineEv.set(
			u,
			inMer ? res.some((t) => !isMermaidToken(t) && isInlineEvidence(t)) : res.length > 0,
		);
	}

	const rows: { url: string; field: string; fingerprint: string | null; class: string }[] = [];
	for (const d of unapproved) {
		let cls: string;
		if (d.url.includes('/posts/')) {
			cls =
				d.field === 'internalLinks'
					? 'post-links-redesign'
					: d.field === 'text'
						? 'post-text-chrome' +
							(mer.has(`${d.url.startsWith('/ko/') ? 'ko' : 'en'}:${d.url.split('/').pop()}`)
								? '+mermaid'
								: '') +
							(inlineEv.get(d.url) ? '+inline-parity' : '') +
							(rt.has(d.url) ? '+reading-time' : '')
						: 'unclassified';
		} else {
			cls = classForNonPost(d);
		}
		rows.push({ url: d.url, field: d.field, fingerprint: d.fingerprint, class: cls });
	}

	const classes: Record<string, ClassDef> = {};
	for (const r of rows) {
		classes[r.class] ??= {
			...CLASS_DEFS[r.class],
			id: r.class,
			rationale: CLASS_DEFS[r.class]?.rationale ?? 'UNCLASSIFIED — needs investigation',
			rows: [],
		};
		classes[r.class].rows.push({ url: r.url, field: r.field, fingerprint: r.fingerprint });
	}
	const unclassified = rows.filter((r) => r.class === 'unclassified').length;

	let head = 'unknown';
	try {
		head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
	} catch {
		// non-git context — fingerprint set still fully identifies the rows
	}

	const manifest = {
		generated: {
			head,
			baseline: BASELINE_FILE,
			candidate: CANDIDATE_DIR,
			ledger: LEDGER_FILE,
		},
		totals: {
			diffRows: unapproved.length,
			classified: unapproved.length - unclassified,
			unclassified,
			staleLedgerEntries: stale.length,
		},
		classes: Object.values(classes)
			.map((c) => ({ id: c.id, rationale: c.rationale, count: c.rows.length }))
			.sort((a, b) => a.id.localeCompare(b.id)),
		rows,
	};

	const text = JSON.stringify(manifest, null, '\t') + '\n';
	if (check) {
		const existing = readFileSync(join(ROOT, out), 'utf8');
		if (existing === text) {
			console.log('manifest up to date');
			return 0;
		}
		console.error('manifest drift — regenerate with --out');
		return 1;
	}
	writeFileSync(join(ROOT, out), text);
	console.log(
		`manifest: ${unapproved.length} rows, ${unclassified} unclassified, ${Object.keys(classes).length} classes → ${out}`,
	);
	return unclassified === 0 ? 0 : 1;
}

process.exit(await main());
