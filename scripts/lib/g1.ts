/**
 * G1 Generalization gate — the one implementation.
 *
 * Shared by scripts/audit-posts.ts (Node/tsx, audits published posts) and
 * scripts/sync-from-3b.ts (Deno, refuses a post before it is written). Keep this
 * file dependency-free — no node:, npm or Deno APIs — so both runtimes import it.
 * Loading the private deny list stays in each caller.
 */

export type Severity = 'G1' | 'G2';

export interface Finding {
	gate: Severity;
	rule: string;
	detail: string;
}

export interface Terms {
	employer: { terms: string[] };
	internalIdentifiers: { terms: string[] };
	companyRepoOwners: { owners: string[] };
	personalOwners: { owners: string[] };
	selfDomains: { domains: string[] };
	personalFraming: { terms: string[] };
	namedHumans: { terms: string[] };
	benignWords: { terms: string[] };
}

export const EMPTY_TERMS: Terms = {
	employer: { terms: [] },
	internalIdentifiers: { terms: [] },
	companyRepoOwners: { owners: [] },
	personalOwners: { owners: ['brandonwie'] },
	selfDomains: { domains: ['brandonwie.dev'] },
	personalFraming: { terms: [] },
	namedHumans: { terms: [] },
	benignWords: { terms: [] },
};

/** The list field of each section. */
const TERM_FIELDS: { [K in keyof Terms]: string } = {
	employer: 'terms',
	internalIdentifiers: 'terms',
	companyRepoOwners: 'owners',
	personalOwners: 'owners',
	selfDomains: 'domains',
	personalFraming: 'terms',
	namedHumans: 'terms',
	benignWords: 'terms',
};

/** Non-detector sections that may be absent; EMPTY_TERMS holds their defaults. */
const DEFAULTED_SECTIONS = new Set<keyof Terms>(['personalOwners', 'selfDomains']);

/**
 * Validate a parsed deny list. Throws when a detector section or its string
 * array is missing or malformed: a merge over EMPTY_TERMS would otherwise turn
 * `{}` into a "loaded" list with detection silently OFF. Only an absent file
 * may fall back to EMPTY_TERMS, and only behind --allow-missing-terms. The two
 * non-detector sections keep their defaults when absent and are type-checked
 * when present.
 */
