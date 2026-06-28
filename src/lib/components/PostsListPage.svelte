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
	import CategorySidebar from '$lib/components/CategorySidebar.svelte';
	import PostCard from '$lib/components/PostCard.svelte';
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
		<div class="card-grid">
			{#each filteredPosts as post (post.slug)}
				<PostCard {post} href={postHref(post.slug)} headingLevel="h2" />
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

	/* card grid */
	.card-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 20px;
	}
	@media (max-width: 880px) {
		.card-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 560px) {
		.card-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
