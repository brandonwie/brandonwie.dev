import type { Metadata } from 'next';

import type { Locale } from '@/i18n/locale';
import {
	DEFAULT_OG_IMAGE,
	SITE_AUTHOR,
	SITE_NAME,
	SITE_URL,
	absoluteUrl,
	localeCode,
} from '../../../src/lib/seo';

export function homeJsonLd(locale: Locale): string {
	const pageDescription =
		locale === 'ko'
			? '소프트웨어 엔지니어링 인사이트, 튜토리얼, 배움'
			: 'Software engineering insights, tutorials, and learnings';

	return JSON.stringify([
		{
			'@context': 'https://schema.org',
			'@type': 'WebSite',
			name: SITE_NAME,
			url: SITE_URL,
			description: pageDescription,
			inLanguage: locale === 'ko' ? 'ko-KR' : 'en-US',
			publisher: {
				'@type': 'Person',
				name: SITE_AUTHOR,
				url: SITE_URL,
			},
		},
		{
			'@context': 'https://schema.org',
			'@type': 'Person',
			name: SITE_AUTHOR,
			url: SITE_URL,
			jobTitle: 'Software Engineer',
			sameAs: [
				'https://github.com/brandonwie',
				'https://linkedin.com/in/brandonwie',
				'https://x.com/BrandonWie',
			],
		},
	]);
}

export function generateHomeMetadata(locale: Locale): Metadata {
	const title =
		locale === 'ko' ? 'Brandon Wie | 소프트웨어 엔지니어' : 'Brandon Wie | Software Engineer';
	const description =
		locale === 'ko'
			? '소프트웨어 엔지니어링 인사이트, 튜토리얼, 배움'
			: 'Software engineering insights, tutorials, and learnings';
	const canonicalUrl = absoluteUrl(locale === 'ko' ? '/ko' : '/');
	const enUrl = absoluteUrl('/');
	const koUrl = absoluteUrl('/ko');

	return {
		title,
		description,
		alternates: {
			canonical: canonicalUrl,
			languages: {
				en: enUrl,
				ko: koUrl,
				'x-default': enUrl,
			},
		},
		openGraph: {
			type: 'website',
			siteName: SITE_NAME,
			title,
			description,
			url: canonicalUrl,
			images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
			locale: localeCode(locale),
			alternateLocale: [localeCode(locale === 'ko' ? 'en' : 'ko')],
		},
		twitter: {
			card: 'summary_large_image',
			title,
			description,
			images: [DEFAULT_OG_IMAGE],
			creator: '@BrandonWie',
		},
	};
}

export function postsListJsonLd(locale: Locale): string {
	const pageTitle = locale === 'ko' ? '모든 글 | Brandon Wie' : 'All Posts | Brandon Wie';
	const pageDescription =
		locale === 'ko' ? 'Brandon Wie의 모든 블로그 글' : 'All blog posts by Brandon Wie';
	const canonicalHref = absoluteUrl(locale === 'ko' ? '/ko/posts' : '/posts');

	return JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		name: pageTitle,
		description: pageDescription,
		url: canonicalHref,
		inLanguage: locale === 'ko' ? 'ko-KR' : 'en-US',
	});
}

export function generatePostsListMetadata(locale: Locale): Metadata {
	const title = locale === 'ko' ? '모든 글 | Brandon Wie' : 'All Posts | Brandon Wie';
	const description =
		locale === 'ko' ? 'Brandon Wie의 모든 블로그 글' : 'All blog posts by Brandon Wie';
	const canonicalUrl = absoluteUrl(locale === 'ko' ? '/ko/posts' : '/posts');
	const enUrl = absoluteUrl('/posts');
	const koUrl = absoluteUrl('/ko/posts');

	return {
		title,
		description,
		alternates: {
			canonical: canonicalUrl,
			languages: {
				en: enUrl,
				ko: koUrl,
				'x-default': enUrl,
			},
		},
		openGraph: {
			type: 'website',
			siteName: SITE_NAME,
			title,
			description,
			url: canonicalUrl,
			images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
			locale: localeCode(locale),
			alternateLocale: [localeCode(locale === 'ko' ? 'en' : 'ko')],
		},
		twitter: {
			card: 'summary_large_image',
			title,
			description,
			images: [DEFAULT_OG_IMAGE],
		},
	};
}

export function generateTagsMetadata(locale: Locale): Metadata {
	const title = 'Tags | Brandon Wie';
	const description =
		"Browse every topic on the blog — all tags across Brandon Wie's posts, with post counts and links.";
	const canonicalUrl = absoluteUrl(locale === 'ko' ? '/ko/tags' : '/tags');
	const enUrl = absoluteUrl('/tags');
	const koUrl = absoluteUrl('/ko/tags');

	return {
		title,
		description,
		alternates: {
			canonical: canonicalUrl,
			languages: {
				en: enUrl,
				ko: koUrl,
				'x-default': enUrl,
			},
		},
		openGraph: {
			type: 'website',
			siteName: SITE_NAME,
			title,
			description,
			url: canonicalUrl,
			images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
			locale: localeCode(locale),
			alternateLocale: [localeCode(locale === 'ko' ? 'en' : 'ko')],
		},
		twitter: {
			card: 'summary_large_image',
			title,
			description,
			images: [DEFAULT_OG_IMAGE],
		},
	};
}

export function generateSearchMetadata(locale: Locale): Metadata {
	const title = `${locale === 'ko' ? '검색' : 'Search'} | Brandon Wie`;
	const description =
		locale === 'ko'
			? 'Brandon Wie의 개인 블로그 — 소프트웨어, 시스템, 엔지니어링.'
			: 'Personal blog by Brandon Wie — software, systems, and engineering.';
	const canonicalUrl = absoluteUrl(locale === 'ko' ? '/ko/search' : '/search');
	const enUrl = absoluteUrl('/search');
	const koUrl = absoluteUrl('/ko/search');

	return {
		title,
		description,
		robots: 'noindex,follow',
		alternates: {
			canonical: canonicalUrl,
			languages: {
				en: enUrl,
				ko: koUrl,
				'x-default': enUrl,
			},
		},
		openGraph: {
			type: 'website',
			siteName: SITE_NAME,
			title,
			description,
			url: canonicalUrl,
			images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
			locale: localeCode(locale),
			alternateLocale: [localeCode(locale === 'ko' ? 'en' : 'ko')],
		},
		twitter: {
			card: 'summary_large_image',
			title,
			description,
			images: [DEFAULT_OG_IMAGE],
		},
	};
}