export function parseTerms(raw: unknown, source: string): Terms {
	const bad: string[] = [];
	const isObject = typeof raw === 'object' && raw !== null && !Array.isArray(raw);
	if (!isObject) bad.push('(root is not an object)');
	const obj = (isObject ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
	const terms = { ...EMPTY_TERMS } as Record<string, unknown>;
	for (const [section, field] of Object.entries(TERM_FIELDS) as [keyof Terms, string][]) {
		if (obj[section] === undefined && DEFAULTED_SECTIONS.has(section)) continue;
		const list = obj[section]?.[field];
		if (!Array.isArray(list) || !list.every((t) => typeof t === 'string')) {
			bad.push(`${section}.${field}`);
			continue;
		}
		terms[section] = obj[section];
	}
	if (bad.length > 0) {
		throw new Error(
			`Deny list at ${source} is malformed: ${bad.join(', ')} must be a string array. Fix the file; --allow-missing-terms does not cover a malformed list.`,
		);
	}
	return terms as unknown as Terms;
}

/**
 * Tags that exist for internal filing and must never ship. The blog renders tags
 * on cards and post pages, so a `work` tag publicly labels a post as
 * employer-derived content — a G1 leak that lives in metadata, where a prose
 * review never looks. sync-from-3b.ts filters these on the way in; this catches
 * a hand-edit that puts one back.
 */
export const INTERNAL_ONLY_TAGS = new Set([
	'work',
	'company',
	'internal',
	'private',
	'confidential',
]);

export function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matching boundary for a Hangul term: ANY occurrence is a hit, except inside
 * a word named in the private list's `benignWords`.
 *
 * Korean is agglutinative — a name takes an open-ended set of endings
 * (particles, copulas, conversational forms), so an accept-list of suffixes
 * always misses one, and a miss is a leak. Detection is therefore the default
 * and clearing is the exception. The cost is a review prompt when a term sits
 * inside an unlisted unrelated word; the fix is one entry in the private list.
 * Benign words live there, never here: a public exclusion would point at the
 * term it exists to protect.
 */
export function hangulHit(haystack: string, term: string, benign: string[]): boolean {
	const needle = term.toLowerCase();
	let text = haystack.toLowerCase();
	for (const word of benign) {
		const w = word.toLowerCase();
		if (w.includes(needle)) text = text.split(w).join(' ');
	}
	return text.includes(needle);
}

/** Whole-word-ish match that still catches `moba-works` and `moba_production`. */
export function wordHit(haystack: string, term: string, benign: string[] = []): boolean {
	if (/[가-힣]/.test(term)) return hangulHit(haystack, term, benign);
	return new RegExp(`(^|[^a-z0-9])${escapeRe(term.toLowerCase())}([^a-z0-9]|$)`, 'i').test(
		haystack,
	);
}

export function extractUrls(text: string): string[] {
	return [...text.matchAll(/https?:\/\/[^\s'"`)\]>,]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ''));
}

export function hostOf(url: string): string {
	try {
		return new URL(url).host.toLowerCase();
	} catch {
		return '';
	}
}

// ---------------------------------------------------------------- G1

export function auditG1(fm: Record<string, unknown>, body: string, terms: Terms): Finding[] {
	const findings: Finding[] = [];
	const title = String(fm.title ?? '');
	const description = String(fm.description ?? '');
	const frame = `${title}\n${description}\n${body.split('\n').slice(0, 12).join('\n')}`;
	const whole = `${title}\n${description}\n${body}`;
	const lower = whole.toLowerCase();
	const benign = terms.benignWords.terms;

	for (const term of terms.employer.terms) {
		if (wordHit(lower, term, benign)) {
			findings.push({
				gate: 'G1',
				rule: 'employer-name',
				detail: `mentions "${term}" — cut the name, describe the system generically`,
			});
		}
	}

	for (const term of terms.internalIdentifiers.terms) {
		if (lower.includes(term.toLowerCase())) {
			findings.push({
				gate: 'G1',
				rule: 'internal-identifier',
				detail: `contains internal identifier "${term}" — replace with {PLACEHOLDER}`,
			});
		}
	}

	for (const name of terms.namedHumans.terms) {
		if (wordHit(whole, name, benign)) {
			findings.push({
				gate: 'G1',
				rule: 'named-human',
				detail: `names an individual ("${name}") — attribute to a role instead`,
			});
		}
	}

	for (const term of terms.personalFraming.terms) {
		if (wordHit(frame.toLowerCase(), term, benign)) {
			findings.push({
				gate: 'G1',
				rule: 'personal-framing',
				detail: `title/description/hook framed by personal context ("${term}") — keep the technical claim only`,
			});
		}
	}

	const companyOwners = new Set(terms.companyRepoOwners.owners.map((o) => o.toLowerCase()));

	for (const url of extractUrls(whole)) {
		const m = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/i.exec(url);
		if (!m) continue;
		const [, owner, repo] = m;
		if (companyOwners.has(owner.toLowerCase())) {
			findings.push({
				gate: 'G1',
				rule: 'company-repo-link',
				detail: `links a company-org repo (${owner}/${repo}) — delete the link, restate the finding in prose`,
			});
		}
		// Personal-project links are intentionally NOT flagged here: they are
		// attribution, not leakage. They just never satisfy G2 (see auditG2).
	}

	for (const tag of (fm.tags as string[] | undefined) ?? []) {
		if (INTERNAL_ONLY_TAGS.has(String(tag).trim().toLowerCase())) {
			findings.push({
				gate: 'G1',
				rule: 'internal-tag',
				detail: `frontmatter carries the internal-only tag "${tag}" — it renders publicly on cards and post pages`,
			});
		}
	}

	// Ticket-tracker keys: ABC-1234 style, excluding common false friends.
	const ticket = /(^|[^A-Za-z0-9])([A-Z]{2,6}-\d{2,6})([^A-Za-z0-9]|$)/g;
	const seen = new Set<string>();
	for (const m of whole.matchAll(ticket)) {
		const key = m[2];
		if (/^(RFC|ISO|UTF|AES|SHA|HTTP|IPV|PEP|CVE|ADR|GPT|LTS)-/i.test(key)) continue;
		if (seen.has(key)) continue;
		seen.add(key);
		findings.push({
			gate: 'G1',
			rule: 'ticket-id',
			detail: `looks like an internal tracker key (${key}) — delete it`,
		});
	}

	return findings;
}
