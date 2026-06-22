<script lang="ts">
	/**
	 * PostsListPage — shared posts list for /posts (EN) and /ko/posts (KO).
	 *
	 * Both routes were duplicated inline; this folds them into one basePath-driven
	 * component (mirrors BlogHome / PostDetail). Terminal redesign: page-head +
	 * horizontal category chips + recent.log rows. Filtering is client-side $state.
	 */
	import { m } from '$lib/paraglide/messages';
	import type { PostMetadata } from '$lib/stores/posts';
	import { getCategoriesWithCounts } from '$lib/stores/posts';
	import { formatDateShort, effectiveDate } from '$lib/utils/date';
	import CategorySidebar from '$lib/components/CategorySidebar.svelte';
	import { absoluteUrl, DEFAULT_OG_IMAGE, localeCode, SITE_NAME } from '$lib/seo';

	let { posts, basePath = '/' }: { posts: PostMetadata[]; basePath?: string } = $props();

	const locale = $derived(basePath === '/ko' ? 'ko' : 'en');
	const base = $derived(basePath === '/' ? '' : basePath);
	const homeHref = $derived(base || '/');
	const canonicalHref = $derived(absoluteUrl(locale === 'ko' ? '/ko/posts' : '/posts'));

	let activeCategory: string | null = $state(null);
	const categoriesWithCounts = $derived(getCategoriesWithCounts(posts));
	const filteredPosts = $derived(
		activeCategory ? posts.filter((p) => p.category === activeCategory) : posts,
	);

	const pageTitle = $derived(`${m.posts_title()} | Brandon Wie`);
	const pageDescription = $derived(m.posts_description());
	const jsonLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			name: pageTitle,
			description: pageDescription,
			url: canonicalHref,
			inLanguage: locale === 'ko' ? 'ko-KR' : 'en-US',
		}),
	);

	const postHref = (slug: string) => `${base}/posts/${slug}`;

	function handleCategorySelect(category: string | null) {
		activeCategory = category;
	}
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={canonicalHref} />
	<link rel="alternate" hreflang="en" href={absoluteUrl('/posts')} />
	<link rel="alternate" hreflang="ko" href={absoluteUrl('/ko/posts')} />
	<link rel="alternate" hreflang="x-default" href={absoluteUrl('/posts')} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:url" content={canonicalHref} />
	<meta property="og:image" content={DEFAULT_OG_IMAGE} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:locale" content={localeCode(locale)} />
	<meta property="og:locale:alternate" content={localeCode(locale === 'ko' ? 'en' : 'ko')} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
	<meta name="twitter:image" content={DEFAULT_OG_IMAGE} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<script type="application/ld+json">${jsonLd}\x3C/script>`}
</svelte:head>

<main id="main-content" class="posts">
	<header class="page-head">
		<div class="crumb">
			<a href={homeHref}>~</a><span class="crumb__sep">/</span><span>posts</span>
		</div>
		<h1 class="page-title">{m.posts_title()}</h1>
		<p class="page-lede">{pageDescription}</p>
	</header>

	<div class="posts__filter">
		<CategorySidebar
			categories={categoriesWithCounts}
			{activeCategory}
			onSelect={handleCategorySelect}
		/>
		<div class="posts__count">// {filteredPosts.length} · {activeCategory ?? 'all'}</div>
	</div>

	{#if filteredPosts.length === 0}
		<p class="posts__empty">{m.no_posts()}</p>
	{:else}
		<div class="log">
			{#each filteredPosts as post (post.slug)}
				<a class="log-row" href={postHref(post.slug)}>
					<time class="log-row__date" datetime={effectiveDate(post.date, post.updated)}>
						{formatDateShort(effectiveDate(post.date, post.updated))}
					</time>
					<div class="log-row__body">
						<span class="log-row__title">{post.title}</span>
						{#if post.description}
							<span class="log-row__desc">{post.description}</span>
						{/if}
					</div>
					<span class="log-row__cat">{post.category}</span>
				</a>
			{/each}
		</div>
	{/if}
</main>

<style>
	.posts {
		max-width: 72rem;
		margin: 0 auto;
		padding: 0 1.5rem;
	}

	/* page head */
	.page-head {
		padding: 48px 0 24px;
	}
	.crumb {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 18px;
		font-family: var(--font-mono);
		font-size: 12px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--faint);
	}
	.crumb a {
		color: var(--faint);
		text-decoration: none;
	}
	.crumb a:hover {
		color: var(--foam);
	}
	.crumb__sep {
		color: var(--line2);
	}
	.page-title {
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: clamp(30px, 5vw, 56px);
		line-height: 1.05;
		letter-spacing: -0.02em;
		color: var(--ink);
	}
	.page-lede {
		max-width: 62ch;
		margin-top: 18px;
		font-family: var(--font-sans);
		font-size: clamp(16px, 2vw, 20px);
		line-height: 1.55;
		color: var(--muted);
	}

	/* filter row */
	.posts__filter {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 20px;
	}
	.posts__count {
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--faint);
	}
	.posts__empty {
		color: var(--muted);
	}

	/* log */
	.log {
		overflow: hidden;
		border: 1px solid var(--line2);
		border-radius: 10px;
		background: color-mix(in srgb, var(--bg2) 50%, transparent);
	}
	.log-row {
		display: grid;
		grid-template-columns: 104px 1fr auto;
		gap: 20px;
		align-items: center;
		padding: 16px 22px;
		border-top: 1px solid var(--line);
		text-decoration: none;
		transition: background-color 0.2s;
	}
	.log-row:first-child {
		border-top: none;
	}
	.log-row:hover {
		background: var(--overlay);
	}
	.log-row__date {
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--faint);
		white-space: nowrap;
	}
	.log-row__body {
		min-width: 0;
	}
	.log-row__title {
		display: block;
		font-family: var(--font-sans);
		font-size: 16px;
		font-weight: 500;
		color: var(--ink);
	}
	.log-row:hover .log-row__title {
		color: var(--foam);
	}
	.log-row__desc {
		display: block;
		margin-top: 2px;
		overflow: hidden;
		font-size: 13px;
		line-height: 1.4;
		color: var(--muted);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.log-row__cat {
		padding: 3px 7px;
		border: 1px solid var(--line);
		border-radius: 5px;
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--iris);
		white-space: nowrap;
	}
	@media (max-width: 720px) {
		.log-row {
			grid-template-columns: 1fr;
			gap: 6px;
		}
		.log-row__date {
			order: -1;
		}
		.log-row__cat {
			justify-self: start;
		}
	}
</style>
