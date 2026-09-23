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

/** One post as the list surfaces print it: resolved fields, display date. */
export interface PostListing {
	slug: string;
	title: string;
	description?: string;
	category: string;
	/** ISO-ish source date for `<time dateTime>` (`effectiveDate` of date/updated). */
	date: string;
	/** `formatDateShort` output: `Sep 20, 2026` / `2026.09.20`. */
	dateLabel: string;
}

/**
 * Resolve a post's list fields once, for the `/posts` entries and the home rows.
 * Same resolution the old card used: frontmatter fallbacks, and the displayed
 * date is `effectiveDate(date, updated)`.
 */
export function postListing(post: PostCardPost, locale: Locale): PostListing {
	const rawDate = post.date ?? post.frontmatter?.date ?? '';
	const rawUpdated = post.updated ?? post.frontmatter?.updated;
	const dateStr = (sourceDate(rawDate) as string) ?? (typeof rawDate === 'string' ? rawDate : '');
	const updatedStr =
		(sourceDate(rawUpdated) as string) ?? (typeof rawUpdated === 'string' ? rawUpdated : undefined);
	const date = effectiveDate(dateStr, updatedStr);
	return {
		slug: post.slug,
		title: post.title ?? post.frontmatter?.title ?? '',
		description: post.description ?? post.frontmatter?.description,
		category: post.category ?? post.frontmatter?.category ?? '',
		date,
		dateLabel: formatDateShort(date, locale),
	};
}

/**
 * PostCover — a post's generated cover (`/og/<slug>.png`, 1200x630) with the
 * single-shot fallback to the default cover. The card that used to wrap it is
 * gone with the terminal redesign (`/posts` prints no covers, D6); the home
 * preview pane is its one consumer. The handler is inline so it also fires for
 * an image that failed before hydration.
 */
export function PostCover({ post, className }: { post: { slug: string }; className?: string }) {
	const coverHtml = `<img src="${coverImage(post.slug)}" alt="" loading="lazy" decoding="async" width="1200" height="630" onerror="if(this.dataset.fallback){this.onerror=null}else{this.dataset.fallback='1';this.src='${DEFAULT_COVER}'}"/>`;
	return <div className={className} dangerouslySetInnerHTML={{ __html: coverHtml }} />;
}

export interface PostCardProps {
	post: PostCardPost;
	href: string;
	locale?: Locale;
	headingLevel?: 'h2' | 'h3';
}

/** PostCard — cover-on-top card; the home page's recent grid until its port. */
export function PostCard({ post, href, locale, headingLevel = 'h3' }: PostCardProps) {
	const resolvedLocale: Locale = locale ?? (href.startsWith('/ko') ? 'ko' : 'en');
	const item = postListing(post, resolvedLocale);
	const Heading = headingLevel;
	return (
		<AppLink className="post-card" href={href}>
			<PostCover post={post} className="post-card__cover" />
			<div className="post-card__body">
				<div className="post-card__meta">
					<span className="post-card__cat">{item.category}</span>
					<time dateTime={item.date}>{item.dateLabel}</time>
				</div>
				<Heading className="post-card__title">{item.title}</Heading>
				{item.description ? <p className="post-card__desc">{item.description}</p> : null}
			</div>
		</AppLink>
	);
}
