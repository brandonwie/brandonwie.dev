<script lang="ts">
	import StudyPageShell from '$lib/components/study/StudyPageShell.svelte';
	import StudySeoHead from '$lib/components/study/StudySeoHead.svelte';
	import { getStudyIndexContent, type StudyLocale } from '$lib/data/study';

	let { locale = 'en' }: { locale?: StudyLocale } = $props();

	const content = $derived(getStudyIndexContent(locale));
	const pageTitle = $derived(`${content.metaTitle} | Brandon Wie`);
</script>

<StudySeoHead {pageTitle} description={content.metaDescription} basePath="/study" {locale} />

<StudyPageShell {locale} nav={content.nav}>
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
		<aside class="study-card p-5">
			<p class="font-mono text-xs uppercase tracking-wider text-faint">
				{content.sections.approach}
			</p>
			<h2 class="mt-3 text-xl font-semibold text-ink">{content.approach.title}</h2>
			<p class="mt-3 text-sm leading-7 text-muted">{content.approach.body}</p>
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
					class="group block study-card p-6 text-ink no-underline transition-colors hover:border-accent"
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
					<p class="mt-5 font-mono text-xs text-faint">{course.meta}</p>
				</a>
			{/each}
		</div>
	</section>

	<section class="mt-16 study-card p-6">
		<ul class="grid gap-3 md:grid-cols-3">
			{#each content.approach.items as item (item)}
				<li class="text-sm leading-7 text-muted">
					<span class="mr-2 font-mono text-accent">/</span>{item}
				</li>
			{/each}
		</ul>
	</section>
</StudyPageShell>
