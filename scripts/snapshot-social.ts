/**
 * scripts/snapshot-social.ts — Sanitizing generator for the public /feed hub.
 *
 * Projects the PRIVATE 3B social-post ledger
 * (~/dev/personal/3b/personal/brandon/social-posts.jsonl) into
 * src/lib/data/social-feed.json, consumed at build time by the prerendered
 * /feed route. Mirrors the snapshot-3b-system.ts posture: this file is the
 * single sanitizing chokepoint (generator → committed JSON → prerendered
 * page; ADR-053 Phase 6 / social-hub H3).
 *
 * Privacy is the central concern (3B social-publishing.md §6): the ledger is
 * `privacy: private`. Emission is a STRICT ALLOWLIST — a field not listed in
 * toPublicEntry() is dropped, so future private ledger fields never leak.
 * NEVER emitted: agent, session_id, notes, migration, ts, status, raw
 * source_ref (a derived blog_slug is emitted ONLY when it matches a published
 * blog post file).
 *
 * Ledger semantics (3B social-publishing.md §4): append-only with
 * supersession — the LAST record per (post_id, platform, lang) wins; only
 * status "published" records are projected. Cross-links are COMPUTED here at
 * build (no stored backlinks).
 *
 * Usage:
 *   deno run --allow-read --allow-write --allow-env scripts/snapshot-social.ts
 *   deno run --allow-read --allow-env scripts/snapshot-social.ts --check
 *
 * Exit codes: 0 = written / clean; 1 = ledger missing or malformed line
 * (loud — never emit a partial feed); 3 = --check drift (regenerate needed).
 */

import { join } from 'https://deno.land/std@0.220.0/path/mod.ts';

// Without HOME every default path below is meaningless, and join() would throw a
// TypeError that names neither variable. Fail on the real cause instead.
const HOME = Deno.env.get('HOME');
if (!HOME) {
	console.error(
		'Error: HOME is not set. Set THREEB_PATH and BLOG_ROOT to absolute paths, or run with HOME set.',
	);
	Deno.exit(1);
}
// C3 (dual-runtime evidence): 3B moved from ~/dev/personal/3b to ~/dev/3b, so the
// legacy default no longer exists on a current machine. Honor THREEB_PATH, then
// fall back to the first existing root: ~/dev/3b, then the legacy path.
function resolveThreeBRoot(): string {
	const fromEnv = Deno.env.get('THREEB_PATH');
	if (fromEnv) return fromEnv;
	const candidates = [join(HOME, 'dev', '3b'), join(HOME, 'dev', 'personal', '3b')];
	for (const candidate of candidates) {
		try {
			if (Deno.statSync(candidate).isDirectory) return candidate;
		} catch {
			/* not this one */
		}
	}
	return candidates[0];
}
const LEDGER = join(resolveThreeBRoot(), 'personal', 'brandon', 'social-posts.jsonl');
/**
 * The blog checkout this script writes into. BLOG_ROOT wins; the default is the
 * usual location. A default that no longer exists is the same class of bug as
 * the pre-move 3B path, so it is reported here rather than surfacing as a
 * confusing write into a directory nobody has.
 *
 * Deliberately asymmetric with resolveThreeBRoot(), which tries a second
 * candidate: 3B has actually moved and both locations are in use, so
 * auto-discovery earns its keep there. The blog has one known location, and
 * guessing a second would only delay a clear error. If it ever moves, set
 * BLOG_ROOT — the message names the path that was tried.
 */
function resolveBlogRoot(): string {
	const fromEnv = Deno.env.get('BLOG_ROOT');
	if (fromEnv) return fromEnv;
	const fallback = join(HOME, 'dev', 'personal', 'brandonwie.dev');
	try {
		if (Deno.statSync(fallback).isDirectory) return fallback;
	} catch {
		/* reported below */
	}
	console.error(
		`Error: BLOG_ROOT is not set and the default blog checkout does not exist: ${fallback}. Set BLOG_ROOT=/absolute/path/to/brandonwie.dev.`,
	);
	Deno.exit(1);
}
const BLOG_ROOT = resolveBlogRoot();
const POSTS_DIR = join(BLOG_ROOT, 'src', 'content', 'posts', 'en');
const OUT = join(BLOG_ROOT, 'src', 'lib', 'data', 'social-feed.json');
const LINKS_OUT = join(BLOG_ROOT, 'src', 'lib', 'data', 'social-links.json');

