'use client';

import { useState } from 'react';
import { AppLink } from '@/components/AppLink';
import { CategorySidebar, type CategoryItem } from '@/components/CategorySidebar';
import { PostCard, type PostCardPost } from '@/components/PostCard';
import { postsListCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { postsListJsonLd } from '@/seo/metadata';

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

export function PostsListPage({ posts, basePath = '/' }: PostsListPageProps) {
	const [activeCategory, setActiveCategory] = useState<string | null>(null);
	const locale: Locale = basePath === '/ko' ? 'ko' : 'en';
	const copy = postsListCopy(locale);
	const base = basePath === '/' ? '' : basePath;
	const homeHref = base || '/';

	const categoriesWithCounts = getCategoriesWithCounts(posts);
	const filteredPosts = activeCategory
		? posts.filter((p) => (p.category ?? p.frontmatter?.category) === activeCategory)
		: posts;

	const postHref = (slug: string) => `${base}/posts/${slug}`;

	return (
		<main id="main-content" className="posts">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: postsListJsonLd(locale) }}
			/>

			<header className="page-head">
				<div className="crumb">
					<AppLink href={homeHref}>~</AppLink>
					<span className="crumb__sep">/</span>
					<span>posts</span>
				</div>
				<h1 className="page-title">{copy.pageHeading}</h1>
				<p className="page-lede">{copy.pageDescription}</p>
			</header>

			<div className="posts__filter">
				<CategorySidebar
					categories={categoriesWithCounts}
					activeCategory={activeCategory}
					onSelect={setActiveCategory}
					categoryFilterLabel={copy.categoryFilter}
					allCategoriesLabel={copy.allCategories}
				/>
				<div className="posts__count">
					// {filteredPosts.length} · {activeCategory ?? 'all'}
				</div>
			</div>

			{filteredPosts.length === 0 ? (
				<p className="posts__empty">{copy.noPosts}</p>
			) : (
				<div className="card-grid">
					{filteredPosts.map((post) => (
						<PostCard
							key={post.slug}
							post={post}
							href={postHref(post.slug)}
							locale={locale}
							headingLevel="h2"
						/>
					))}
				</div>
			)}
		</main>
	);
}
