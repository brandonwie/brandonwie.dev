<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Component } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import BackToPosts from '$lib/components/BackToPosts.svelte';
	import { postsHref } from '$lib/data/nav';
	import Giscus from '$lib/components/Giscus.svelte';
	import ReadingProgress from '$lib/components/ReadingProgress.svelte';
	import TableOfContents from '$lib/components/TableOfContents.svelte';
	import { formatDateLong } from '$lib/utils/date';
	import { absoluteUrl, localeCode, SITE_AUTHOR, SITE_NAME, SITE_URL } from '$lib/seo';

	interface TocHeading {
		text: string;
		depth: number;
		id: string;
	}

	interface PostMeta {
		title: string;
		description: string;
		date: string;
		updated?: string;
		tags: string[];
		category: string;
		slug: string;
		readingTime?: number;
		draft?: boolean;
	}

	interface Props {
		meta: PostMeta;
		content: Component | null;
		locale: 'en' | 'ko';
		isFallback?: boolean;
		hasKoreanTranslation?: boolean;
		headings?: TocHeading[];
	}

	let {
		meta,
		content,
		locale,
		isFallback = false,
		hasKoreanTranslation = false,
		headings = [],
	}: Props = $props();

	const showToc = $derived(headings.length >= 3);

	const englishPostUrl = $derived(absoluteUrl(`/posts/${meta.slug}`));
	const koreanPostUrl = $derived(absoluteUrl(`/ko/posts/${meta.slug}`));
	const postUrl = $derived(
		isFallback ? englishPostUrl : locale === 'ko' ? koreanPostUrl : englishPostUrl,
	);
	const contentLocale = $derived(isFallback ? 'en' : locale);
	const contentLanguage = $derived(contentLocale === 'ko' ? 'ko-KR' : 'en-US');
	const ogImageUrl = $derived(`${SITE_URL}/og/${meta.slug}.png`);

	let copied = $state(false);

	async function copyLink() {
		await navigator.clipboard.writeText(page.url.href);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function goBack() {
		goto(postsHref(locale));
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Backspace') {
			const target = event.target as HTMLElement;
			const isEditable =
				target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
			if (!isEditable) {
				event.preventDefault();
				goBack();
			}
		}
	}

	// JSON-LD Article schema for rich search results
	const jsonLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'Article',
			headline: meta.title,
			description: meta.description,
			datePublished: meta.date,
			dateModified: meta.updated || meta.date,
			image: ogImageUrl,
			author: {
				'@type': 'Person',
				name: SITE_AUTHOR,
				url: SITE_URL,
			},
			mainEntityOfPage: {
				'@type': 'WebPage',
				'@id': postUrl,
			},
			publisher: {
				'@type': 'Person',
				name: SITE_AUTHOR,
				url: SITE_URL,
			},
			inLanguage: contentLanguage,
			keywords: meta.tags.join(', '),
		}),
	);
</script>

<svelte:window onkeydown={handleKeyDown} />

<ReadingProgress />

