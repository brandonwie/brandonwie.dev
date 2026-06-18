<script lang="ts">
	import HeaderControls from '$lib/components/HeaderControls.svelte';
	import type { StudyLocale, StudyNavLabels } from '$lib/data/study';
	import { m } from '$lib/paraglide/messages';

	let {
		locale = 'en',
		nav,
		active = 'study',
	}: {
		locale?: StudyLocale;
		nav: StudyNavLabels;
		active?: 'study' | 'about' | 'posts' | 'system';
	} = $props();

	const basePath = $derived(locale === 'ko' ? '/ko' : '');
	const homeHref = $derived(locale === 'ko' ? '/ko' : '/');

	function navClass(id: typeof active): string {
		return id === active
			? 'text-accent no-underline'
			: 'text-muted no-underline transition-colors hover:text-accent';
	}
</script>

<header class="border-b border-line">
	<div
		class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6"
	>
		<a
			href={homeHref}
			class="shrink-0 font-mono text-sm font-semibold text-ink no-underline sm:text-base"
		>
			brandonwie.dev
		</a>
		<nav
			class="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-2 text-sm sm:gap-x-4"
			aria-label={m.primary_navigation()}
		>
			<a href={`${basePath}/study`} class={navClass('study')}>{nav.study}</a>
			<a href={`${basePath}/posts`} class={navClass('posts')}>{nav.posts}</a>
			<a href={`${basePath}/about`} class={navClass('about')}>{nav.about}</a>
			<a href={`${basePath}/system/3b`} class={navClass('system')}>{nav.system}</a>
			<a
				href={`${basePath}/search`}
				class="text-muted no-underline transition-colors hover:text-accent"
				aria-label={nav.search}
			>
				⌕
			</a>
			<HeaderControls />
		</nav>
	</div>
</header>
