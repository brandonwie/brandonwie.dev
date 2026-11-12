import type { Metadata } from 'next';

import type { Locale } from '@/i18n/locale';
import * as m from '../paraglide/messages.js';
import { getAboutContent } from '../../../src/lib/data/about';
import {
	DEFAULT_OG_IMAGE,
	SITE_AUTHOR,
	SITE_NAME,
	SITE_URL,
	SOCIAL,
	absoluteUrl,
	localeCode,
} from '../../../src/lib/seo';

export function homeJsonLd(locale: Locale): string {
	return JSON.stringify([
		{
			'@context': 'https://schema.org',
			'@type': 'WebSite',
			name: SITE_NAME,
			url: SITE_URL,
			description: m.site_description({}, { locale }),
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
			jobTitle: 'Full-stack AI Engineer',
			worksFor: {
				'@type': 'Organization',
				name: 'Playtag Inc.',
			},
			sameAs: [SOCIAL.github, SOCIAL.linkedin, SOCIAL.x],
		},
	]);
}

export interface StudySeoMetadataOptions {
	pageTitle: string;
	description: string;
	/** The English path, `/` for the home page. The Korean twin is `/ko` plus this path. */
	basePath: string;
	locale?: Locale;
	twitterCard?: 'summary' | 'summary_large_image';
}

/**
 * Metadata for a page that exists in both locales: canonical URL, hreflang
 * alternates, Open Graph and Twitter Card. Every page but a post uses it.
 */
export function generateStudySeoMetadata({
	pageTitle,
	description,
	basePath,
	locale = 'en',
	twitterCard = 'summary_large_image',
}: StudySeoMetadataOptions): Metadata {
	const path = basePath === '/' ? '' : basePath;
	const enUrl = absoluteUrl(path || '/');
	const koUrl = absoluteUrl(`/ko${path}`);
	const canonicalUrl = locale === 'ko' ? koUrl : enUrl;

	return {
		title: pageTitle,
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
			title: pageTitle,
			description,
			url: canonicalUrl,
			images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
			locale: localeCode(locale),
			alternateLocale: [localeCode(locale === 'ko' ? 'en' : 'ko')],
		},
		twitter: {
			card: twitterCard,
			title: pageTitle,
			description,
			images: [DEFAULT_OG_IMAGE],
			creator: '@BrandonWie',
		},
	};
}

export function generateHomeMetadata(locale: Locale): Metadata {
	return generateStudySeoMetadata({
		pageTitle: m.site_title({}, { locale }),
		description: m.site_description({}, { locale }),
		basePath: '/',
		locale,
	});
}

export function generateAboutMetadata(locale: Locale): Metadata {
	const content = getAboutContent(locale);
	return generateStudySeoMetadata({
		pageTitle: `${content.metaTitle} | Brandon Wie`,
		description: content.metaDescription,
		basePath: '/about',
		locale,
		twitterCard: 'summary',
	});
}

export function generateProjectsMetadata(locale: Locale): Metadata {
	return generateStudySeoMetadata({
		pageTitle: `${m.projects_meta_title({}, { locale })} | Brandon Wie`,
		description: m.projects_meta_description({}, { locale }),
		basePath: '/projects',
		locale,
	});
}

export function generateContactMetadata(locale: Locale): Metadata {
	return generateStudySeoMetadata({
		pageTitle: `${m.contact_meta_title({}, { locale })} | Brandon Wie`,
		description: m.contact_meta_description({}, { locale }),
		basePath: '/contact',
		locale,
	});
}

export function generateSystemMetadata(locale: Locale): Metadata {
	return generateStudySeoMetadata({
		pageTitle: `${m.system_3b_title({}, { locale })} | Brandon Wie`,
		description: m.system_3b_meta_description({}, { locale }),
		basePath: '/system',
		locale,
	});
}
