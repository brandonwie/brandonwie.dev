<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import HeaderControls from '$lib/components/HeaderControls.svelte';
	import type { PostMetadata } from '$lib/stores/posts';
	import { formatDateShort, effectiveDate } from '$lib/utils/date';
	import {
		absoluteUrl,
		DEFAULT_OG_IMAGE,
		localeCode,
		SITE_AUTHOR,
		SITE_NAME,
		SITE_URL,
	} from '$lib/seo';

	let { posts, basePath = '/' }: { posts: PostMetadata[]; basePath?: string } = $props();

	const recentPosts = $derived(posts.slice(0, 10));
	const rssHref = $derived(basePath === '/' ? '/rss.xml' : `${basePath}/rss.xml`);
	const locale = $derived(basePath === '/ko' ? 'ko' : 'en');
	const canonicalHref = $derived(absoluteUrl(locale === 'ko' ? '/ko' : '/'));
	const pageTitle = $derived(m.site_title());
	const pageDescription = $derived(m.site_description());
	const jsonLd = $derived(
		JSON.stringify([
			{
				'@context': 'https://schema.org',
				'@type': 'WebSite',
				name: SITE_NAME,
				url: SITE_URL,
				description: pageDescription,
				inLanguage: locale === 'ko' ? 'ko-KR' : 'en-US',
				publisher: {
					'@type': 'Person',
					name: SITE_AUTHOR,
					url: SITE_URL,
				},
			},
			{
				'@context': 'https://schema.org',
				'@type': 'Person',
				name: SITE_AUTHOR,
				url: SITE_URL,
				jobTitle: 'Software Engineer',
				sameAs: [
					'https://github.com/brandonwie',
					'https://linkedin.com/in/brandonwie',
					'https://x.com/BrandonWie',
				],
			},
		]),
	);

	function postHref(slug: string): string {
		const base = basePath === '/' ? '' : basePath;
		return `${base}/posts/${slug}`;
	}

	function allPostsHref(): string {
		const base = basePath === '/' ? '' : basePath;
		return `${base}/posts`;
	}

	function aboutHref(): string {
		const base = basePath === '/' ? '' : basePath;
		return `${base}/about`;
	}

	function systemHref(): string {
		const base = basePath === '/' ? '' : basePath;
		return `${base}/system/3b`;
	}

	const searchHref = $derived(`${basePath === '/' ? '' : basePath}/search`);
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={canonicalHref} />
	<link rel="alternate" hreflang="en" href={absoluteUrl('/')} />
	<link rel="alternate" hreflang="ko" href={absoluteUrl('/ko')} />
	<link rel="alternate" hreflang="x-default" href={absoluteUrl('/')} />
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
	<meta name="twitter:creator" content="@BrandonWie" />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<script type="application/ld+json">${jsonLd}\x3C/script>`}
</svelte:head>

<div class="min-h-screen bg-bg">
	<!-- Header -->
	<header class="border-b border-line">
		<div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
			<a href={basePath} class="font-mono text-sm font-semibold text-ink no-underline sm:text-base">
				brandonwie.dev
			</a>
			<nav class="flex items-center gap-3 sm:gap-4" aria-label={m.primary_navigation()}>
				<a
					href={aboutHref()}
					class="text-sm text-muted no-underline transition-colors hover:text-accent"
				>
					{m.about_title()}
				</a>
				<a
					href={allPostsHref()}
					class="text-sm text-muted no-underline transition-colors hover:text-accent"
				>
					{m.posts_title()}
				</a>
				<a
					href={searchHref}
					class="text-muted no-underline transition-colors hover:text-accent"
					aria-label={m.search_title()}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
						focusable="false"
					>
						<circle cx="11" cy="11" r="8" />
						<path d="m21 21-4.3-4.3" />
					</svg>
				</a>
				<HeaderControls />
			</nav>
		</div>
	</header>

	<main id="main-content" class="mx-auto max-w-5xl px-4 py-12 sm:px-6">
		<!--
		  Hero / identity area. Kept text-only and self-contained (modular) so a
		  future top-left identity mark can slot in here without restructuring.
		-->
		<section class="mb-14 max-w-2xl">
			<h1 class="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
				Brandon Seokhyun Wie
			</h1>
			<p class="mt-3 text-base leading-relaxed text-muted">
				{m.blog_tagline()}
			</p>
			<p class="mt-4 text-sm leading-relaxed text-faint">
				{m.blog_bio()}
			</p>
		</section>

		<!-- Work -->
		<section class="mb-14">
			<h2 class="mb-4 font-mono text-xs font-semibold uppercase tracking-wider text-faint">
				{m.work_section()}
			</h2>
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<a
					href="https://www.archcalendar.com"
					target="_blank"
					rel="noopener noreferrer"
					class="group block rounded border border-line bg-surface p-5 no-underline transition-colors hover:border-accent"
				>
					<div class="flex items-baseline justify-between gap-2">
						<span class="font-semibold text-ink transition-colors group-hover:text-accent">
							Arch Calendar
						</span>
						<span class="shrink-0 font-mono text-[11px] text-faint">{m.archcalendar_role()}</span>
					</div>
					<p class="mt-1 text-xs text-muted">{m.archcalendar_subtitle()}</p>
					<p class="mt-2 text-xs leading-relaxed text-faint">{m.archcalendar_description()}</p>
				</a>

				<a
					href={systemHref()}
					class="group block rounded border border-line bg-surface p-5 no-underline transition-colors hover:border-accent"
				>
					<div class="flex items-baseline justify-between gap-2">
						<span class="font-semibold text-ink transition-colors group-hover:text-accent">
							{m.system_3b_title()}
						</span>
						<span class="shrink-0 font-mono text-[11px] text-faint">/system/3b</span>
					</div>
					<p class="mt-1 text-xs text-muted">{m.system_3b_card_subtitle()}</p>
					<p class="mt-2 text-xs leading-relaxed text-faint">{m.system_3b_card_description()}</p>
				</a>

				<a
					href="https://crucio.brandonwie.dev"
					target="_blank"
					rel="noopener noreferrer"
					class="group block rounded border border-line bg-surface p-5 no-underline transition-colors hover:border-accent"
				>
					<div class="flex items-baseline justify-between gap-2">
						<span class="font-semibold text-ink transition-colors group-hover:text-accent">
							Project Crucio
						</span>
						<span class="shrink-0 font-mono text-[11px] text-faint">{m.crucio_role()}</span>
					</div>
					<p class="mt-1 text-xs text-muted">{m.portfolio_subtitle()}</p>
					<p class="mt-2 text-xs leading-relaxed text-faint">{m.portfolio_description()}</p>
				</a>
			</div>
		</section>

		<!-- Recent Posts -->
		<section>
			<div class="mb-4 flex items-baseline justify-between gap-4">
				<h2 class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
					{m.recent_posts()}
				</h2>
				{#if posts.length > 10}
					<a
						href={allPostsHref()}
						class="shrink-0 text-sm text-accent no-underline hover:underline"
					>
						{m.see_all_posts({ count: posts.length })} →
					</a>
				{/if}
			</div>

			{#if recentPosts.length === 0}
				<p class="text-muted">{m.no_posts()}</p>
			{:else}
				<div class="grid gap-4 sm:grid-cols-2">
					{#each recentPosts as post (post.slug)}
						<a
							href={postHref(post.slug)}
							class="group block rounded border border-line bg-surface p-5 no-underline transition-colors hover:border-accent"
						>
							<div class="mb-2 flex items-center gap-2 font-mono text-xs">
								<time
									datetime={effectiveDate(post.date, post.updated)}
									class="text-faint tabular-nums"
								>
									{formatDateShort(effectiveDate(post.date, post.updated))}
								</time>
								{#if post.updated && post.updated !== post.date}
									<span class="text-ok" title="{m.updated()} {formatDateShort(post.updated)}"
										>↻</span
									>
								{/if}
							</div>
							<h3
								class="text-base font-semibold text-ink transition-colors group-hover:text-accent"
							>
								{post.title}
							</h3>
							{#if post.description}
								<p class="mt-2 text-sm leading-relaxed text-muted">{post.description}</p>
							{/if}
							{#if post.tags?.length}
								<div class="mt-3 flex flex-wrap gap-1.5 font-mono text-[11px]">
									{#each post.tags.slice(0, 4) as tag (tag)}
										<span class="rounded-sm border border-line px-1.5 py-0.5 text-faint">{tag}</span
										>
									{/each}
									{#if post.tags.length > 4}
										<span class="rounded-sm border border-line px-1.5 py-0.5 text-faint"
											>+{post.tags.length - 4}</span
										>
									{/if}
								</div>
							{/if}
						</a>
					{/each}
				</div>
			{/if}
		</section>
	</main>

	<!-- Footer -->
	<footer class="mt-8 border-t border-line">
		<div
			class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-faint sm:px-6"
		>
			<span>&copy; Brandon Seokhyun Wie</span>
			<div class="flex flex-wrap items-center gap-4">
				<a
					href="https://github.com/brandonwie"
					class="no-underline transition-colors hover:text-ink"
					target="_blank"
					rel="noopener noreferrer">GitHub</a
				>
				<a
					href="https://linkedin.com/in/brandonwie"
					class="no-underline transition-colors hover:text-ink"
					target="_blank"
					rel="noopener noreferrer">LinkedIn</a
				>
				<a
					href="https://x.com/BrandonWie"
					class="no-underline transition-colors hover:text-ink"
					target="_blank"
					rel="noopener noreferrer">X</a
				>
				<a
					href="mailto:brandon@brandonwie.dev"
					class="no-underline transition-colors hover:text-ink">Email</a
				>
				<a
					href={rssHref}
					class="flex items-center gap-1 no-underline transition-colors hover:text-ink"
					target="_blank"
					rel="noopener noreferrer"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
						focusable="false"
						><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle
							cx="5"
							cy="19"
							r="1"
						/></svg
					>
					RSS
				</a>
			</div>
		</div>
	</footer>
</div>
