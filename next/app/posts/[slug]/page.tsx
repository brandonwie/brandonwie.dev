import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { loadPost } from '@/content/posts';
import { heroBlockHtml } from '@/content/hero';
import { SITE_AUTHOR, SITE_NAME, SITE_URL, absoluteUrl, localeCode } from '../../../../src/lib/seo';
import { articleJsonLd } from './article-json-ld';

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

/**
 * A frontmatter date as the head wants it: ISO-8601, or the source string.
 *
 * gray-matter hands back a `Date` for an unquoted YAML date and a string for a
 * quoted one, and `String(date)` is the runtime's LOCALE form -- the first port
 * shipped `article:published_time` as
 * `Wed Jan 28 2026 09:00:00 GMT+0900 (Korean Standard Time)`, which is both
 * unparseable to a crawler and dependent on the timezone of whichever machine
 * ran the build. `Date.prototype.toISOString` is what SvelteKit's
 * `date.toISOString()` produced, and it is timezone-independent.
 *
 * A string passes through untouched: `updated` is quoted in the source, so the
 * baseline carries the bare `YYYY-MM-DD` and reformatting it would be a
 * difference, not a fix.
 */
function headDate(value: string | Date | undefined): string | undefined {
	if (value === undefined) return undefined;
	return value instanceof Date ? value.toISOString() : String(value);
}

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
			publishedTime: headDate(meta.date),
			modifiedTime: headDate(meta.updated),
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

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const post = await loadPost(slug, 'en');
	if (!post) notFound();

	const meta = post.frontmatter;

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: articleJsonLd(slug, meta, post.locale) }}
			/>
			<article>
				<div dangerouslySetInnerHTML={{ __html: heroBlockHtml(slug) }} />
				<h1>{meta.title}</h1>
				<div className="prose-terminal">{post.content}</div>
			</article>
		</>
	);
}
