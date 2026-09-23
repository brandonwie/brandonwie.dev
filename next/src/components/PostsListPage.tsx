'use client';

import { useState } from 'react';
import { AppLink } from '@/components/AppLink';
import { CategorySidebar, type CategoryItem } from '@/components/CategorySidebar';
import { postListing, type PostCardPost } from '@/components/PostCard';
import { base } from '@/data/nav';
import { postsListCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { postsListJsonLd } from '@/seo/metadata';
import { TermPrompt } from '@/shell/TermPrompt';
import { cwdFor } from '@/shell/terminal-path';

export interface PostsListPageProps {
	posts: PostCardPost[];
	basePath?: string;
}

export function getCategoriesWithCounts(postList: PostCardPost[]): CategoryItem[] {
	const counts: Record<string, number> = {};
	for (const post of postList) {
		const category = post.category ?? post.frontmatter?.category;
		if (category) {
			counts[category] = (counts[category] || 0) + 1;
		}
	}
	return Object.entries(counts)
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count);
}

/**
 * PostsListPage — `/posts` and `/ko/posts` in the Phosphor Fade shell.
 *
 * `$ cat README` over the h1, then `$ ls --category …` over two panes: the
 * category filter (a list at 880px and up, wrapped pills below) and one results
 * frame of `ls -l` style entries. No covers in the list (D6). Filtering stays
 * client-side `useState` with no URL change, because the page is a static
 * export and query params would not be prerendered.
 */
export function PostsListPage({ posts, basePath = '/' }: PostsListPageProps) {
	const [activeCategory, setActiveCategory] = useState<string | null>(null);
	const locale: Locale = basePath === '/ko' ? 'ko' : 'en';
	const copy = postsListCopy(locale);
	const cwd = cwdFor(`${base(locale)}/posts`);

	const categoriesWithCounts = getCategoriesWithCounts(posts);
	const filteredPosts = activeCategory
		? posts.filter((p) => (p.category ?? p.frontmatter?.category) === activeCategory)
		: posts;

	const postHref = (slug: string) => `${base(locale)}/posts/${slug}`;

	return (
		<div className="pg-posts">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: postsListJsonLd(locale) }}
			/>

			<TermPrompt cwd={cwd} command="cat README" />
			<div className="term-worn">
				<h1 className="term-ttl">{copy.pageHeading}</h1>
			</div>
			<p className="pg-posts__lede">{copy.pageDescription}</p>

			<div className="term-gap" />
			<TermPrompt
				cwd={cwd}
				command="ls"
				flags={`--category ${activeCategory ?? 'all'} --sort date-desc`}
			/>

			<div className="pg-posts__panes">
				<div className="term-frame pg-posts__filter">
					<span className="term-frame__title">
						{copy.categoryFilter} <span className="dim">· {categoriesWithCounts.length}</span>
					</span>
					<CategorySidebar
						categories={categoriesWithCounts}
						activeCategory={activeCategory}
						onSelect={setActiveCategory}
						categoryFilterLabel={copy.categoryFilter}
						allCategoriesLabel={copy.allCategories}
					/>
				</div>

				<div className="term-frame pg-posts__results">
					<span className="term-frame__title">
						{activeCategory ? `${cwd}/${activeCategory}` : cwd}{' '}
						<span className="dim">
							· {filteredPosts.length}/{posts.length}
						</span>
					</span>
					<p className="pg-posts__count">
						// {filteredPosts.length} · {activeCategory ?? 'all'}
					</p>

					{filteredPosts.length === 0 ? (
						<p className="pg-posts__empty">
							<span className="pg-posts__x">ls:</span> {copy.noPosts}
						</p>
					) : (
						filteredPosts.map((post, index) => {
							const item = postListing(post, locale);
							return (
								<AppLink key={post.slug} className="pg-posts__entry" href={postHref(post.slug)}>
									<span className="pg-posts__meta">
										<span className="pg-posts__n" aria-hidden="true">
											[{index + 1}]
										</span>
										<time className="pg-posts__dt" dateTime={item.date}>
											{item.dateLabel}
										</time>
										<span className="pg-posts__cat-col">{item.category}</span>
										<span className="pg-posts__slug" aria-hidden="true">
											{post.slug}
										</span>
									</span>
									<h2 className="pg-posts__ti">{item.title}</h2>
									{item.description ? (
										<span className="pg-posts__ds">{item.description}</span>
									) : null}
								</AppLink>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
}
