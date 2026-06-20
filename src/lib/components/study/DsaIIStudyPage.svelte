<script lang="ts">
	import BstRemovalVisualizer from '$lib/components/study/BstRemovalVisualizer.svelte';
	import BstTraversalVisualizer from '$lib/components/study/BstTraversalVisualizer.svelte';
	import HashMapVisualizer from '$lib/components/study/HashMapVisualizer.svelte';
	import HeapVisualizer from '$lib/components/study/HeapVisualizer.svelte';
	import StudyPageShell from '$lib/components/study/StudyPageShell.svelte';
	import StudyRoadmap from '$lib/components/study/StudyRoadmap.svelte';
	import StudySeoHead from '$lib/components/study/StudySeoHead.svelte';
	import { getDsaIIContent, type StudyLocale } from '$lib/data/study';

	let { locale = 'en' }: { locale?: StudyLocale } = $props();

	const content = $derived(getDsaIIContent(locale));
	const pageTitle = $derived(`${content.metaTitle} | Brandon Wie`);
	const insideLinks = $derived([
		{ href: '#map', label: content.sections.map },
		{ href: '#lab', label: content.sections.lab },
		{ href: '#recall', label: content.sections.recall },
	]);
</script>

<StudySeoHead {pageTitle} description={content.metaDescription} basePath="/study/dsa-ii" {locale} />

<StudyPageShell>
	<section class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
		<div>
			<p class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
				{content.eyebrow}
			</p>
			<h1 class="mt-4 max-w-4xl text-3xl font-semibold leading-tight text-ink sm:text-5xl">
				{content.title}
			</h1>
			<p class="mt-6 max-w-3xl text-lg leading-8 text-muted">{content.subtitle}</p>
		</div>
		<aside class="study-card p-5">
			<p class="font-mono text-xs uppercase tracking-wider text-faint">
				{content.sections.inside}
			</p>
			<ul class="mt-4 grid gap-2">
				{#each insideLinks as link (link.href)}
					<li>
						<a
							href={link.href}
							class="flex items-center gap-2 font-mono text-sm text-muted no-underline transition-colors hover:text-accent"
						>
							<span class="text-accent">▸</span>{link.label}
						</a>
					</li>
				{/each}
			</ul>
		</aside>
	</section>

	<section class="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each content.coverage as item (item)}
			<div class="study-card p-4 text-sm leading-6 text-muted">{item}</div>
		{/each}
	</section>

	<section id="map" class="mt-16 scroll-mt-24">
		<h2 class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
			{content.sections.map}
		</h2>
		<div class="mt-6">
			<StudyRoadmap modules={content.modules} ariaLabel={content.sections.map} />
		</div>
	</section>

	<section id="lab" class="mt-16 scroll-mt-24">
		<h2 class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
			{content.sections.lab}
		</h2>
		<div class="mt-5 grid min-w-0 gap-5 lg:grid-cols-2">
			<BstTraversalVisualizer copy={content.visuals.bstTraversal} />
			<BstRemovalVisualizer copy={content.visuals.bstRemoval} />
			<HeapVisualizer copy={content.visuals.heap} />
			<HashMapVisualizer copy={content.visuals.hashMap} />
		</div>
	</section>

	<section class="mt-16">
		<h2 class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
			{content.sections.notes}
		</h2>
		<div class="mt-5 grid gap-4 lg:grid-cols-3">
			{#each content.concepts as concept (concept.title)}
				<article class="study-card p-5">
					<h3 class="text-lg font-semibold text-ink">{concept.title}</h3>
					<p class="mt-3 text-sm leading-7 text-muted">{concept.body}</p>
					<p class="mt-4 font-mono text-xs text-faint">{concept.source}</p>
				</article>
			{/each}
		</div>
	</section>

	<section id="recall" class="mt-16 scroll-mt-24">
		<h2 class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
			{content.sections.recall}
		</h2>
		<div class="mt-5 grid gap-4 lg:grid-cols-2">
			{#each content.modules as module, index (index)}
				<div class="study-card p-5">
					<p class="font-mono text-xs uppercase tracking-wider text-accent">{module.kicker}</p>
					<h3 class="mt-2 text-base font-semibold text-ink">{module.title}</h3>
					<div class="mt-4 grid gap-2">
						{#each module.recall as prompt (prompt.q)}
							<details class="study-recall">
								<summary>{prompt.q}</summary>
								<p class="px-3 pb-3 text-sm leading-7 text-muted">{prompt.a}</p>
							</details>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</section>
</StudyPageShell>
