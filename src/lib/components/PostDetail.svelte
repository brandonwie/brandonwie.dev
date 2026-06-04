<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { Component } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import LanguageToggle from '$lib/components/LanguageToggle.svelte';
	import Giscus from '$lib/components/Giscus.svelte';
	import ReadingProgress from '$lib/components/ReadingProgress.svelte';
	import TableOfContents from '$lib/components/TableOfContents.svelte';
	import { formatDateLong } from '$lib/utils/date';

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
		headings?: TocHeading[];
	}

	let { meta, content, locale, isFallback = false, headings = [] }: Props = $props();

	const showToc = $derived(headings.length >= 3);

	const siteUrl = 'https://brandonwie.dev';
	const basePath = $derived(locale === 'ko' ? '/ko' : '');
	const postUrl = $derived(`${siteUrl}${basePath}/posts/${meta.slug}`);
	const ogImageUrl = $derived(`${siteUrl}/og/${meta.slug}.png`);
	const backLabel = m.back_to_home();

	let copied = $state(false);

	async function copyLink() {
		await navigator.clipboard.writeText($page.url.href);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function goBack() {
		goto(basePath || '/');
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
			author: {
				'@type': 'Person',
				name: 'Brandon Wie',
				url: siteUrl,
			},
			mainEntityOfPage: {
				'@type': 'WebPage',
				'@id': postUrl,
			},
			publisher: {
				'@type': 'Person',
				name: 'Brandon Wie',
			},
			inLanguage: locale === 'ko' ? 'ko-KR' : 'en-US',
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
	<meta property="og:url" content={postUrl} />
	<meta property="og:image" content={ogImageUrl} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="article:published_time" content={meta.date} />
	{#if meta.updated}
		<meta property="article:modified_time" content={meta.updated} />
	{/if}
	{#each meta.tags as tag}
		<meta property="article:tag" content={tag} />
	{/each}
	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={meta.title} />
	<meta name="twitter:description" content={meta.description} />
	<meta name="twitter:image" content={ogImageUrl} />
	<!-- SEO -->
	<link rel="canonical" href={postUrl} />
	<link rel="alternate" hreflang="en" href="{siteUrl}/posts/{meta.slug}" />
	<link rel="alternate" hreflang="ko" href="{siteUrl}/ko/posts/{meta.slug}" />
	<link rel="alternate" hreflang="x-default" href="{siteUrl}/posts/{meta.slug}" />
	<!-- JSON-LD structured data -->
	{@html `<script type="application/ld+json">${jsonLd}\x3C/script>`}
</svelte:head>

<div class="min-h-screen bg-terminal-bg-primary">
	<!-- Header -->
	<header class="border-b border-terminal-border bg-terminal-bg-secondary">
		<div
			class="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6"
		>
			<button
				onclick={goBack}
				class="flex items-center gap-1 text-xs text-terminal-text-muted transition-colors hover:text-terminal-accent-orange shrink-0 sm:gap-2 sm:text-sm"
			>
				<span>←</span>
				<span>{backLabel}</span>
			</button>
			<a href={basePath || '/'} class="text-terminal-accent-orange text-xs truncate sm:text-base"
				>brandonwie.dev</a
			>
			<div class="flex items-center gap-2">
				<LanguageToggle />
			</div>
		</div>
	</header>

	<!-- Article -->
	<article data-pagefind-body class="relative mx-auto max-w-4xl px-6 py-12">
		<span data-pagefind-filter="lang" class="hidden">{isFallback ? 'en' : locale}</span>
		<!-- Desktop ToC: positioned in right margin -->
		{#if showToc}
			<div data-pagefind-ignore>
				<TableOfContents {headings} />
			</div>
		{/if}

		<!-- Fallback Notice (Korean page showing English content) -->
		{#if isFallback}
			<div
				data-pagefind-ignore
				class="mb-8 rounded-lg border border-terminal-accent-yellow/30 bg-terminal-accent-yellow/10 p-4"
			>
				<p class="text-terminal-accent-yellow">
					{m.translation_notice()}
				</p>
				<a
					href="/posts/{meta.slug}"
					class="mt-2 inline-block text-sm text-terminal-text-muted underline hover:text-terminal-accent-orange"
				>
					{m.view_in_english()}
				</a>
			</div>
		{/if}

		<!-- Meta Header -->
		<header class="mb-8">
			<div class="mb-4 flex flex-wrap items-center gap-3">
				<span
					data-pagefind-filter="category"
					class="rounded-sm bg-terminal-accent-yellow/20 px-2 py-1 text-sm text-terminal-accent-yellow"
				>
					{meta.category}
				</span>
				{#each meta.tags as tag}
					<span
						class="rounded-sm bg-terminal-bg-secondary px-2 py-1 text-sm text-terminal-text-muted"
					>
						{tag}
					</span>
				{/each}
			</div>

			<h1 class="mb-4 text-3xl font-bold text-terminal-text-primary md:text-4xl">
				{meta.title}
			</h1>

			<p class="mb-4 text-lg text-terminal-text-muted">
				{meta.description}
			</p>

			<div class="flex flex-wrap items-center gap-4 text-sm text-terminal-text-dim">
				<time data-pagefind-sort="date[datetime]" datetime={meta.date}>
					{formatDateLong(meta.date)}
				</time>
				{#if meta.updated && meta.updated !== meta.date}
					<span>•</span>
					<span>{m.updated()} {formatDateLong(meta.updated)}</span>
				{/if}
				{#if meta.readingTime}
					<span>•</span>
					<span>{m.reading_time({ minutes: meta.readingTime })}</span>
				{/if}
				<button
					onclick={copyLink}
					class="ml-auto text-terminal-text-dim transition-colors hover:text-terminal-accent-orange"
				>
					{copied ? m.copied() : m.copy_link()}
				</button>
			</div>
		</header>

		<!-- Content -->
		<div class="prose-terminal prose prose-invert max-w-none">
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

	<!-- Footer -->
	<footer class="border-t border-terminal-border py-8">
		<div class="mx-auto max-w-4xl px-6 text-center">
			<button
				onclick={goBack}
				class="text-terminal-text-muted transition-colors hover:text-terminal-accent-orange"
			>
				← {backLabel}
			</button>
		</div>
	</footer>
</div>
