import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { SITE_AUTHOR, SITE_NAME, SITE_URL, absoluteUrl, localeCode } from '../../../src/lib/seo';
import { SLICE_1_ARTICLE_SLUG, articlePath, sourceDate } from './article-contract';
import { articleCopy } from '../i18n/copy';
import { articleJsonLd } from './article-json-ld';
import { heroBlockHtml } from './hero';
import { findPostFile, loadPost, type Locale } from './posts';

function displayDate(value: string | Date, locale: Locale): string {
	return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(value instanceof Date ? value : new Date(value));
}

export function generateArticleStaticParams(): Array<{ slug: string }> {
	return [{ slug: SLICE_1_ARTICLE_SLUG }];
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
	const alternateLocale = locale === 'ko' ? 'en' : 'ko';
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
			locale: localeCode(locale),
			alternateLocale: post.hasKoreanTranslation ? [localeCode(alternateLocale)] : [],
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
	const otherLocale: Locale = locale === 'ko' ? 'en' : 'ko';
	const switchPath = articlePath(slug, otherLocale);

	return (
		<article className="article-shell" data-article-locale={locale} data-pagefind-body>
			{/* Pagefind locale facet, as PostDetail.svelte:73,204: the facet follows the CONTENT,
			   not the route, so a Korean URL serving the English body indexes as "en". */}
			<span data-pagefind-filter="lang" className="hidden">
				{isFallback ? 'en' : locale}
			</span>
			{isFallback && (
				<div className="post__fallback" data-pagefind-ignore>
					<p>{copy.translationNotice}</p>
					<a href={articlePath(slug, 'en')}>{copy.viewInEnglish}</a>
				</div>
			)}
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: articleJsonLd(slug, meta, locale) }}
			/>
			<nav aria-label={copy.breadcrumb} data-pagefind-ignore>
				<ol className="breadcrumb-list">
					<li>
						<a href="/">{copy.home}</a>
					</li>
					<li aria-current="page">{meta.title}</li>
				</ol>
			</nav>
			<div
				className="article-hero"
				data-pagefind-ignore
				dangerouslySetInnerHTML={{ __html: heroBlockHtml(slug) }}
			/>
			<header className="article-header">
				<h1>{meta.title}</h1>
				<p className="article-description">{meta.description}</p>
				<div className="article-meta">
					<span>
						{copy.published}{' '}
						<time dateTime={sourceDate(meta.date)} data-pagefind-sort="date[datetime]">
							{displayDate(meta.date, locale)}
						</time>
					</span>
					{meta.updated ? (
						<span>
							{copy.updated}{' '}
							<time dateTime={sourceDate(meta.updated)}>{displayDate(meta.updated, locale)}</time>
						</span>
					) : null}
					<span>
						{post.readingTime} {copy.readingTime}
					</span>
					<span>
						{copy.category}: <span data-pagefind-filter="category">{meta.category}</span>
					</span>
				</div>
				<div>
					<span>{copy.tags}: </span>
					<ul className="article-tags" aria-label={copy.tags}>
						{meta.tags.map((tag) => (
							<li key={tag}>{tag}</li>
						))}
					</ul>
				</div>
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
				<nav className="article-toc" aria-labelledby="article-toc-title" data-pagefind-ignore>
					<h2 id="article-toc-title">{copy.toc}</h2>
					<ol className="toc-list">
						{post.headings.map((heading) => (
							<li className={`toc-depth-${heading.depth}`} key={heading.id}>
								<a href={`#${heading.id}`}>{heading.text}</a>
							</li>
						))}
					</ol>
				</nav>
			) : null}
			<div className="prose-terminal">{post.content}</div>
			<section className="comments-shell" aria-labelledby="comments-title" data-pagefind-ignore>
				<h2 id="comments-title">{copy.comments}</h2>
				<p>{copy.commentsStatus}</p>
				<div
					className="giscus-container"
					id="giscus-comments"
					data-giscus-mount="true"
					data-giscus-term={slug}
					data-giscus-locale={locale}
				/>
			</section>
		</article>
	);
}
