#!/usr/bin/env -S pnpm exec tsx
/**
 * Content integrity audit for published posts.
 *
 * Enforces the two blocking gates defined in
 * 3b/.agents/skills/blog-publish/references/content-integrity-gates.md:
 *
 *   G1 Generalization        — no employer/client/product names, company-repo
 *                              links, employer infra identifiers, work
 *                              colleagues, ticket IDs, or personal-life
 *                              framing. The author's OWN projects are allowed
 *                              and named directly. Work-derived material ships
 *                              only under a complete work_reference exemption.
 *   G2 Reference credibility — at least one LIVE, PUBLIC, THIRD-PARTY
 *                              official/authoritative reference per post.
 *                              Self-owned links are context, never the anchor.
 *
 * The deny list that names the employer lives in the PRIVATE 3B repo, never
 * here — this repo is public. Missing config fails the run; pass
 * --allow-missing-terms to degrade to structural checks only.
 *
 * Usage:
 *   pnpm audit:posts                     # whole EN corpus, both gates
 *   pnpm audit:posts -- --slug=<slug>    # one post
 *   pnpm audit:posts -- --g1             # skip network (G1 only)
 *   pnpm audit:posts -- --include-drafts # audit retired posts too
 *   pnpm audit:posts -- --json           # machine-readable report
 *   pnpm audit:posts -- --allow-missing-terms # structural checks only
 *
 * Exit code 1 when any non-draft post in scope fails a gate.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import {
	auditG1,
	EMPTY_TERMS,
	hostOf,
	parseTerms,
	wordHit,
	type Finding,
	type Terms,
} from './lib/g1.ts';

export { wordHit };

const EN_DIR = './src/content/posts/en';
const KO_DIR = './src/content/posts/ko';

const TERMS_PATH =
	process.env.BLOG_AUDIT_TERMS ?? join(homedir(), '.b3/.agent-ssot/config/blog-audit-terms.json');

const CREDIBLE_TYPES = new Set(['official', 'authoritative']);
const CONCURRENCY = 12;
const TIMEOUT_MS = 20_000;
const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

interface PostReport {
	file: string;
	slug: string;
	draft: boolean;
	findings: Finding[];
}

/**
 * A post may include work-derived material ONLY when the user explicitly
 * directed it, and only when the approval is recorded where the content lives.
 * Returns the findings for a malformed mark, or null when the mark is valid.
 */
function validateWorkReference(fm: Record<string, unknown>): Finding[] | null {
	const mark = fm.work_reference as Record<string, unknown> | undefined;
	if (!mark) return null;
	const missing = ['approved_by', 'approved_on', 'scope', 'note'].filter((k) => !mark[k]);
	if (missing.length > 0) {
		return [
			{
				gate: 'G1',
				rule: 'incomplete-work-reference',
				detail: `work_reference is missing ${missing.join(', ')} — an exemption without a full mark does not ship`,
			},
		];
	}
	return [];
}

function loadTerms(): { terms: Terms; loaded: boolean } {
	if (!existsSync(TERMS_PATH)) return { terms: EMPTY_TERMS, loaded: false };
	const raw = JSON.parse(readFileSync(TERMS_PATH, 'utf8'));
	return { terms: parseTerms(raw, TERMS_PATH), loaded: true };
}

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith('.md') ? [full] : [];
	});
}

// ---------------------------------------------------------------- G2

interface RefRow {
	url: string;
	title?: string;
	type?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** curl handles a few TLS/HTTP2 servers (gnu.org among them) that fetch() rejects. */
function curlStatus(url: string): number | string {
	try {
		const out = execFileSync(
			'curl',
			['-sL', '-o', '/dev/null', '-w', '%{http_code}', '-A', USER_AGENT, '--max-time', '20', url],
			{ encoding: 'utf8', timeout: 30_000 },
		).trim();
		const code = Number(out);
		return Number.isFinite(code) && code > 0 ? code : `ERR:curl(${out})`;
	} catch {
		return 'ERR:curl';
	}
}

async function head(url: string): Promise<number | string> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const res = await fetch(url, {
				redirect: 'follow',
				headers: { 'User-Agent': USER_AGENT },
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
			// Rate limiting is inconclusive, not a verdict — back off and retry once.
			if (res.status === 429 && attempt === 0) {
				await sleep(5_000);
				continue;
			}
			return res.status;
		} catch {
			// fetch() rejected outright — let curl arbitrate before calling it an error.
			const viaCurl = curlStatus(url);
			if (typeof viaCurl === 'number') return viaCurl;
			if (attempt === 0) {
				await sleep(2_000);
				continue;
			}
			return viaCurl;
		}
	}
	return 'ERR:retries-exhausted';
}

