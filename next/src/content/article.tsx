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
import { homeHref } from '../data/nav';
import { formatDateLong } from './date';
import { articleCopy, shellCopy } from '../i18n/copy';
import { TermPrompt } from '@/shell/TermPrompt';
import { cwdFor } from '@/shell/terminal-path';
import { articleJsonLd } from './article-json-ld';
import { heroBlockHtml } from './hero';
import { findPostFile, listPostSlugs, loadPost, type Locale } from './posts';

interface SocialLink {
	url: string;
	label: string;
}

const socialLinksBySlug = socialLinksData as Record<string, SocialLink[] | undefined>;

function displayDate(value: string | Date, locale: Locale): string {
	return formatDateLong(value instanceof Date ? value.toISOString() : value, locale);
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
	const shell = shellCopy(locale);
	const contentLocale = contentLocaleOf(locale, isFallback);
	const otherLocale: Locale = locale === 'ko' ? 'en' : 'ko';
	const switchPath = articlePath(slug, otherLocale);
	const socialLinks = socialLinksBySlug[slug] ?? [];
	const cwd = cwdFor(articlePath(slug, locale));
	const hasToc = post.headings.length > 0;
	const showUpdated = Boolean(meta.updated && meta.updated !== meta.date);
	const frontmatterRows =
		3 + (showUpdated ? 1 : 0) + (post.readingTime ? 1 : 0) + (meta.tags.length > 0 ? 1 : 0);

	return (
		<div className="pg-post">
			<ReadingProgress
				label={copy.readingProgress}
				file={`${slug}/index.md`}
				headings={post.headings}
			/>
			<TermPrompt
				cwd={cwd}
				command="less index.md"
				flags={`${hasToc ? '--toc ' : ''}--lang ${contentLocale}`}
			/>
			<div className={hasToc ? 'pg-post__read has-toc' : 'pg-post__read'}>
				<article
					className="article-shell pg-post__article"
					data-article-locale={locale}
					data-pagefind-body
				>
					{/* Pagefind locale facet, as PostDetail.svelte:73,204: the facet follows the CONTENT,
					   not the route, so a Korean URL serving the English body indexes as "en". */}
					<span data-pagefind-filter="lang" className="hidden">
						{contentLocale}
					</span>
					{isFallback && (
						<p className="post__fallback pg-post__warn" data-pagefind-ignore>
							<span className="text-crt-amber">warn:</span> {copy.translationNotice}{' '}
							<a className="term-lnk" href={articlePath(slug, 'en')} hrefLang="en" lang="en">
								<span className="n" aria-hidden="true">
									[1]
								</span>{' '}
								{copy.viewInEnglish}
							</a>
						</p>
					)}
					<script
						type="application/ld+json"
						dangerouslySetInnerHTML={{ __html: articleJsonLd(slug, meta, contentLocale) }}
					/>
					<div className="pg-post__crumbs" data-pagefind-ignore>
						<BackToPosts locale={locale} label={copy.backToPosts} />
						<nav aria-label={copy.breadcrumb}>
							<ol className="breadcrumb-list">
								<li>
									<a className="term-lnk" href={homeHref(locale)}>
										{copy.home}
									</a>
								</li>
								<li aria-current="page">{meta.title}</li>
							</ol>
						</nav>
					</div>
					<div className="term-frame pg-post__hero" data-pagefind-ignore>
						<span className="term-frame__title" aria-hidden="true">
							hero.png <span className="dim">· 2400×1260</span>
						</span>
						<div
							className="article-hero term-worn"
							dangerouslySetInnerHTML={{ __html: heroBlockHtml(slug) }}
						/>
					</div>
					<p className="term-eyebrow pg-post__eyebrow" aria-hidden="true" data-pagefind-ignore>
						post · {meta.category}
					</p>
					{/* The header must open with a bare <h1>: the article suite (A11) and the C5
					   fallback row read it that way, so the terminal title look is page CSS. */}
					<header className="article-header pg-post__head">
						<h1>{meta.title}</h1>
						<p className="article-description pg-post__lede">{meta.description}</p>
						<div className="term-frame article-meta pg-post__fm">
							<span className="term-frame__title" aria-hidden="true" data-pagefind-ignore>
								frontmatter <span className="dim">· head -n {frontmatterRows}</span>
							</span>
							<div className="pg-post__row">
								<span className="k">{copy.published}</span>
								<span className="v">
									<time dateTime={sourceDate(meta.date)} data-pagefind-sort="date[datetime]">
										{displayDate(meta.date, locale)}
									</time>
								</span>
							</div>
							{showUpdated && meta.updated ? (
								<div className="pg-post__row">
									<span className="k">{copy.updated}</span>
									<span className="v">
										<time dateTime={sourceDate(meta.updated)}>
											{displayDate(meta.updated, locale)}
										</time>
									</span>
								</div>
							) : null}
							{post.readingTime ? (
								<div className="pg-post__row">
									<span className="k" aria-hidden="true">
										reading
									</span>
									<span className="v">{copy.readingTimeWithMinutes(post.readingTime)}</span>
								</div>
							) : null}
							<div className="pg-post__row">
								<span className="k">{copy.category}</span>
								<span className="v" data-pagefind-filter="category">
									{meta.category}
								</span>
							</div>
							{meta.tags.length > 0 ? (
								<div className="pg-post__row">
									<span className="k">{copy.tags}</span>
									<ul className="v article-tags" aria-label={copy.tags}>
										{meta.tags.map((tag) => (
											<li key={tag} className="term-tag">
												{tag}
											</li>
										))}
									</ul>
								</div>
							) : null}
							<div className="pg-post__row" data-pagefind-ignore>
								<span className="k" aria-hidden="true">
									lang
								</span>
								<span className="v">
									<span aria-hidden="true">{contentLocale}</span>
									{locale === 'ko' || post.hasKoreanTranslation ? (
										<>
											<span className="text-crt-faint" aria-hidden="true">
												{' → '}
											</span>
											<a
												className="locale-switch term-lnk"
												href={switchPath}
												hrefLang={otherLocale}
												lang={otherLocale}
												data-locale-switch={otherLocale}
												aria-label={copy.switchLabel}
											>
												{copy.switchText}
											</a>
										</>
									) : null}
								</span>
							</div>
							<div className="pg-post__actions" data-pagefind-ignore>
								<PostCopyButton copyLabel={copy.copyLink} copiedLabel={copy.copied} />
							</div>
						</div>
					</header>
					{hasToc ? (
						<TableOfContents variant="inline" headings={post.headings} title={copy.toc} />
					) : null}
					<div className="prose-terminal prose post__content">{post.content}</div>
					{socialLinks.length > 0 ? (
						<aside className="post__social pg-post__social" data-pagefind-ignore>
							<TermPrompt cwd={cwd} command="ls --crosspost" />
							<p className="post__social-label">{copy.alsoPublishedOn}</p>
							<ul className="pg-post__social-list">
								{socialLinks.map((link, index) => (
									<li key={link.url}>
										<a
											className="term-lnk post__social-chip"
											href={link.url}
											target="_blank"
											rel="noopener noreferrer"
										>
											<span className="n" aria-hidden="true">
												[{index + 1}]
											</span>{' '}
											{link.label} <span aria-hidden="true">↗</span>
										</a>
									</li>
								))}
							</ul>
						</aside>
					) : null}
				</article>
				{hasToc ? (
					<TableOfContents
						variant="rail"
						headings={post.headings}
						title={copy.toc}
						backLabel={copy.backToPosts}
						searchLabel={shell.search}
						readLabel={copy.readingProgress}
					/>
				) : null}
			</div>
			<div className="term-gap" />
			<TermPrompt cwd={cwd} command={`giscus --term ${slug}`} flags={`--lang ${locale} --lazy`} />
			<Giscus slug={slug} locale={locale} title={copy.comments} />
			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="cd .." />
			<p className="post__bottom pg-post__bottom" data-pagefind-ignore>
				<BackToPosts locale={locale} label={copy.backToPosts} /> <kbd aria-hidden="true">bksp</kbd>
			</p>
			<ArticleKeyNavigation locale={locale} />
			<CodeCopy copyLabel={copy.codeCopy} copiedLabel={copy.codeCopied} />
		</div>
	);
}
