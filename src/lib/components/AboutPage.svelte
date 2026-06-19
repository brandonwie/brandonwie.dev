<script lang="ts">
	import HeaderControls from '$lib/components/HeaderControls.svelte';
	import { getAboutContent, type AboutLocale } from '$lib/data/about';
	import { m } from '$lib/paraglide/messages';
	import { DEFAULT_OG_IMAGE, localeCode, SITE_NAME } from '$lib/seo';

	let { locale = 'en' }: { locale?: AboutLocale } = $props();

	const content = $derived(getAboutContent(locale));
	const homeHref = $derived(locale === 'ko' ? '/ko' : '/');
	const postsHref = $derived(locale === 'ko' ? '/ko/posts' : '/posts');
	const studyHref = $derived(locale === 'ko' ? '/ko/study' : '/study');
	const searchHref = $derived(locale === 'ko' ? '/ko/search' : '/search');
	const systemHref = $derived(locale === 'ko' ? '/ko/system/3b' : '/system/3b');
	const canonicalHref = $derived(
		locale === 'ko' ? 'https://brandonwie.dev/ko/about' : 'https://brandonwie.dev/about',
	);
	const pageTitle = $derived(`${content.metaTitle} | Brandon Wie`);

	const toneClass = {
		accent: 'text-accent',
		foam: 'text-foam',
		gold: 'text-gold',
		rose: 'text-rose',
	};

	function isExternal(href: string): boolean {
		return href.startsWith('http');
	}
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={content.metaDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={content.metaDescription} />
	<meta property="og:url" content={canonicalHref} />
	<meta property="og:image" content={DEFAULT_OG_IMAGE} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:locale" content={localeCode(locale)} />
	<meta property="og:locale:alternate" content={localeCode(locale === 'ko' ? 'en' : 'ko')} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={content.metaDescription} />
	<meta name="twitter:image" content={DEFAULT_OG_IMAGE} />
	<link rel="canonical" href={canonicalHref} />
	<link rel="alternate" hreflang="en" href="https://brandonwie.dev/about" />
	<link rel="alternate" hreflang="ko" href="https://brandonwie.dev/ko/about" />
	<link rel="alternate" hreflang="x-default" href="https://brandonwie.dev/about" />
</svelte:head>

<div class="min-h-screen bg-bg">
	<header class="border-b border-line">
		<div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
			<a href={homeHref} class="font-mono text-sm font-semibold text-ink no-underline sm:text-base">
				brandonwie.dev
			</a>
			<nav class="flex items-center gap-3 text-sm sm:gap-4" aria-label={m.primary_navigation()}>
				<a href={postsHref} class="text-muted no-underline transition-colors hover:text-accent">
					{m.posts_title()}
				</a>
				<a href={studyHref} class="text-muted no-underline transition-colors hover:text-accent">
					{m.study_title()}
				</a>
				<a href={systemHref} class="text-muted no-underline transition-colors hover:text-accent">
					3B
				</a>
				<a
					href={searchHref}
					class="text-muted no-underline transition-colors hover:text-accent"
					aria-label={m.search_title()}
				>
					⌕
				</a>
				<HeaderControls />
			</nav>
		</div>
	</header>

	<main id="main-content" class="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
		<section class="grid gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] lg:items-end">
			<div>
				<p class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
					{content.eyebrow}
				</p>
				<h1
					class="mt-4 max-w-4xl text-4xl font-semibold leading-tight text-ink sm:text-5xl lg:text-6xl"
				>
					{content.title}
				</h1>
				<p class="mt-6 max-w-2xl text-lg leading-8 text-muted">
					{content.subtitle}
				</p>
				<div class="mt-8 flex flex-wrap gap-3">
					{#each content.links as link (link.href)}
						<a
							href={link.href}
							target={link.external ? '_blank' : undefined}
							rel={link.external ? 'noopener noreferrer' : undefined}
							class="rounded border border-line bg-surface px-3 py-2 text-sm text-ink no-underline transition-colors hover:border-accent hover:text-accent"
						>
							{link.label}
						</a>
					{/each}
				</div>
			</div>

			<aside class="border border-line bg-surface p-4">
				<div class="flex items-center justify-between gap-4 border-b border-line pb-3">
					<p class="font-mono text-xs uppercase tracking-wider text-faint">
						{content.visualCaption}
					</p>
					<span class="font-mono text-xs text-accent">live</span>
				</div>
				<div class="mt-5 grid gap-3">
					{#each content.visualLayers as layer, index (layer)}
						<div class="grid grid-cols-[2.5rem_1fr] items-center gap-3">
							<span class="font-mono text-xs text-faint">0{index + 1}</span>
							<div class="h-2 border border-line bg-highlight-low">
								<div
									class="h-full bg-accent"
									style={`width: ${Math.min(42 + index * 12, 92)}%`}
								></div>
							</div>
							<span class="col-start-2 text-sm text-muted">{layer}</span>
						</div>
					{/each}
				</div>
				<div class="mt-6 grid grid-cols-2 gap-3">
					{#each content.metrics as metric (metric.label)}
						<div class="border border-line bg-bg p-3">
							<div class={`font-mono text-xl font-semibold ${toneClass[metric.tone]}`}>
								{metric.value}
							</div>
							<div class="mt-1 text-xs leading-relaxed text-faint">{metric.label}</div>
						</div>
					{/each}
				</div>
			</aside>
		</section>

		<section class="mt-14 grid gap-5 text-base leading-8 text-muted lg:grid-cols-2">
			{#each content.intro as paragraph (paragraph)}
				<p>{paragraph}</p>
			{/each}
		</section>

		<section class="mt-16">
			<h2 class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
				{content.sections.arc}
			</h2>
			<div class="mt-5 grid gap-4 lg:grid-cols-4">
				{#each content.timeline as item (item.year)}
					<article class="border border-line bg-surface p-5">
						<p class="font-mono text-xs text-accent">{item.year}</p>
						<h3 class="mt-3 text-base font-semibold text-ink">{item.title}</h3>
						<p class="mt-3 text-sm leading-7 text-muted">{item.body}</p>
					</article>
				{/each}
			</div>
		</section>

		<section class="mt-16 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
			<div>
				<h2 class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
					{content.sections.now}
				</h2>
				<p class="mt-4 max-w-sm text-sm leading-7 text-muted">
					{locale === 'ko'
						? '현재의 일은 백엔드 기능 하나가 아니라 운영 가능한 제품 시스템 전체에 가깝습니다.'
						: 'The current work is less about one backend feature and more about the product system that has to keep operating.'}
				</p>
			</div>
			<div class="grid gap-4 sm:grid-cols-3">
				{#each content.now as item (item.title)}
					<article class="border border-line bg-surface p-5">
						<h3 class="text-base font-semibold text-ink">{item.title}</h3>
						<p class="mt-3 text-sm leading-7 text-muted">{item.body}</p>
					</article>
				{/each}
			</div>
		</section>

		<section class="mt-16">
			<h2 class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
				{content.sections.systems}
			</h2>
			<div class="mt-5 grid gap-4 lg:grid-cols-3">
				{#each content.systems as system (system.title)}
					<a
						href={system.href}
						target={isExternal(system.href) ? '_blank' : undefined}
						rel={isExternal(system.href) ? 'noopener noreferrer' : undefined}
						class="group block overflow-hidden border border-line bg-surface text-ink no-underline transition-colors hover:border-accent"
					>
						<img src={system.image} alt={system.alt} class="aspect-[16/9] w-full object-cover" />
						<div class="p-5">
							<p class="font-mono text-xs uppercase tracking-wider text-faint">{system.kicker}</p>
							<h3 class="mt-2 text-lg font-semibold transition-colors group-hover:text-accent">
								{system.title}
							</h3>
							<p class="mt-3 text-sm leading-7 text-muted">{system.body}</p>
						</div>
					</a>
				{/each}
			</div>
		</section>

		<section class="mt-16 grid gap-6 lg:grid-cols-[1fr_1fr]">
			<div>
				<h2 class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
					{content.sections.principles}
				</h2>
				<div class="mt-5 grid gap-4">
					{#each content.principles as principle (principle.title)}
						<article class="border-l border-accent bg-surface px-5 py-4">
							<h3 class="text-base font-semibold text-ink">{principle.title}</h3>
							<p class="mt-2 text-sm leading-7 text-muted">{principle.body}</p>
						</article>
					{/each}
				</div>
			</div>

			<div class="border border-line bg-surface p-6">
				<p class="font-mono text-xs uppercase tracking-wider text-gold">
					{content.learning.kicker}
				</p>
				<h2 class="mt-3 text-2xl font-semibold leading-snug text-ink">{content.learning.title}</h2>
				<p class="mt-4 text-sm leading-7 text-muted">{content.learning.body}</p>
				<ul class="mt-5 grid gap-3">
					{#each content.learning.items as item (item)}
						<li class="flex gap-3 text-sm leading-7 text-muted">
							<span class="mt-3 h-1.5 w-1.5 shrink-0 bg-accent"></span>
							<span>{item}</span>
						</li>
					{/each}
				</ul>
			</div>
		</section>
	</main>
</div>
