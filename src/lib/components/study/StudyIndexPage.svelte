<script lang="ts">
	import StudyHeader from '$lib/components/study/StudyHeader.svelte';
	import { getStudyIndexContent, type StudyLocale } from '$lib/data/study';
	import { DEFAULT_OG_IMAGE, localeCode, SITE_NAME } from '$lib/seo';

	let { locale = 'en' }: { locale?: StudyLocale } = $props();

	const content = $derived(getStudyIndexContent(locale));
	const canonicalHref = $derived(
		locale === 'ko' ? 'https://brandonwie.dev/ko/study' : 'https://brandonwie.dev/study',
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
	<link rel="alternate" hreflang="en" href="https://brandonwie.dev/study" />
	<link rel="alternate" hreflang="ko" href="https://brandonwie.dev/ko/study" />
	<link rel="alternate" hreflang="x-default" href="https://brandonwie.dev/study" />
</svelte:head>

<div class="min-h-screen bg-bg">
	<StudyHeader {locale} nav={content.nav} active="study" />

	<main id="main-content" data-pagefind-body class="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
		<section class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
			<div>
				<p class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
					{content.eyebrow}
				</p>
				<h1 class="mt-4 max-w-4xl text-3xl font-semibold leading-tight text-ink sm:text-5xl">
					{content.title}
				</h1>
				<p class="mt-6 max-w-2xl text-lg leading-8 text-muted">{content.subtitle}</p>
			</div>
			<aside class="border border-line bg-surface p-5">
				<p class="font-mono text-xs uppercase tracking-wider text-faint">
					{content.sections.workflow}
				</p>
				<h2 class="mt-3 text-xl font-semibold text-ink">{content.workflow.title}</h2>
				<p class="mt-3 text-sm leading-7 text-muted">{content.workflow.body}</p>
			</aside>
		</section>

		<section class="mt-16">
			<h2 class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
				{content.sections.courses}
			</h2>
			<div class="mt-5 grid gap-4 lg:grid-cols-2">
				{#each content.courses as course (course.slug)}
					<a
						href={course.href}
						class="group block border border-line bg-surface p-6 text-ink no-underline transition-colors hover:border-accent"
					>
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div>
								<p class="font-mono text-xs uppercase tracking-wider text-accent">
									{course.status}
								</p>
								<h3 class="mt-3 text-2xl font-semibold transition-colors group-hover:text-accent">
									{course.title}
								</h3>
							</div>
							<span class="font-mono text-xs text-faint">{course.updated}</span>
						</div>
						<p class="mt-4 max-w-2xl text-sm leading-7 text-muted">{course.summary}</p>
						<div class="mt-5 flex flex-wrap gap-2">
							{#each course.learned as item (item)}
								<span class="border border-line bg-bg px-2 py-1 font-mono text-[11px] text-faint">
									{item}
								</span>
							{/each}
						</div>
						<div class="mt-6 grid gap-3 sm:grid-cols-2">
							{#each course.modules as module (module)}
								<div class="border-l border-accent bg-bg px-3 py-2 text-sm text-muted">
									{module}
								</div>
							{/each}
						</div>
						<p class="mt-5 font-mono text-xs text-faint">{course.sourceCount}</p>
					</a>
				{/each}
			</div>
		</section>

		<section class="mt-16 border border-line bg-surface p-6">
			<ul class="grid gap-3 md:grid-cols-3">
				{#each content.workflow.items as item (item)}
					<li class="text-sm leading-7 text-muted">
						<span class="mr-2 font-mono text-accent">/</span>{item}
					</li>
				{/each}
			</ul>
		</section>
	</main>
</div>