interface LedgerRecord {
	date: string;
	post_id: string;
	platform: string;
	lang: string;
	format: string;
	url: string;
	topic: string;
	source_ref: string | null;
	cluster_id: string | null;
	canonical_url: string | null;
	status: string;
}

export interface FeedEntry {
	post_id: string;
	date: string;
	platform: string;
	lang: string;
	format: string;
	topic: string;
	url: string;
	is_canonical: boolean;
}

export interface FeedCampaign {
	cluster_id: string | null;
	canonical_url: string | null;
	blog_slug: string | null;
	topic: string;
	date: string;
	entries: FeedEntry[];
}

export interface SocialLink {
	url: string;
	label: string;
}

export type SocialLinksBySlug = Record<string, SocialLink[]>;

function readLedger(path: string): LedgerRecord[] {
	let raw: string;
	try {
		raw = Deno.readTextFileSync(path);
	} catch (e) {
		console.error(`ERROR cannot read ledger at ${path}: ${(e as Error).message}`);
		Deno.exit(1);
	}
	const records: LedgerRecord[] = [];
	const lines = raw.split('\n').filter((l) => l.trim().length > 0);
	for (const [i, line] of lines.entries()) {
		try {
			records.push(JSON.parse(line) as LedgerRecord);
		} catch {
			// Fail loud — a malformed ledger line means the projection would be
			// silently incomplete (no silent fallback).
			console.error(`ERROR malformed ledger line ${i + 1}`);
			Deno.exit(1);
		}
	}
	return records;
}

/** Last record per (post_id, platform, lang) wins — supersession collapse. */
function collapse(records: LedgerRecord[]): LedgerRecord[] {
	const byKey = new Map<string, LedgerRecord>();
	for (const r of records) {
		byKey.set(`${r.post_id}\u0000${r.platform}\u0000${r.lang}`, r);
	}
	return [...byKey.values()];
}

function publishedBlogSlugs(dir: string): Set<string> {
	const slugs = new Set<string>();
	try {
		for (const category of Deno.readDirSync(dir)) {
			if (!category.isDirectory) continue;
			for (const file of Deno.readDirSync(join(dir, category.name))) {
				if (file.isFile && file.name.endsWith('.md')) {
					slugs.add(file.name.replace(/\.md$/, ''));
				}
			}
		}
	} catch (e) {
		console.error(`ERROR cannot scan posts dir ${dir}: ${(e as Error).message}`);
		Deno.exit(1);
	}
	return slugs;
}

/**
 * Derive the blog cross-link slug — emitted ONLY when it matches a real
 * published post file (the join is computed, never trusted from the ledger).
 */
function deriveBlogSlug(r: LedgerRecord, slugs: Set<string>): string | null {
	const candidates: string[] = [];
	if (r.source_ref && /^[a-z0-9][a-z0-9-]*$/.test(r.source_ref)) {
		candidates.push(r.source_ref);
	}
	if (r.cluster_id) {
		candidates.push(r.cluster_id.replace(/^\d{4}-\d{2}-\d{2}-/, ''));
	}
	for (const c of candidates) {
		if (slugs.has(c)) return c;
	}
	return null;
}

const PLATFORM_LABEL: Record<string, string> = {
	linkedin: 'LinkedIn',
	x: 'X',
	threads: 'Threads',
	mastodon: 'Mastodon',
	bluesky: 'Bluesky',
};

/** STRICT ALLOWLIST — the privacy chokepoint. Add fields deliberately. */
function toPublicEntry(r: LedgerRecord): FeedEntry {
	return {
		post_id: r.post_id,
		date: r.date,
		platform: r.platform,
		lang: r.lang,
		format: r.format,
		topic: r.topic,
		url: r.url,
		is_canonical: r.canonical_url != null && r.url === r.canonical_url,
	};
}

