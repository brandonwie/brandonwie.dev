import type { Locale, PostFrontmatter } from '@/content/posts';
import { SITE_AUTHOR, SITE_URL, absoluteUrl } from '../../../../src/lib/seo';

/**
 * JSON-LD Article schema.
 *
 * Key ORDER matters and is not cosmetic: the parity comparator parses both
 * sides and compares the resulting objects as serialized JSON, so a reordered
 * object is a difference. This reproduces `PostDetail.svelte:118-141` field for
 * field, in the same order.
 *
 * `datePublished` and `dateModified` are stringified rather than reformatted.
 * The source frontmatter writes `date` unquoted and `updated` quoted, so YAML
 * hands back a `Date` and a string respectively, and the baseline carries an
 * ISO timestamp next to a bare `YYYY-MM-DD`. Normalising them would be tidier
 * and wrong.
 */
export function articleJsonLd(slug: string, meta: PostFrontmatter, contentLocale: Locale): string {
	return JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: meta.title,
		description: meta.description,
		datePublished: meta.date,
		dateModified: meta.updated || meta.date,
		image: `${SITE_URL}/og/${slug}.png`,
		author: { '@type': 'Person', name: SITE_AUTHOR, url: SITE_URL },
		mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(`/posts/${slug}`) },
		publisher: { '@type': 'Person', name: SITE_AUTHOR, url: SITE_URL },
		inLanguage: contentLocale === 'ko' ? 'ko-KR' : 'en-US',
		keywords: meta.tags.join(', '),
	}).replace(/</g, '\\u003c');
}
