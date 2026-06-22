<!--
	ProjectsPage.svelte — personal systems index (URL: /projects, /ko/projects).

	Source-bounded: reuses the already-reviewed bilingual `systems[]` from
	about.ts (3B, Crucio, brandonwie.dev) — same copy + links the About page
	ships, so /ko/projects is real KO parity with no new/unreviewed translation.
	Only the page chrome strings (title/eyebrow/intro) are new Paraglide labels.
-->
<script lang="ts">
	import StudySeoHead from '$lib/components/study/StudySeoHead.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getAboutContent, type AboutLocale } from '$lib/data/about';

	let { locale = 'en' }: { locale?: AboutLocale } = $props();

	const content = $derived(getAboutContent(locale));
	const basePath = $derived(locale === 'ko' ? '/ko' : '');
	const pageTitle = $derived(`${m.projects_meta_title()} | Brandon Wie`);

	function isExternal(href: string): boolean {
		return href.startsWith('http');
	}
</script>

<StudySeoHead
	{pageTitle}
	description={m.projects_meta_description()}
	basePath="/projects"
	{locale}
/>

<main id="main-content" class="mx-auto max-w-6xl px-6 py-12 lg:py-16">
	<!-- Header -->
	<section class="max-w-3xl">
		<div
			class="mb-5 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.12em] text-faint"
		>
			<a href={basePath || '/'} class="transition-colors hover:text-foam">~</a>
			<span class="text-line2">/</span>
			<span>projects</span>
		</div>
		<p class="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-foam">
			{m.projects_eyebrow()}
		</p>
		<h1 class="mt-4 font-sans text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
			{m.projects_title()}
		</h1>
		<p class="mt-6 font-sans text-lg leading-8 text-muted">{m.projects_intro()}</p>
	</section>

	<!-- System cards (reused from about.ts systems[]) -->
	<section class="mt-12 grid gap-5 lg:grid-cols-3">
		{#each content.systems as system (system.title)}
			<a
				href={system.href}
				target={isExternal(system.href) ? '_blank' : undefined}
				rel={isExternal(system.href) ? 'noopener noreferrer' : undefined}
				class="group block overflow-hidden rounded-lg border border-line2 bg-surface text-ink no-underline transition-colors hover:border-foam"
			>
				<img src={system.image} alt={system.alt} class="aspect-[16/9] w-full object-cover" />
				<div class="p-5">
					<p class="font-mono text-xs uppercase tracking-[0.14em] text-faint">{system.kicker}</p>
					<h2 class="mt-2 font-sans text-lg font-semibold transition-colors group-hover:text-foam">
						{system.title}
					</h2>
					<p class="mt-3 font-sans text-sm leading-7 text-muted">{system.body}</p>
				</div>
			</a>
		{/each}
	</section>
</main>
