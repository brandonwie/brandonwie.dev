import { AppLink } from '@/components/AppLink';
import type { PostCardPost } from '@/components/PostCard';
import { sourceDate } from '@/content/article-contract';
import { effectiveDate, formatKoreanDate } from '@/content/date';
import { base } from '@/data/nav';
import { tagsCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { TermPrompt } from '@/shell/TermPrompt';
import { cwdFor } from '@/shell/terminal-path';

export interface TagsPageProps {
	locale?: Locale;
	posts?: PostCardPost[];
}

export interface TagItem {
	name: string;
	count: number;
}

export function getTagsWithCounts(postList: PostCardPost[]): TagItem[] {
	const counts: Record<string, number> = {};
	for (const post of postList) {
		const tags = (post as { tags?: string[] }).tags ?? post.frontmatter?.tags ?? [];
		for (const tag of tags) {
			counts[tag] = (counts[tag] || 0) + 1;
		}
	}
	return Object.entries(counts)
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function tagSlug(tag: string): string {
	return tag
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

/** Tags with at least this many posts get a meter row; the rest are `uniq -c` rows. */
const METER_MIN = 10;
/** Meter width in cells. */
const METER_CELLS = 40;

function postDate(post: PostCardPost): string {
	const rawDate = post.date ?? post.frontmatter?.date ?? '';
	const rawUpdated = post.updated ?? post.frontmatter?.updated;
	const dateStr = (sourceDate(rawDate) as string) ?? (typeof rawDate === 'string' ? rawDate : '');
	const updatedStr =
		(sourceDate(rawUpdated) as string) ?? (typeof rawUpdated === 'string' ? rawUpdated : undefined);
	return effectiveDate(dateStr, updatedStr);
}

/** Group-row date: ISO `YYYY-MM-DD` (EN) or `YYYY.MM.DD` (KO), UTC like the rest of the site. */
function rowDate(date: string, locale: Locale): string {
	if (locale === 'ko') return formatKoreanDate(date);
	const d = new Date(date);
	return Number.isNaN(d.getTime()) ? date : d.toISOString().slice(0, 10);
}

/** `█` cells scaled to the largest count, `░` for the rest (at least one filled cell). */
function meter(count: number, max: number): { filled: string; empty: string } {
	const cells = Math.min(METER_CELLS, Math.max(1, Math.round((count / max) * METER_CELLS)));
	return { filled: '█'.repeat(cells), empty: '░'.repeat(METER_CELLS - cells) };
}

/**
 * TagsPage — `/tags` and `/ko/tags` in the Phosphor Fade shell.
 *
 * `tags --index` (eyebrow, worn h1, intro), `tags --cloud --sort=count` (tags
 * with 10+ posts as meter rows, the rest as `uniq -c` rows by count; every tag
 * rendered, frequency carried by the meter and the row instead of font size),
 * then `tags --all --group-by=tag`: one `article#tag-{slug}` frame per tag with
 * every post, newest first, and its effective date. Cloud links keep
 * `href="#tag-{slug}"`; a targeted group gets the amber frame border and keeps
 * a scroll margin so its title is not tucked under the viewport edge.
 */
export function TagsPage({ locale = 'en', posts = [] }: TagsPageProps) {
	const copy = tagsCopy(locale);
	const cwd = cwdFor(`${base(locale)}/tags`);

	const tagList = getTagsWithCounts(posts);
	const maxCount = tagList.length ? tagList[0].count : 1;

	const postsByTag: Record<string, { post: PostCardPost; date: string }[]> = {};
	for (const post of posts) {
		const tags = (post as { tags?: string[] }).tags ?? post.frontmatter?.tags ?? [];
		for (const tag of tags) {
			(postsByTag[tag] ??= []).push({ post, date: postDate(post) });
		}
	}
	for (const tag of Object.keys(postsByTag)) {
		postsByTag[tag].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	}

	const metered = tagList.filter((tag) => tag.count >= METER_MIN);
	const byCount: { count: number; tags: TagItem[] }[] = [];
	for (const tag of tagList) {
		if (tag.count >= METER_MIN) continue;
		const last = byCount[byCount.length - 1];
		if (last && last.count === tag.count) last.tags.push(tag);
		else byCount.push({ count: tag.count, tags: [tag] });
	}

	return (
		<div className="pg-tags">
			<TermPrompt cwd={cwd} command="tags" flags="--index" />
			<p className="term-eyebrow pg-tags__eyebrow">{copy.eyebrow}</p>
			<div className="term-worn pg-tags__h1">
				<h1 className="term-ttl">{copy.title}</h1>
			</div>
			<p className="pg-tags__intro">{copy.intro(tagList.length, posts.length)}</p>

			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="tags" flags="--cloud --sort=count" />
			{tagList.length === 0 ? (
				<p className="text-crt-faint">
					<span aria-hidden="true">tags: </span>
					{copy.empty}
				</p>
			) : (
				<>
					<section className="term-frame pg-tags__cloud" aria-labelledby="tags-cloud">
						<h2 className="term-frame__title pg-tags__ft" id="tags-cloud">
							{copy.cloudHeading} <span className="dim">· {tagList.length}</span>
						</h2>
						<div className="pg-tags__meters">
							{metered.map((tag) => {
								const cells = meter(tag.count, maxCount);
								return (
									<div key={tag.name} className="pg-tags__mrow">
										<a className="term-lnk pg-tags__lnk" href={`#tag-${tagSlug(tag.name)}`}>
											{tag.name}
										</a>
										<span className="term-meter" aria-hidden="true">
											[{cells.filled}
											<span className="off">{cells.empty}</span>]
										</span>
										<span className="pg-tags__ct">{tag.count}</span>
									</div>
								);
							})}
						</div>
						{byCount.length > 0 ? (
							<>
								<p className="pg-tags__rule" aria-hidden="true">
									── uniq -c ──
								</p>
								{byCount.map((group) => (
									<div key={group.count} className="pg-tags__urow">
										<span className="pg-tags__ct">{group.count}</span>
										<span className="pg-tags__flow">
											{group.tags.map((tag) => (
												<a
													key={tag.name}
													className="term-lnk pg-tags__lnk"
													href={`#tag-${tagSlug(tag.name)}`}
												>
													{tag.name}
												</a>
											))}
										</span>
									</div>
								))}
							</>
						) : null}
					</section>

					<div className="term-gap" />
					<TermPrompt cwd={cwd} command="tags" flags="--all --group-by=tag" />
					<h2 className="term-eyebrow pg-tags__all">
						{copy.allHeading} <span className="text-crt-green">{tagList.length}</span>
					</h2>
					{tagList.map((tag) => (
						<article
							key={tag.name}
							id={`tag-${tagSlug(tag.name)}`}
							className="term-frame pg-tags__grp"
						>
							<h3 className="term-frame__title pg-tags__ft">
								<span className="term-tag">{tag.name}</span>{' '}
								<span className="dim">· {copy.count(tag.count)}</span>
							</h3>
							<ul>
								{(postsByTag[tag.name] ?? []).map(({ post, date }) => (
									<li key={post.slug}>
										<time className="pg-tags__dt" dateTime={date}>
											{rowDate(date, locale)}
										</time>
										<span>
											<AppLink
												className="term-lnk pg-tags__lnk"
												href={`${base(locale)}/posts/${post.slug}`}
											>
												{post.title ?? post.frontmatter?.title}
											</AppLink>
										</span>
									</li>
								))}
							</ul>
						</article>
					))}
				</>
			)}
		</div>
	);
}
