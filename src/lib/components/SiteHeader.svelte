<script lang="ts">
	/**
	 * SiteHeader — the single global header for every route.
	 *
	 * Rendered once in the root layout, so the chrome is identical on every page.
	 * Locale, active section, and hrefs all come from `$lib/data/nav` driven by
	 * `$page.url.pathname` — there is no per-page header anymore.
	 *
	 * `sticky` is opt-in: the markup never changes, only the position classes, so
	 * a sticky header can be turned on later without another refactor.
	 */
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import HeaderControls from '$lib/components/HeaderControls.svelte';
	import { NAV_ITEMS, activeKey, hrefFor, homeHref, localeOf, searchHref } from '$lib/data/nav';
	import type { NavKey } from '$lib/data/nav';

	let { sticky = false }: { sticky?: boolean } = $props();

	const locale = $derived(localeOf(page.url.pathname));
	const active = $derived(activeKey(page.url.pathname));

	const headerClass = $derived(
		sticky
			? 'sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur'
			: 'border-b border-line bg-bg',
	);

	function navClass(key: NavKey): string {
		return key === active
			? 'text-accent no-underline'
			: 'text-muted no-underline transition-colors hover:text-accent';
	}
</script>

<header class={headerClass}>
	<div
		class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6"
	>
		<a
			href={homeHref(locale)}
			class="shrink-0 font-mono text-sm font-semibold text-ink no-underline sm:text-base"
		>
			brandonwie.dev
		</a>
		<nav
			class="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-2 text-sm sm:gap-x-4"
			aria-label={m.primary_navigation()}
		>
			{#each NAV_ITEMS as item (item.key)}
				<a href={hrefFor(item, locale)} class={navClass(item.key)}>{item.label()}</a>
			{/each}
			<a
				href={searchHref(locale)}
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
