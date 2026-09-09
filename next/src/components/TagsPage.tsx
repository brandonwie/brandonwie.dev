import { AppLink } from '@/components/AppLink';
import type { PostCardPost } from '@/components/PostCard';
import { sourceDate } from '@/content/article-contract';
import { effectiveDate } from '@/content/date';
import { tagsCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';

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

export function TagsPage({ locale = 'en', posts = [] }: TagsPageProps) {
	const basePath = locale === 'ko' ? '/ko' : '';
	const copy = tagsCopy(locale);

	const tagList = getTagsWithCounts(posts);
	const maxCount = tagList.length ? tagList[0].count : 1;

	const postsByTag: Record<string, PostCardPost[]> = {};
	for (const post of posts) {
		const tags = (post as { tags?: string[] }).tags ?? post.frontmatter?.tags ?? [];
		for (const tag of tags) {
			(postsByTag[tag] ??= []).push(post);
		}
	}
	for (const tag of Object.keys(postsByTag)) {
		postsByTag[tag].sort((a, b) => {
			const rawDateA = a.date ?? a.frontmatter?.date ?? '';
			const rawUpdatedA = a.updated ?? a.frontmatter?.updated;
			const dateStrA =
				(sourceDate(rawDateA) as string) ?? (typeof rawDateA === 'string' ? rawDateA : '');
			const updatedStrA =
				(sourceDate(rawUpdatedA) as string) ??
				(typeof rawUpdatedA === 'string' ? rawUpdatedA : undefined);
			const dateA = effectiveDate(dateStrA, updatedStrA);

			const rawDateB = b.date ?? b.frontmatter?.date ?? '';
			const rawUpdatedB = b.updated ?? b.frontmatter?.updated;
			const dateStrB =
				(sourceDate(rawDateB) as string) ?? (typeof rawDateB === 'string' ? rawDateB : '');
			const updatedStrB =
				(sourceDate(rawUpdatedB) as string) ??
				(typeof rawUpdatedB === 'string' ? rawUpdatedB : undefined);
			const dateB = effectiveDate(dateStrB, updatedStrB);

			return new Date(dateB).getTime() - new Date(dateA).getTime();
		});
	}

	function cloudSize(count: number): string {
		const ratio = maxCount > 0 ? count / maxCount : 0;
		return `${(0.8 + ratio * 0.9).toFixed(3)}rem`;
	}

	return (
		<main id="main-content" className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
			{/* Header */}
			<section className="max-w-3xl">
				<div className="mb-5 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.12em] text-faint">
					<AppLink href={basePath || '/'} className="transition-colors hover:text-foam">
						~
					</AppLink>
					<span className="text-line2">/</span>
					<span>tags</span>
				</div>
				<p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-foam">
					{copy.eyebrow}
				</p>
				<h1 className="mt-4 font-sans text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
					{copy.title}
				</h1>
				<p className="mt-6 font-sans text-lg leading-8 text-muted">
					{copy.intro(tagList.length, posts.length)}
				</p>
			</section>

			{tagList.length === 0 ? (
				<p className="mt-14 font-mono text-sm text-faint">{copy.empty}</p>
			) : (
				<>
					{/* Cloud */}
					<section className="mt-14">
						<div className="mb-5 flex items-center gap-3.5">
							<span className="font-mono font-bold text-foam">#</span>
							<h2 className="font-sans text-xl font-semibold tracking-tight text-ink">
								{copy.cloudHeading}
							</h2>
							<span className="h-px flex-1 bg-line2" />
						</div>
						<div className="flex flex-wrap items-baseline gap-x-4 gap-y-3">
							{tagList.map((tag) => (
								<a
									key={tag.name}
									href={`#tag-${tagSlug(tag.name)}`}
									className="font-mono leading-none text-muted transition-colors hover:text-foam"
									style={{ fontSize: cloudSize(tag.count) }}
								>
									{tag.name}
									<span className="ml-1 align-super text-[0.6em] text-faint">{tag.count}</span>
								</a>
							))}
						</div>
					</section>

					{/* Grouped list */}
					<section className="mt-16">
						<div className="mb-5 flex items-center gap-3.5">
							<span className="font-mono font-bold text-foam">#</span>
							<h2 className="font-sans text-xl font-semibold tracking-tight text-ink">
								{copy.allHeading}
							</h2>
							<span className="h-px flex-1 bg-line2" />
						</div>
						<div className="grid gap-4">
							{tagList.map((tag) => (
								<article
									key={tag.name}
									id={`tag-${tagSlug(tag.name)}`}
									className="scroll-mt-24 rounded-lg border border-line2 bg-surface p-5"
								>
									<div className="mb-3 flex items-baseline justify-between gap-3 border-b border-line pb-3">
										<h3 className="font-mono text-sm text-foam">#{tag.name}</h3>
										<span className="font-mono text-xs text-faint">{copy.count(tag.count)}</span>
									</div>
									<ul className="grid gap-1.5">
										{(postsByTag[tag.name] ?? []).map((post) => (
											<li key={post.slug}>
												<AppLink
													href={`${basePath}/posts/${post.slug}`}
													className="font-sans text-sm leading-7 text-muted no-underline transition-colors hover:text-foam"
												>
													{post.title ?? post.frontmatter?.title}
												</AppLink>
											</li>
										))}
									</ul>
								</article>
							))}
						</div>
					</section>
				</>
			)}
		</main>
	);
}
