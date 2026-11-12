import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AppLink } from '@/components/AppLink';
import { CodeCopy } from '@/components/CodeCopy';
import { CopyButton } from '@/components/CopyButton';
import { Giscus } from '@/components/Giscus';
import { ReadingProgress } from '@/components/ReadingProgress';
import { TableOfContents } from '@/components/TableOfContents';
import socialLinksData from '../../../src/lib/data/social-links.json';
import {
	DEFAULT_OG_IMAGE,
	SITE_AUTHOR,
	SITE_NAME,
	absoluteUrl,
	localeCode,
} from '../../../src/lib/seo';
import { homeHref, postHref } from '../data/nav';
import { articleCopy } from '../i18n/copy';
import { articlePath, sourceDate } from './article-contract';
import { articleJsonLd } from './article-json-ld';
import { formatDateLong } from './date';
import { listPosts, type LocalizedPost } from './post-list';
import { findPostFile, listPostSlugs, loadPost, type Locale } from './posts';
import { titleNodes } from './title';

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
 * A Korean URL that serves the English body declares ENGLISH in every
 * language field (`og:locale`, JSON-LD `inLanguage`, the search facet):
 * announcing `ko_KR` over English prose mislabels the page for search and
 * social crawlers.
 */
function contentLocaleOf(locale: Locale, isFallback: boolean): Locale {
	return isFallback ? 'en' : locale;
}

/**
 * The post a route renders, and whether it is the English fallback.
 *
 * The Korean route tries Korean first and falls through to the English body
 * under the Korean URL when no Korean post exists.
 *
 * A DRAFTED translation is not a missing one: a retired Korean post withdraws
 * the Korean URL instead of quietly serving English in its place. `loadPost`
 * returns null for both cases, so existence is re-checked with `findPostFile`
 * to tell them apart.
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
	// original and asks not to be indexed -- otherwise the same body competes
	// with itself in search results.
	const canonicalUrl = isFallback ? englishUrl : locale === 'ko' ? koreanUrl : englishUrl;
	const contentLocale = contentLocaleOf(locale, isFallback);

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
			// The post as Markdown, written into the export by scripts/build-markdown.mjs.
			types: { 'text/markdown': `${canonicalUrl}.md` },
		},
		openGraph: {
			title: meta.title,
			description: meta.description,
			type: 'article',
			siteName: SITE_NAME,
			url: canonicalUrl,
			images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
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
			images: [DEFAULT_OG_IMAGE],
			creator: '@BrandonWie',
		},
	};
}

/** The posts on each side of one post in the index, and others of its category. */
function neighbours(slug: string, category: string, locale: Locale) {
	const posts = listPosts(locale);
	const at = posts.findIndex((post) => post.slug === slug);
	return {
		newer: at > 0 ? posts[at - 1] : undefined,
		older: at >= 0 ? posts[at + 1] : undefined,
		related: posts
			.filter((post) => post.slug !== slug && post.frontmatter.category === category)
			.slice(0, 3),
	};
}

function PostLink({ post, locale }: { post: LocalizedPost; locale: Locale }) {
	return (
		<AppLink href={postHref(post.slug, locale)} lang={post.lang === locale ? undefined : post.lang}>
			{titleNodes(post.frontmatter.title)}
		</AppLink>
	);
}

