import { AppLink } from '@/components/AppLink';
import { sourceDate } from '@/content/article-contract';
import { effectiveDate, formatDateShort } from '@/content/date';
import type { Locale } from '@/i18n/locale';
import { DEFAULT_COVER, coverImage } from '../../../src/lib/seo';

export interface PostCardPost {
	slug: string;
	title?: string;
	description?: string;
	category?: string;
	tags?: string[];
	date?: string | Date;
	updated?: string | Date;
	frontmatter?: {
		title?: string;
		description?: string;
		category?: string;
		tags?: string[];
		date?: string | Date;
		updated?: string | Date;
	};
}

export interface PostCardProps {
	post: PostCardPost;
	href: string;
	locale?: Locale;
	headingLevel?: 'h2' | 'h3';
}

/**
 * PostCard — shared post card with a generated cover image on top.
 * Used by BlogHome (recent) and PostsListPage (/posts). Cover is the
 * media-gen 1200x630 image at /og/<slug>.png, with a default fallback.
 * Ports `src/lib/components/PostCard.svelte`.
 */
export function PostCard({ post, href, locale, headingLevel = 'h3' }: PostCardProps) {
	const title = post.title ?? post.frontmatter?.title ?? '';
	const description = post.description ?? post.frontmatter?.description;
	const category = post.category ?? post.frontmatter?.category ?? '';
	const rawDate = post.date ?? post.frontmatter?.date ?? '';
	const rawUpdated = post.updated ?? post.frontmatter?.updated;
	const dateStr = (sourceDate(rawDate) as string) ?? (typeof rawDate === 'string' ? rawDate : '');
	const updatedStr =
		(sourceDate(rawUpdated) as string) ?? (typeof rawUpdated === 'string' ? rawUpdated : undefined);
	const date = effectiveDate(dateStr, updatedStr);
	const resolvedLocale: Locale = locale ?? (href.startsWith('/ko') ? 'ko' : 'en');

	const coverHtml = `<img src="${coverImage(post.slug)}" alt="" loading="lazy" decoding="async" width="1200" height="630" onerror="if(this.dataset.fallback){this.onerror=null}else{this.dataset.fallback='1';this.src='${DEFAULT_COVER}'}"/>`;

	const Heading = headingLevel;

	return (
		<AppLink className="post-card" href={href}>
			<div className="post-card__cover" dangerouslySetInnerHTML={{ __html: coverHtml }} />
			<div className="post-card__body">
				<div className="post-card__meta">
					<span className="post-card__cat">{category}</span>
					<time dateTime={date}>{formatDateShort(date, resolvedLocale)}</time>
				</div>
				<Heading className="post-card__title">{title}</Heading>
				{description ? <p className="post-card__desc">{description}</p> : null}
			</div>
		</AppLink>
	);
}
