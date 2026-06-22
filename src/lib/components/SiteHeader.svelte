<script lang="ts">
	/**
	 * SiteHeader — the single global header for every route.
	 *
	 * Terminal redesign: a sticky bar with a pulse-dot brand, `~/path` nav links,
	 * a Cmd/Ctrl+K command-palette button, and the language control. Locale, active
	 * section, and hrefs all come from `$lib/data/nav` driven by `$page.url.pathname`
	 * — there is no per-page header.
	 *
	 * Styles are component-scoped (not global app.css) so the mockup's bare
	 * `nav`/`.dot`/`.cmd` selectors can't leak onto the footer, palette, or page navs.
	 *
	 * `sticky` defaults on (matches the design); the markup never changes, only the
	 * position, so it stays a single prop flip.
	 */
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import HeaderControls from '$lib/components/HeaderControls.svelte';
	import { paletteOpen } from '$lib/stores/palette';
	import { NAV_ITEMS, activeKey, hrefFor, homeHref, localeOf } from '$lib/data/nav';
	import type { NavKey } from '$lib/data/nav';

	let { sticky = true }: { sticky?: boolean } = $props();

	const locale = $derived(localeOf(page.url.pathname));
	const active = $derived(activeKey(page.url.pathname));

	function openPalette() {
		paletteOpen.set(true);
	}

	function isActive(key: NavKey): boolean {
		return key === active;
	}
</script>

<header class="site-nav" class:site-nav--sticky={sticky}>
	<div class="site-nav__in">
		<a class="site-brand" href={homeHref(locale)}>
			<span class="site-brand__dot" aria-hidden="true"></span>brandonwie.dev
		</a>
		<nav class="site-nav__links" aria-label={m.primary_navigation({}, { locale })}>
			{#each NAV_ITEMS as item (item.key)}
				<a
					href={hrefFor(item, locale)}
					class="site-nav__link"
					class:is-active={isActive(item.key)}
					aria-current={isActive(item.key) ? 'page' : undefined}
				>
					~/{item.label(locale)}
				</a>
			{/each}
			<button type="button" class="site-nav__cmd" onclick={openPalette}>
				<span>{m.search_title({}, { locale })}</span>
				<kbd aria-hidden="true">⌘K</kbd>
			</button>
			<HeaderControls />
		</nav>
	</div>
</header>

<style>
	.site-nav {
		z-index: 60;
		border-bottom: 1px solid var(--line);
		background: var(--bg);
	}
	.site-nav--sticky {
		position: sticky;
		top: 0;
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		backdrop-filter: blur(10px);
	}
	.site-nav__in {
		max-width: 72rem;
		margin: 0 auto;
		padding: 0 1.5rem;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-height: 60px;
	}
	.site-brand {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		gap: 9px;
		font-family: var(--font-mono);
		font-size: 14px;
		font-weight: 700;
		color: var(--ink);
		text-decoration: none;
	}
	.site-brand__dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--foam);
		box-shadow: 0 0 10px var(--foam);
		animation: brand-pulse 2.4s infinite;
	}
	@keyframes brand-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.35;
		}
	}
	.site-nav__links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
	}
	.site-nav__link {
		padding: 7px 11px;
		border-radius: 6px;
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--muted);
		text-decoration: none;
		transition:
			color 0.2s,
			background-color 0.2s;
	}
	.site-nav__link:hover {
		color: var(--ink);
		background: var(--surface-2);
	}
	.site-nav__link.is-active {
		color: var(--foam);
	}
	.site-nav__cmd {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 7px 11px;
		border: 1px solid var(--line2);
		border-radius: 6px;
		background: transparent;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--faint);
		cursor: pointer;
		transition:
			color 0.2s,
			border-color 0.2s;
	}
	.site-nav__cmd:hover {
		border-color: var(--foam);
		color: var(--foam);
	}
	.site-nav__cmd kbd {
		padding: 1px 5px;
		border: 1px solid var(--line2);
		border-radius: 4px;
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--muted);
	}
	/* Mockup parity: collapse text nav on small screens; brand + palette + lang
	   remain, and the command palette is the mobile navigation surface. */
	@media (max-width: 820px) {
		.site-nav__link {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.site-brand__dot {
			animation: none;
		}
	}
</style>