export async function Article({ slug, locale }: { slug: string; locale: Locale }) {
	const { post, isFallback } = await resolveArticle(slug, locale);
	if (!post) notFound();

	const meta = post.frontmatter;
	const copy = articleCopy(locale);
	const contentLocale = contentLocaleOf(locale, isFallback);
	const home = homeHref(locale);
	const pageUrl = absoluteUrl(articlePath(slug, isFallback ? 'en' : locale));
	const socialLinks = socialLinksBySlug[slug] ?? [];
	const hasToc = post.headings.length > 1;
	const showUpdated = Boolean(meta.updated && sourceDate(meta.updated) !== sourceDate(meta.date));
	const { newer, older, related } = neighbours(slug, meta.category, locale);
	const share = {
		x: `https://x.com/intent/post?${new URLSearchParams({ text: meta.title, url: pageUrl })}`,
		linkedin: `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url: pageUrl })}`,
		email: `mailto:?${new URLSearchParams({ subject: meta.title, body: pageUrl }).toString().replace(/\+/g, '%20')}`,
	};

	const actions = (
		<div className="post__actions">
			<p className="eyebrow">{copy.share}</p>
			<ul>
				<li>
					<CopyButton label={copy.copyLink} copiedLabel={copy.copied} text={pageUrl} />
				</li>
				<li>
					<a href={share.x} target="_blank" rel="noopener noreferrer">
						X
					</a>
				</li>
				<li>
					<a href={share.linkedin} target="_blank" rel="noopener noreferrer">
						LinkedIn
					</a>
				</li>
				<li>
					<a href={share.email}>{copy.email}</a>
				</li>
				<li>
					<a href={`${articlePath(slug, contentLocale)}.md`}>Markdown</a>
				</li>
			</ul>
		</div>
	);

	return (
		<>
			<ReadingProgress label={copy.readingProgress} />
			{/* The search facet follows the CONTENT: a Korean URL serving the English
			   body is indexed as English. */}
			<article
				className={hasToc ? 'post has-toc' : 'post'}
				lang={isFallback ? 'en' : undefined}
				data-pagefind-body
				data-pagefind-filter={`lang:${contentLocale}`}
			>
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: articleJsonLd(slug, meta, contentLocale) }}
				/>
				<header className="post__head">
					<p className="post__crumbs" data-pagefind-ignore>
						<AppLink href={home} data-hotkey="Backspace" data-hotkey-label={copy.allPosts}>
							<span aria-hidden="true">←</span> {copy.allPosts}
						</AppLink>
						<AppLink
							className="tag"
							href={`${home}?category=${encodeURIComponent(meta.category)}`}
							data-pagefind-filter="category"
						>
							{meta.category}
						</AppLink>
					</p>
					{isFallback ? (
						<p className="post__notice" lang="ko" data-pagefind-ignore>
							{copy.translationNotice}{' '}
							<a className="text-link" href={articlePath(slug, 'en')} hrefLang="en">
								{copy.viewInEnglish}
							</a>
						</p>
					) : null}
					<h1>{titleNodes(meta.title)}</h1>
					<p className="post__lede">{meta.description}</p>
					<dl className="post__meta" data-pagefind-ignore>
						<div>
							<dt className="eyebrow">{copy.published}</dt>
							<dd>
								<time dateTime={sourceDate(meta.date)} data-pagefind-sort="date[datetime]">
									{displayDate(meta.date, locale)}
								</time>
							</dd>
						</div>
						{showUpdated && meta.updated ? (
							<div>
								<dt className="eyebrow">{copy.updated}</dt>
								<dd>
									<time dateTime={sourceDate(meta.updated)}>
										{displayDate(meta.updated, locale)}
									</time>
								</dd>
							</div>
						) : null}
						<div>
							<dt className="eyebrow">{copy.readingTimeLabel}</dt>
							<dd>{copy.readingTime(post.readingTime)}</dd>
						</div>
					</dl>
				</header>

				{hasToc ? (
					<TableOfContents variant="inline" headings={post.headings} title={copy.toc} />
				) : null}

				<div className="prose">{post.content}</div>

				<aside className="post__rail" data-pagefind-ignore>
					{hasToc ? (
						<TableOfContents variant="rail" headings={post.headings} title={copy.toc} />
					) : null}
					{actions}
				</aside>

				<footer className="post__foot" data-pagefind-ignore>
					{meta.tags.length > 0 ? (
						<ul className="post__tags" aria-label={copy.tags}>
							{meta.tags.map((tag) => (
								<li key={tag}>
									<AppLink className="tag" href={`${home}?tag=${encodeURIComponent(tag)}`}>
										#{tag}
									</AppLink>
								</li>
							))}
						</ul>
					) : null}
					{socialLinks.length > 0 ? (
						<p className="post__elsewhere">
							{copy.alsoPublishedOn}{' '}
							{socialLinks.map((link) => (
								<a
									key={link.url}
									className="text-link"
									href={link.url}
									target="_blank"
									rel="noopener noreferrer"
								>
									{link.label}
								</a>
							))}
						</p>
					) : null}
					{actions}
				</footer>
			</article>

			<nav className="post-nav" aria-label={copy.postNavigation}>
				<div className="post-nav__pair">
					{older ? (
						<p>
							<span className="eyebrow">
								<span aria-hidden="true">← </span>
								{copy.older}
							</span>
							<AppLink
								href={postHref(older.slug, locale)}
								lang={older.lang === locale ? undefined : older.lang}
								data-hotkey="["
								data-hotkey-label={copy.older}
							>
								{titleNodes(older.frontmatter.title)}
							</AppLink>
						</p>
					) : (
						<span />
					)}
					{newer ? (
						<p>
							<span className="eyebrow">
								{copy.newer}
								<span aria-hidden="true"> →</span>
							</span>
							<AppLink
								href={postHref(newer.slug, locale)}
								lang={newer.lang === locale ? undefined : newer.lang}
								data-hotkey="]"
								data-hotkey-label={copy.newer}
							>
								{titleNodes(newer.frontmatter.title)}
							</AppLink>
						</p>
					) : null}
				</div>
				{related.length > 0 ? (
					<div className="post-nav__related">
						<h2 className="eyebrow">{copy.moreIn(meta.category)}</h2>
						<ul>
							{related.map((item) => (
								<li key={item.slug}>
									<PostLink post={item} locale={locale} />
								</li>
							))}
						</ul>
					</div>
				) : null}
			</nav>

			<Giscus slug={slug} locale={locale} title={copy.comments} />
			<CodeCopy copiedLabel={copy.copied} />
		</>
	);
}