async function checkUrls(urls: string[]): Promise<Map<string, number | string>> {
	const out = new Map<string, number | string>();
	const queue = [...urls];
	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, Math.max(queue.length, 1)) }, async () => {
			for (;;) {
				const url = queue.shift();
				if (!url) return;
				out.set(url, await head(url));
			}
		}),
	);
	return out;
}

function auditG2(refs: RefRow[], statuses: Map<string, number | string>, terms: Terms): Finding[] {
	const findings: Finding[] = [];
	const selfDomains = terms.selfDomains.domains.map((d) => d.toLowerCase());
	const companyOwners = new Set(terms.companyRepoOwners.owners.map((o) => o.toLowerCase()));
	const personalOwners = new Set(terms.personalOwners.owners.map((o) => o.toLowerCase()));

	if (refs.length === 0) {
		return [{ gate: 'G2', rule: 'no-references', detail: 'post has no references — no post' }];
	}

	let qualifying = 0;

	for (const ref of refs) {
		// A folded YAML scalar can wrap a long URL across lines, leaving a space
		// inside it. The rendered link is broken even though the host is fine.
		if (/\s/.test(ref.url)) {
			findings.push({
				gate: 'G2',
				rule: 'malformed-reference',
				detail: `${JSON.stringify(ref.url)} contains whitespace — the YAML folded the URL across lines; quote it on one line`,
			});
			continue;
		}
		const status = statuses.get(ref.url);
		const host = hostOf(ref.url);
		const ghOwner = /^https?:\/\/github\.com\/([^/]+)\//i.exec(ref.url)?.[1]?.toLowerCase();
		const isSelf =
			selfDomains.some((d) => host === d || host.endsWith(`.${d}`)) ||
			(ghOwner ? personalOwners.has(ghOwner) : false);
		const isCompanyRepo = ghOwner ? companyOwners.has(ghOwner) : false;
		const credibleType = CREDIBLE_TYPES.has(String(ref.type ?? ''));

		if (isCompanyRepo) {
			findings.push({
				gate: 'G2',
				rule: 'company-reference',
				detail: `${ref.url} is a company-org repo — never a public source`,
			});
			continue;
		}

		if (isSelf) {
			// Personal projects are fine to cite; they just are not third-party
			// evidence. Only complain when the link is also dead for readers.
			if (status !== 200 && status !== 403) {
				findings.push({
					gate: 'G2',
					rule: 'dead-self-reference',
					detail: `${ref.url} → HTTP ${status} — a personal link readers cannot open; restate it in prose instead`,
				});
			}
			continue;
		}

		if (status === 429 || String(status).startsWith('ERR:')) {
			findings.push({
				gate: 'G2',
				rule: 'inconclusive',
				detail: `${ref.url} → ${status} (re-check; never pass an inconclusive result)`,
			});
			continue;
		}

		if (status !== 200 && status !== 403) {
			findings.push({
				gate: 'G2',
				rule: 'dead-reference',
				detail: `${ref.url} → HTTP ${status} — replace it, or drop the claim it supports`,
			});
			continue;
		}

		if (credibleType) qualifying++;
	}

	if (qualifying === 0) {
		findings.push({
			gate: 'G2',
			rule: 'no-qualifying-reference',
			detail:
				'zero live, public, third-party official/authoritative references — retire the post or find a real source',
		});
	}

	return findings;
}

// ---------------------------------------------------------------- main