function socialLinkLabel(entry: FeedEntry): string {
	if (entry.platform === 'x' && entry.post_id.endsWith('-x-article')) {
		return 'X Article';
	}
	return PLATFORM_LABEL[entry.platform] ?? entry.platform;
}

export function buildSocialLinksBySlug(campaigns: FeedCampaign[]): SocialLinksBySlug {
	const bySlug = new Map<string, SocialLink[]>();
	for (const campaign of campaigns) {
		if (!campaign.blog_slug) continue;
		const links = bySlug.get(campaign.blog_slug) ?? [];
		links.push(
			...campaign.entries.map((entry) => ({
				url: entry.url,
				label: socialLinkLabel(entry),
			})),
		);
		bySlug.set(campaign.blog_slug, links);
	}
	return Object.fromEntries([...bySlug.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function buildFeed(records: LedgerRecord[], slugs: Set<string>): FeedCampaign[] {
	const live = collapse(records).filter((r) => r.status === 'published');
	const groups = new Map<string, { records: LedgerRecord[] }>();
	for (const r of live) {
		// Standalone (pre-campaign) records group by their own post_id.
		const key = r.cluster_id ?? `standalone:${r.post_id}`;
		if (!groups.has(key)) groups.set(key, { records: [] });
		groups.get(key)!.records.push(r);
	}
	const campaigns: FeedCampaign[] = [];
	for (const { records: rs } of groups.values()) {
		rs.sort((a, b) => a.post_id.localeCompare(b.post_id) || a.platform.localeCompare(b.platform));
		const canonical = rs.find((r) => r.canonical_url != null && r.url === r.canonical_url) ?? rs[0];
		const blogSlug = rs.map((r) => deriveBlogSlug(r, slugs)).find((s) => s != null) ?? null;
		campaigns.push({
			cluster_id: rs[0].cluster_id,
			canonical_url: rs[0].canonical_url,
			blog_slug: blogSlug,
			topic: canonical.topic,
			date: rs.reduce((max, r) => (r.date > max ? r.date : max), rs[0].date),
			entries: rs.map(toPublicEntry),
		});
	}
	campaigns.sort(
		(a, b) =>
			b.date.localeCompare(a.date) || (a.cluster_id ?? '').localeCompare(b.cluster_id ?? ''),
	);
	return campaigns;
}

function main() {
	const checkOnly = Deno.args.includes('--check');
	const campaigns = buildFeed(readLedger(LEDGER), publishedBlogSlugs(POSTS_DIR));
	const socialLinks = buildSocialLinksBySlug(campaigns);
	// No timestamp on purpose — output is deterministic for a given ledger +
	// posts tree, so regeneration is idempotent and --check is byte-exact.
	const nextFeed = JSON.stringify({ campaigns }, null, '\t') + '\n';
	const nextLinks = JSON.stringify(socialLinks, null, '\t') + '\n';

	if (checkOnly) {
		let currentFeed = '';
		try {
			currentFeed = Deno.readTextFileSync(OUT);
		} catch {
			// missing output counts as drift
		}

		let currentLinks = '';
		try {
			currentLinks = Deno.readTextFileSync(LINKS_OUT);
		} catch {
			// missing output counts as drift
		}

		let drift = false;
		if (currentFeed !== nextFeed) {
			console.error('social-feed snapshot DRIFT — run: pnpm snapshot:social');
			drift = true;
		}
		if (currentLinks !== nextLinks) {
			console.error('social-links snapshot DRIFT — run: pnpm snapshot:social');
			drift = true;
		}
		if (drift) Deno.exit(3);
		console.log('social snapshots clean.');
		Deno.exit(0);
	}

	Deno.writeTextFileSync(OUT, nextFeed);
	Deno.writeTextFileSync(LINKS_OUT, nextLinks);
	console.log(`✅ Wrote ${OUT} (${campaigns.length} campaigns)`);
	console.log(`✅ Wrote ${LINKS_OUT} (${Object.keys(socialLinks).length} slugs)`);
}

if (import.meta.main) {
	main();
}
