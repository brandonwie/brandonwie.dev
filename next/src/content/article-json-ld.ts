import type { Locale, PostFrontmatter } from './posts';
import { SITE_AUTHOR, SITE_URL, absoluteUrl } from '../../../src/lib/seo';

function articlePath(slug: string, locale: Locale): string {
	return locale === 'ko' ? `/ko/posts/${slug}` : `/posts/${slug}`;
}

export function articleJsonLd(slug: string, meta: PostFrontmatter, locale: Locale): string {
	return JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: meta.title,
		description: meta.description,
		datePublished: meta.date,
		dateModified: meta.updated || meta.date,
		image: `${SITE_URL}/og/${slug}.png`,
		author: { '@type': 'Person', name: SITE_AUTHOR, url: SITE_URL },
		mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(articlePath(slug, locale)) },
		publisher: { '@type': 'Person', name: SITE_AUTHOR, url: SITE_URL },
		inLanguage: locale === 'ko' ? 'ko-KR' : 'en-US',
		keywords: meta.tags.join(', '),
	}).replace(/</g, '\\u003c');
}