async function main() {
	const args = process.argv.slice(2);
	const slugArg = args.find((a) => a.startsWith('--slug='))?.split('=')[1];
	const g1Only = args.includes('--g1');
	const includeDrafts = args.includes('--include-drafts');
	const asJson = args.includes('--json');

	let loadedTerms: { terms: Terms; loaded: boolean };
	try {
		loadedTerms = loadTerms();
	} catch (err) {
		console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	}
	const { terms, loaded } = loadedTerms;

	// Fail closed. A missing deny list silently disables employer detection, and
	// a moved path did exactly that for weeks. Structural-only runs are opt-in.
	if (!loaded && !args.includes('--allow-missing-terms')) {
		console.error(
			`❌ Deny list not found at ${TERMS_PATH}.\n` +
				`   Employer/personal-framing detection would be OFF, so the audit refuses to run.\n` +
				`   Set BLOG_AUDIT_TERMS to the private list, or pass --allow-missing-terms\n` +
				`   for a structural-only run.`,
		);
		process.exit(1);
	}

	// Both locales. A leak in a Korean post is just as public as one in English,
	// and KO carries content its EN twin does not — a KO-only internal project ID
	// survived an EN-only audit on 2026-08-02.
	let files = [...walk(EN_DIR), ...walk(KO_DIR)];
	if (slugArg) files = files.filter((f) => f.endsWith(`/${slugArg}.md`));
	if (files.length === 0) {
		console.error(slugArg ? `No post matched slug "${slugArg}"` : `No posts under ${EN_DIR}`);
		process.exit(1);
	}

	const parsed = files.map((file) => {
		const { data, content } = matter(readFileSync(file, 'utf8'));
		return { file, data: data as Record<string, unknown>, body: content };
	});

	const inScope = parsed.filter((p) => includeDrafts || p.data.draft !== true);

	// One network pass for every reference URL in scope.
	const allRefUrls = new Set<string>();
	for (const p of inScope) {
		for (const ref of (p.data.references as RefRow[] | undefined) ?? []) {
			if (ref?.url) allRefUrls.add(ref.url);
		}
	}
	const statuses = g1Only ? new Map<string, number | string>() : await checkUrls([...allRefUrls]);

	const reports: PostReport[] = inScope.map((p) => {
		const refs = ((p.data.references as RefRow[] | undefined) ?? []).filter((r) => r?.url);
		// A Korean post with no references block inherits its English twin's, and
		// the twin is audited in the same run — so G2 there would double-report the
		// same URLs and mislabel inheritance as "no references". G1 still applies to
		// every KO post: Korean prose leaks just as publicly as English prose.
		const inheritsRefs = p.file.includes('/posts/ko/') && refs.length === 0;
		const findings = [
			...(validateWorkReference(p.data) ?? []),
			...auditG1(p.data, p.body, terms),
			...(g1Only || inheritsRefs ? [] : auditG2(refs, statuses, terms)),
		];
		return {
			file: p.file,
			slug: p.file.split('/').pop()!.replace(/\.md$/, ''),
			draft: p.data.draft === true,
			findings,
		};
	});

	const failing = reports.filter((r) => r.findings.length > 0);

	if (asJson) {
		console.log(JSON.stringify({ termsLoaded: loaded, reports: failing }, null, 2));
		process.exit(failing.length > 0 ? 1 : 0);
	}

	if (!loaded) {
		console.log(
			`⚠️  Deny list not found at ${TERMS_PATH} — running STRUCTURAL checks only.\n` +
				`   Employer/personal-framing detection is OFF. Set BLOG_AUDIT_TERMS to the private list.\n`,
		);
	}

	for (const report of failing) {
		console.log(`\n❌ ${report.file}${report.draft ? ' (draft)' : ''}`);
		for (const f of report.findings) console.log(`   [${f.gate} ${f.rule}] ${f.detail}`);
	}

	const g1 = failing.reduce((n, r) => n + r.findings.filter((f) => f.gate === 'G1').length, 0);
	const g2 = failing.reduce((n, r) => n + r.findings.filter((f) => f.gate === 'G2').length, 0);

	console.log(
		`\n📊 ${inScope.length} posts audited · ${failing.length} failing · ` +
			`${g1} G1 findings · ${g2} G2 findings`,
	);

	process.exit(failing.length > 0 ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
