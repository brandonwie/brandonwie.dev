import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { SITE_AUTHOR, SITE_NAME, SITE_URL, absoluteUrl, localeCode } from '../../../src/lib/seo';
import { heroBlockHtml } from './hero';
import { articleJsonLd } from './article-json-ld';
import { loadPost, type Locale } from './posts';

export const SLICE_1_ARTICLE_SLUG = 'giscus-sveltekit-integration';

const COPY = {
	en: {
		breadcrumb: 'Breadcrumb',
		home: 'Home',
		published: 'Published',
		updated: 'Updated',
		readingTime: 'min read',
		category: 'Category',
		tags: 'Tags',
		toc: 'On this page',
		switchLabel: 'Read this article in Korean',
		switchText: '한국어',
		comments: 'Comments',
		commentsStatus: 'Comments will load here when the Giscus runtime is migrated.',
	},
	ko: {
		breadcrumb: '현재 위치',
		home: '홈',
		published: '게시일',
		updated: '수정일',
		readingTime: '분 읽기',
		category: '카테고리',
		tags: '태그',
		toc: '이 글의 목차',
		switchLabel: '이 글을 영어로 읽기',
		switchText: 'English',
		comments: '댓글',
		commentsStatus: 'Giscus 런타임을 마이그레이션하면 이곳에 댓글이 표시됩니다.',
	},
} as const;

function articlePath(slug: string, locale: Locale): string {
	return locale === 'ko' ? `/ko/posts/${slug}` : `/posts/${slug}`;
}

function sourceDate(value: string | Date | undefined): string | undefined {
	if (value === undefined) return undefined;
	return value instanceof Date ? value.toISOString() : String(value);
}

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

export async function generateArticleMetadata(slug: string, locale: Locale): Promise<Metadata> {
	const post = await loadPost(slug, locale);
	if (!post) return {};

	const meta = post.frontmatter;
	const englishUrl = absoluteUrl(`/posts/${slug}`);
	const koreanUrl = absoluteUrl(`/ko/posts/${slug}`);
	const canonicalUrl = locale === 'ko' ? koreanUrl : englishUrl;
	const alternateLocale = locale === 'ko' ? 'en' : 'ko';
	const ogImageUrl = `${SITE_URL}/og/${slug}.png`;

	return {
		title: `${meta.title} | ${SITE_NAME}`,
		description: meta.description,
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
	const post = await loadPost(slug, locale);
	if (!post) notFound();

	const meta = post.frontmatter;
	const copy = COPY[locale];
	const otherLocale: Locale = locale === 'ko' ? 'en' : 'ko';
	const switchPath = articlePath(slug, otherLocale);

	return (
		<article className="article-shell" data-article-locale={locale}>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: articleJsonLd(slug, meta, locale) }}
			/>
			<nav aria-label={copy.breadcrumb}>
				<ol className="breadcrumb-list">
					<li>
						<a href="/">{copy.home}</a>
					</li>
					<li aria-current="page">{meta.title}</li>
				</ol>
			</nav>
			<div className="article-hero" dangerouslySetInnerHTML={{ __html: heroBlockHtml(slug) }} />
			<header className="article-header">
				<p>{meta.category}</p>
				<h1>{meta.title}</h1>
				<p className="article-description">{meta.description}</p>
				<div className="article-meta">
					<span>
						{copy.published}{' '}
						<time dateTime={sourceDate(meta.date)}>{displayDate(meta.date, locale)}</time>
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
						{copy.category}: {meta.category}
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
				<nav className="article-toc" aria-labelledby="article-toc-title">
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
			<section className="comments-shell" aria-labelledby="comments-title">
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