<svelte:head>
	<title>{meta.title} | Brandon Wie</title>
	<meta name="description" content={meta.description} />
	<!-- Open Graph -->
	<meta property="og:title" content={meta.title} />
	<meta property="og:description" content={meta.description} />
	<meta property="og:type" content="article" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:url" content={postUrl} />
	<meta property="og:image" content={ogImageUrl} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:locale" content={localeCode(contentLocale)} />
	{#if contentLocale === 'en' && hasKoreanTranslation}
		<meta property="og:locale:alternate" content={localeCode('ko')} />
	{:else if contentLocale === 'ko'}
		<meta property="og:locale:alternate" content={localeCode('en')} />
	{/if}
	<meta property="article:published_time" content={meta.date} />
	{#if meta.updated}
		<meta property="article:modified_time" content={meta.updated} />
	{/if}
	<meta property="article:author" content={SITE_AUTHOR} />
	{#each meta.tags as tag (tag)}
		<meta property="article:tag" content={tag} />
	{/each}
	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={meta.title} />
	<meta name="twitter:description" content={meta.description} />
	<meta name="twitter:image" content={ogImageUrl} />
	<meta name="twitter:creator" content="@BrandonWie" />
	{#if isFallback}
		<meta name="robots" content="noindex,follow" />
	{/if}
	<!-- SEO -->
	<link rel="canonical" href={postUrl} />
	<link rel="alternate" hreflang="en" href={englishPostUrl} />
	{#if hasKoreanTranslation}
		<link rel="alternate" hreflang="ko" href={koreanPostUrl} />
	{/if}
	<link rel="alternate" hreflang="x-default" href={englishPostUrl} />
	<!-- JSON-LD structured data -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<script type="application/ld+json">${jsonLd}\x3C/script>`}
</svelte:head>

<main id="main-content" class="post">
	<div class="post__back" data-pagefind-ignore>
		<BackToPosts {locale} />
	</div>
	<article data-pagefind-body>
		<span data-pagefind-filter="lang" class="hidden">{isFallback ? 'en' : locale}</span>
		<!-- Desktop ToC: positioned in right margin -->
		{#if showToc}
			<div data-pagefind-ignore>
				<TableOfContents {headings} />
			</div>
		{/if}

		<!-- Fallback Notice (Korean page showing English content) -->
		{#if isFallback}
			<div class="post__fallback" data-pagefind-ignore>
				<p>{m.translation_notice()}</p>
				<a href={`${postsHref('en')}/${meta.slug}`}>{m.view_in_english()}</a>
			</div>
		{/if}

		<!-- Meta Header -->
		<header class="post__head">
			<div class="crumb">
				<a href={postsHref(locale)}>~/posts</a><span class="crumb__sep">/</span><span
					data-pagefind-filter="category">{meta.category}</span
				>
			</div>

			<h1 class="post__title">{meta.title}</h1>

			<p class="post__lede">{meta.description}</p>

			<div class="post__meta">
				<time data-pagefind-sort="date[datetime]" datetime={meta.date}>
					{formatDateLong(meta.date)}
				</time>
				{#if meta.updated && meta.updated !== meta.date}
					<span class="post__sep">·</span>
					<span>{m.updated()} {formatDateLong(meta.updated)}</span>
				{/if}
				{#if meta.readingTime}
					<span class="post__sep">·</span>
					<span>{m.reading_time({ minutes: meta.readingTime })}</span>
				{/if}
				<button
					type="button"
					class="post__copy"
					onclick={copyLink}
					aria-label={copied ? m.copied() : m.copy_link()}
				>
					{copied ? m.copied() : m.copy_link()}
				</button>
			</div>

			{#if meta.tags.length}
				<div class="post__tags">
					{#each meta.tags as tag (tag)}
						<span class="post__tag">{tag}</span>
					{/each}
				</div>
			{/if}
		</header>

		<!-- Content -->
		<div class="prose-terminal prose post__content">
			{#if content}
				{@const Content = content}
				<Content />
			{/if}
		</div>

		<!-- Comments -->
		<div data-pagefind-ignore>
			<Giscus slug={meta.slug} lang={locale} />
		</div>
	</article>

	<!-- Bottom back link (not a footer — the layout owns the global footer) -->
	<div class="post__bottom" data-pagefind-ignore>
		<BackToPosts {locale} />
	</div>
</main>

<style>
	.post {
		position: relative;
		max-width: 56rem;
		margin: 0 auto;
		padding: 40px 1.5rem 0;
	}
	.post__back {
		margin-bottom: 24px;
	}
	.post__fallback {
		margin-bottom: 32px;
		padding: 14px 18px;
		border: 1px dashed color-mix(in srgb, var(--gold) 40%, transparent);
		border-radius: 10px;
		background: color-mix(in srgb, var(--gold) 8%, transparent);
	}
	.post__fallback p {
		margin: 0;
		color: var(--gold);
	}
	.post__fallback a {
		display: inline-block;
		margin-top: 6px;
		font-size: 13px;
		color: var(--muted);
		text-decoration: underline;
	}
	.post__fallback a:hover {
		color: var(--foam);
	}
	.post__head {
		margin-bottom: 36px;
		padding-bottom: 28px;
		border-bottom: 1px solid var(--line);
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
	.post__title {
		margin-bottom: 16px;
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: clamp(28px, 4.5vw, 48px);
		line-height: 1.08;
		letter-spacing: -0.02em;
		color: var(--ink);
	}
	.post__lede {
		max-width: 62ch;
		margin-bottom: 20px;
		font-family: var(--font-sans);
		font-size: clamp(16px, 2vw, 20px);
		line-height: 1.55;
		color: var(--muted);
	}
	.post__meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--faint);
	}
	.post__sep {
		color: var(--line2);
	}
	.post__copy {
		margin-left: auto;
		border: none;
		background: transparent;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--faint);
		cursor: pointer;
		transition: color 0.2s;
	}
	.post__copy:hover {
		color: var(--foam);
	}
	.post__tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 16px;
	}
	.post__tag {
		padding: 3px 7px;
		border: 1px solid var(--line);
		border-radius: 5px;
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--muted);
	}
	.post__bottom {
		margin-top: 40px;
		padding: 24px 0 8px;
		border-top: 1px solid var(--line);
	}
</style>
