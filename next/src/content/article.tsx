import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ArticleKeyNavigation } from '@/components/ArticleKeyNavigation';
import { BackToPosts } from '@/components/BackToPosts';
import { CodeCopy } from '@/components/CodeCopy';
import { Giscus } from '@/components/Giscus';
import { PostCopyButton } from '@/components/PostCopyButton';
import { ReadingProgress } from '@/components/ReadingProgress';
import { TableOfContents } from '@/components/TableOfContents';
import socialLinksData from '../../../src/lib/data/social-links.json';
import { SITE_AUTHOR, SITE_NAME, SITE_URL, absoluteUrl, localeCode } from '../../../src/lib/seo';
import { articlePath, sourceDate } from './article-contract';
import { articleCopy } from '../i18n/copy';
import { articleJsonLd } from './article-json-ld';
import { heroBlockHtml } from './hero';
import { findPostFile, listPostSlugs, loadPost, type Locale } from './posts';

interface SocialLink {
	url: string;
	label: string;
}

const socialLinksBySlug = socialLinksData as Record<string, SocialLink[] | undefined>;

function displayDate(value: string | Date, locale: Locale): string {
	return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(value instanceof Date ? value : new Date(value));
}

export function generateArticleStaticParams(): Array<{ slug: string }> {
	return listPostSlugs('en').map((slug) => ({ slug }));
}

/**
 * The locale of the BODY, which is not always the locale of the URL.
 *
 * `PostDetail.svelte:73` derives `contentLocale = isFallback ? 'en' : locale`
 * and every language-declaring field hangs off it: `og:locale` (line 164), its
 * `alternate` sibling (lines 165-169), the JSON-LD `inLanguage` (line 142 via
 * `contentLanguage`) and `@id`/canonical (line 71 via `postUrl`). A Korean URL
 * serving the English body therefore declares ENGLISH -- announcing `ko_KR`
 * over English prose mislabels the page for search and social crawlers, which
 * is why the facet at `PostDetail.svelte:204` follows the content too.
 */
function contentLocaleOf(locale: Locale, isFallback: boolean): Locale {
	return isFallback ? 'en' : locale;
}

/**
 * The post a route renders, and whether it is the English fallback.
 *
 * Ports `src/routes/ko/posts/[slug]/+page.ts:44-88`, the seventeenth C5 call
 * site's sibling: the Korean route tries Korean first and falls through to the
 * English body under the Korean URL when no Korean post exists.
 *
 * A DRAFTED translation is not a missing one. The Svelte loader calls
 * `error(404, ...)` inside the Korean loop, so a retired Korean post withdraws
 * the Korean URL instead of quietly serving English in its place. `loadPost`
 * returns null for both cases, so existence is re-checked with `findPostFile`
 * to tell them apart -- without that check a drafted translation would silently
 * become an English page, which is the opposite of withdrawing it.
 */
async function resolveArticle(slug: string, locale: Locale) {
	const requested = await loadPost(slug, locale);
	if (requested) return { post: requested, isFallback: false };
	if (locale !== 'ko') return { post: null, isFallback: false };
	// The Korean file exists but did not load: it is drafted, so 404 rather than
	// fall back.
	if (findPostFile(slug, 'ko') !== null) return { post: null, isFallback: false };
	const english = await loadPost(slug, 'en');
	return { post: english, isFallback: english !== null };
}

