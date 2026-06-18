<script lang="ts">
	import ArrayListVisualizer from '$lib/components/study/ArrayListVisualizer.svelte';
	import BigOExplorer from '$lib/components/study/BigOExplorer.svelte';
	import BinarySearchVisualizer from '$lib/components/study/BinarySearchVisualizer.svelte';
	import RecursionTrace from '$lib/components/study/RecursionTrace.svelte';
	import StackQueueVisualizer from '$lib/components/study/StackQueueVisualizer.svelte';
	import StudyHeader from '$lib/components/study/StudyHeader.svelte';
	import { DSA_I_SOURCE_FILES, getDsaIContent, type StudyLocale } from '$lib/data/study';
	import { DEFAULT_OG_IMAGE, localeCode, SITE_NAME } from '$lib/seo';

	let { locale = 'en' }: { locale?: StudyLocale } = $props();

	const content = $derived(getDsaIContent(locale));
	const canonicalHref = $derived(
		locale === 'ko'
			? 'https://brandonwie.dev/ko/study/dsa-i'
			: 'https://brandonwie.dev/study/dsa-i',
	);
	const pageTitle = $derived(`${content.metaTitle} | Brandon Wie`);
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
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={content.metaDescription} />
	<meta name="twitter:image" content={DEFAULT_OG_IMAGE} />
	<link rel="canonical" href={canonicalHref} />
	<link rel="alternate" hreflang="en" href="https://brandonwie.dev/study/dsa-i" />
	<link rel="alternate" hreflang="ko" href="https://brandonwie.dev/ko/study/dsa-i" />
	<link rel="alternate" hreflang="x-default" href="https://brandonwie.dev/study/dsa-i" />
</svelte:head>

<div class="min-h-screen bg-bg">
	<StudyHeader {locale} nav={content.nav} active="study" />

	<main id="main-content" data-pagefind-body class="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
		<section class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
			<div>
				<p class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
					{content.eyebrow}
				</p>
				<h1 class="mt-4 max-w-4xl text-3xl font-semibold leading-tight text-ink sm:text-5xl">
					{content.title}
				</h1>
				<p class="mt-6 max-w-3xl text-lg leading-8 text-muted">{content.subtitle}</p>
			</div>
			<aside class="border border-line bg-surface p-5">
				<p class="font-mono text-xs uppercase tracking-wider text-faint">
					{content.sections.source}
				</p>
				<p class="mt-3 font-mono text-sm text-accent">{content.source.rootLabel}</p>
				<p class="mt-3 text-sm leading-7 text-muted">{content.source.body}</p>
			</aside>
		</section>

		<section class="mt-12 grid gap-3 md:grid-cols-5">
			{#each content.coverage as item (item)}
				<div class="border border-line bg-surface p-4 text-sm leading-6 text-muted">{item}</div>
			{/each}
		</section>

		<section class="mt-16">
			<h2 class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
				{content.sections.map}
			</h2>
			<div class="mt-5 grid gap-4 lg:grid-cols-5">
				{#each content.modules as module (module.title)}
					<article class="border border-line bg-surface p-5">
						<p class="font-mono text-xs uppercase tracking-wider text-accent">{module.kicker}</p>
						<h3 class="mt-3 text-lg font-semibold text-ink">{module.title}</h3>
						<p class="mt-3 text-sm leading-7 text-muted">{module.summary}</p>
						<ul class="mt-4 grid gap-2">
							{#each module.points as point (point)}
								<li class="text-xs leading-6 text-faint">/ {point}</li>
							{/each}
						</ul>
					</article>
				{/each}
			</div>
		</section>

		<section class="mt-16">
			<h2 class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
				{content.sections.lab}
			</h2>
			<div class="mt-5 grid min-w-0 gap-5 lg:grid-cols-2">
				<BigOExplorer copy={content.visuals.bigO} />
				<ArrayListVisualizer copy={content.visuals.arrayList} />
				<RecursionTrace copy={content.visuals.recursion} />
				<BinarySearchVisualizer copy={content.visuals.binarySearch} />
				<StackQueueVisualizer copy={content.visuals.stackQueue} />
			</div>
		</section>

		<section class="mt-16">
			<h2 class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
				{content.sections.notes}
			</h2>
			<div class="mt-5 grid gap-4 lg:grid-cols-3">
				{#each content.concepts as concept (concept.title)}
					<article class="border border-line bg-surface p-5">
						<h3 class="text-lg font-semibold text-ink">{concept.title}</h3>
						<p class="mt-3 text-sm leading-7 text-muted">{concept.body}</p>
						<p class="mt-4 font-mono text-xs text-faint">{concept.source}</p>
					</article>
				{/each}
			</div>
		</section>

		<section class="mt-16 grid gap-5 lg:grid-cols-[1fr_1fr]">
			<div class="border border-line bg-surface p-5">
				<h2 class="text-xl font-semibold text-ink">{content.source.title}</h2>
				<ul class="mt-5 grid gap-3">
					{#each content.source.policy as item (item)}
						<li class="text-sm leading-7 text-muted">
							<span class="mr-2 text-accent">/</span>{item}
						</li>
					{/each}
				</ul>
			</div>
			<div class="border border-line bg-surface p-5">
				<p class="font-mono text-xs uppercase tracking-wider text-faint">
					{DSA_I_SOURCE_FILES.length}
					{content.labels.sourceFiles}
				</p>
				<div class="mt-4 grid max-h-72 gap-2 overflow-y-auto pr-2">
					{#each DSA_I_SOURCE_FILES as source (source.path)}
						<div class="grid grid-cols-[1fr_5rem] gap-3 border border-line bg-bg px-3 py-2">
							<span class="truncate font-mono text-xs text-muted">{source.path}</span>
							<span class="text-right font-mono text-[10px] text-faint"
								>{source.sha256.slice(0, 8)}</span
							>
						</div>
					{/each}
				</div>
			</div>
		</section>
	</main>
</div>
