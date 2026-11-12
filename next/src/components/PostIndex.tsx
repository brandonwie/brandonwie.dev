import { AppLink } from '@/components/AppLink';
import { PostFilter } from '@/components/PostFilter';
import { formatMonthDay } from '@/content/date';
import { listPosts, type LocalizedPost } from '@/content/post-list';
import { titleNodes } from '@/content/title';
import { base, postHref } from '@/data/nav';
import { indexCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { homeJsonLd } from '@/seo/metadata';
import { SITE_NAME } from '../../../src/lib/seo';

/** Posts grouped by publish year, newest year first. The input is already newest first. */
function byYear(posts: LocalizedPost[]): Array<[year: string, posts: LocalizedPost[]]> {
	const groups = new Map<string, LocalizedPost[]>();
	for (const post of posts) {
		const year = post.date.slice(0, 4);
		groups.set(year, [...(groups.get(year) ?? []), post]);
	}
	return Array.from(groups);
}

/** Categories with their post counts, most posts first. */
function categoryCounts(posts: LocalizedPost[]): Array<{ name: string; count: number }> {
	const counts = new Map<string, number>();
	for (const { frontmatter } of posts) {
		counts.set(frontmatter.category, (counts.get(frontmatter.category) ?? 0) + 1);
	}
	return Array.from(counts, ([name, count]) => ({ name, count })).sort(
		(a, b) => b.count - a.count || a.name.localeCompare(b.name),
	);
}

/**
 * The home page: every post as one row, grouped by year.
 *
 * The rows are server-rendered once and `PostFilter` hides the ones that do not
 * match, so the list is never sent a second time as component props. The data
 * attributes on each row are what the filter reads.
 */
export function PostIndex({ locale }: { locale: Locale }) {
	const copy = indexCopy(locale);
	const posts = listPosts(locale);

	return (
		<div className="index">
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: homeJsonLd(locale) }} />
			<header className="index__head">
				<h1>{SITE_NAME}</h1>
				<p>
					{copy.bio}{' '}
					<AppLink className="text-link" href={`${base(locale)}/about`}>
						{copy.aboutMore}
					</AppLink>
				</p>
			</header>

			<PostFilter
				locale={locale}
				total={posts.length}
				categories={categoryCounts(posts)}
				copy={copy.filter}
			/>

			<div id="post-list" className="index__list">
				{byYear(posts).map(([year, group]) => (
					<section key={year} data-year={year} aria-labelledby={`year-${year}`}>
						<h2 id={`year-${year}`} className="index__year">
							{year}
						</h2>
						<ol>
							{group.map((post) => (
								<li
									key={post.slug}
									data-post={post.slug}
									data-category={post.frontmatter.category}
									data-tags={`,${post.frontmatter.tags.join(',')},`}
								>
									<AppLink
										className="index__row"
										href={postHref(post.slug, locale)}
										lang={post.lang === locale ? undefined : post.lang}
										data-row
									>
										<time dateTime={post.date}>{formatMonthDay(post.date, locale)}</time>
										<span className="index__title" data-title>
											{titleNodes(post.frontmatter.title)}
										</span>
										<span className="index__meta">
											<span className="index__category">{post.frontmatter.category}</span>
											<span>{copy.minutes(post.readingTime)}</span>
										</span>
									</AppLink>
								</li>
							))}
						</ol>
					</section>
				))}
			</div>
		</div>
	);
}