export async function generateArticleMetadata(slug: string, locale: Locale): Promise<Metadata> {
	const { post, isFallback } = await resolveArticle(slug, locale);
	if (!post) return {};

	const meta = post.frontmatter;
	const englishUrl = absoluteUrl(`/posts/${slug}`);
	const koreanUrl = absoluteUrl(`/ko/posts/${slug}`);
	// A Korean URL serving the English body points its canonical at the English
	// original and asks not to be indexed, as `PostDetail.svelte:71,185` does --
	// otherwise the same body competes with itself in search results.
	const canonicalUrl = isFallback ? englishUrl : locale === 'ko' ? koreanUrl : englishUrl;
	const contentLocale = contentLocaleOf(locale, isFallback);
	const ogImageUrl = `${SITE_URL}/og/${slug}.png`;

	return {
		title: `${meta.title} | ${SITE_NAME}`,
		description: meta.description,
		...(isFallback ? { robots: { index: false, follow: true } } : {}),
		alternates: {
			canonical: canonicalUrl,
			languages: {
				en: englishUrl,
				...(post.hasKoreanTranslation ? { ko: koreanUrl } : {}),
				'x-default': englishUrl,
			},
		},
		openGraph: {
			title: meta.title,
			description: meta.description,
			type: 'article',
			siteName: SITE_NAME,
			url: canonicalUrl,
			images: [{ url: ogImageUrl, width: 1200, height: 630 }],
			locale: localeCode(contentLocale),
			alternateLocale:
				contentLocale === 'ko'
					? [localeCode('en')]
					: post.hasKoreanTranslation
						? [localeCode('ko')]
						: [],
			publishedTime: sourceDate(meta.date),
			modifiedTime: sourceDate(meta.updated),
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

export async function Article({ slug, locale }: { slug: string; locale: Locale }) {
	const { post, isFallback } = await resolveArticle(slug, locale);
	if (!post) notFound();

	const meta = post.frontmatter;
	const copy = articleCopy(locale);
	const contentLocale = contentLocaleOf(locale, isFallback);
	const otherLocale: Locale = locale === 'ko' ? 'en' : 'ko';
	const switchPath = articlePath(slug, otherLocale);
	const socialLinks = socialLinksBySlug[slug] ?? [];

	return (
		<>
			<ReadingProgress label={copy.readingProgress} />
			<article className="article-shell" data-article-locale={locale} data-pagefind-body>
				{/* Pagefind locale facet, as PostDetail.svelte:73,204: the facet follows the CONTENT,
				   not the route, so a Korean URL serving the English body indexes as "en". */}
				<span data-pagefind-filter="lang" className="hidden">
					{contentLocale}
				</span>
				{isFallback && (
					<div className="post__fallback" data-pagefind-ignore>
						<p>{copy.translationNotice}</p>
						<a href={articlePath(slug, 'en')}>{copy.viewInEnglish}</a>
					</div>
				)}
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: articleJsonLd(slug, meta, contentLocale) }}
				/>
				<div className="post__back" data-pagefind-ignore>
					<BackToPosts locale={locale} label={copy.backToPosts} />
				</div>
				<nav aria-label={copy.breadcrumb} data-pagefind-ignore>
					<ol className="breadcrumb-list">
						<li>
							<a href="/">{copy.home}</a>
						</li>
						<li aria-current="page">{meta.title}</li>
					</ol>
				</nav>
				<div
					className="article-hero post__hero"
					data-pagefind-ignore
					dangerouslySetInnerHTML={{ __html: heroBlockHtml(slug) }}
				/>
				<header className="article-header post__head">
					<h1>{meta.title}</h1>
					<p className="article-description post__lede">{meta.description}</p>
					<div className="article-meta">
						<span>
							{copy.published}{' '}
							<time dateTime={sourceDate(meta.date)} data-pagefind-sort="date[datetime]">
								{displayDate(meta.date, locale)}
							</time>
						</span>
						{meta.updated && meta.updated !== meta.date ? (
							<span>
								<span className="post__sep">·</span> {copy.updated}{' '}
								<time dateTime={sourceDate(meta.updated)}>{displayDate(meta.updated, locale)}</time>
							</span>
						) : null}
						{post.readingTime ? (
							<span>
								<span className="post__sep">·</span> {copy.readingTimeWithMinutes(post.readingTime)}
							</span>
						) : null}
						<span>
							<span className="post__sep">·</span> {copy.category}:{' '}
							<span data-pagefind-filter="category">{meta.category}</span>
						</span>
						<PostCopyButton copyLabel={copy.copyLink} copiedLabel={copy.copied} />
					</div>
					{meta.tags.length > 0 ? (
						<div className="post__tags">
							<span>{copy.tags}: </span>
							<ul className="article-tags" aria-label={copy.tags}>
								{meta.tags.map((tag) => (
									<li key={tag} className="post__tag">
										{tag}
									</li>
								))}
							</ul>
						</div>
					) : null}
					{locale === 'ko' || post.hasKoreanTranslation ? (
						<a
							className="locale-switch"
							href={switchPath}
							hrefLang={otherLocale}
							lang={otherLocale}
							data-locale-switch={otherLocale}
							aria-label={copy.switchLabel}
						>
							{copy.switchText}
						</a>
					) : null}
				</header>
				{post.headings.length > 0 ? (
					<TableOfContents headings={post.headings} title={copy.toc} />
				) : null}
				<div className="prose-terminal prose post__content">{post.content}</div>
				{socialLinks.length > 0 ? (
					<aside className="post__social" data-pagefind-ignore>
						<span className="post__social-label">{copy.alsoPublishedOn}</span>
						{socialLinks.map((link) => (
							<a
								key={link.url}
								className="post__social-chip"
								href={link.url}
								target="_blank"
								rel="noopener noreferrer"
							>
								{link.label}
							</a>
						))}
					</aside>
				) : null}
				<Giscus
					slug={slug}
					locale={locale}
					title={copy.comments}
					statusMessage={copy.commentsStatus}
				/>
				<div className="post__bottom" data-pagefind-ignore>
					<BackToPosts locale={locale} label={copy.backToPosts} />
				</div>
			</article>
			<ArticleKeyNavigation locale={locale} />
			<CodeCopy copyLabel={copy.codeCopy} copiedLabel={copy.codeCopied} />
		</>
	);
}
