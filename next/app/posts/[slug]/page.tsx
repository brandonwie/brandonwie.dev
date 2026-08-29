import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { loadPost, type PostFrontmatter } from '@/content/posts';
import {
	SITE_AUTHOR,
	SITE_NAME,
	SITE_URL,
	absoluteUrl,
	heroImage,
	localeCode,
} from '../../../../src/lib/seo';

/**
 * The representative English article — Slice 1's content proof.
 *
 * `generateStaticParams` deliberately returns ONE slug. plan.md § Slice 1 asks
 * for "one representative EN/KO article", and widening this to all 167 English
 * posts is Slice 3's surface port, not a config change smuggled in here: every
 * page it emitted would report the same shell-less content differences and bury
 * the one route this milestone is accountable for.
 */
const SLICE_1_SLUGS = ['giscus-sveltekit-integration'];

export function generateStaticParams(): Array<{ slug: string }> {
	return SLICE_1_SLUGS.map((slug) => ({ slug }));
}

/**
 * Head metadata for a post — the SvelteKit `<svelte:head>` block in
 * `PostDetail.svelte:152-197`, expressed through the Metadata API.
 *
 * `src/lib/seo.ts` is imported from the SvelteKit app rather than copied, the
 * same rule the markdown pipeline follows for its two portable remark plugins:
 * while both stacks exist, neither may drift.
 */
export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const { slug } = await params;
	const post = await loadPost(slug, 'en');
	if (!post) return {};

	const meta = post.frontmatter;
	const englishUrl = absoluteUrl(`/posts/${slug}`);
	const koreanUrl = absoluteUrl(`/ko/posts/${slug}`);
	const ogImageUrl = `${SITE_URL}/og/${slug}.png`;

	return {
		title: `${meta.title} | ${SITE_NAME}`,
		description: meta.description,
		alternates: {
			canonical: englishUrl,
			languages: {
				en: englishUrl,
				// hreflang="ko" is emitted only when the translation exists, matching
				// PostDetail's `{#if hasKoreanTranslation}` guard. Advertising a
				// translation that 404s is worse than advertising none.
				...(post.hasKoreanTranslation ? { ko: koreanUrl } : {}),
				'x-default': englishUrl,
			},
		},
		openGraph: {
			title: meta.title,
			description: meta.description,
			type: 'article',
			siteName: SITE_NAME,
			url: englishUrl,
			images: [{ url: ogImageUrl, width: 1200, height: 630 }],
			locale: localeCode('en'),
			alternateLocale: post.hasKoreanTranslation ? [localeCode('ko')] : [],
			publishedTime: String(meta.date),
			modifiedTime: meta.updated ? String(meta.updated) : undefined,
			authors: [SITE_AUTHOR],
			tags: meta.tags,
		},
		twitter: {
			card: 'summary_large_image',
			title: meta.title,
			description: meta.description,
			images: [ogImageUrl],
			creator: '@BrandonWie',
		},
	};
}

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
function articleJsonLd(slug: string, meta: PostFrontmatter): string {
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
		inLanguage: 'en-US',
		keywords: meta.tags.join(', '),
	});
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const post = await loadPost(slug, 'en');
	if (!post) notFound();

	const meta = post.frontmatter;

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: articleJsonLd(slug, meta) }}
			/>
			<article>
				{/* The hero carries an empty alt deliberately: it is decorative and the
				    headline immediately below already names the post. The comparator
				    records `alt` precisely so a silent loss of alt text on a
				    CONTENT image is visible; this one is empty on both sides. */}
				<img src={heroImage(slug)} alt="" width={2000} height={800} />
				<h1>{meta.title}</h1>
				<div className="prose-terminal">{post.content}</div>
			</article>
		</>
	);
}
