<script lang="ts">
	/**
	 * Footer — the single global site footer (terminal redesign).
	 *
	 * Replaces the minimal inline footer nav that lived in +layout.svelte. Renders
	 * a brand block, link columns, and a copy line. Locale + hrefs come from
	 * `$lib/data/nav` (URL-driven), so EN/KO mirrors resolve automatically. Styles
	 * are component-scoped so the mockup's bare `.foot`/`.ch`/`.copy` selectors
	 * cannot leak.
	 *
	 * Uses + Now remain gated (no source yet) and are intentionally omitted. Tags,
	 * Projects, and Contact ship in the Phase-4 slice and are linked here, kept out
	 * of the lean top nav. Their hrefs are built from the locale base rather than
	 * NAV_ITEMS, which stays scoped to the four header destinations.
	 */
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import { NAV_ITEMS, base, hrefFor, localeOf } from '$lib/data/nav';
	import type { NavKey } from '$lib/data/nav';

	const locale = $derived(localeOf(page.url.pathname));

	function navHref(key: NavKey): string {
		const item = NAV_ITEMS.find((i) => i.key === key)!;
		return hrefFor(item, locale);
	}

	function navLabel(key: NavKey): string {
		const item = NAV_ITEMS.find((i) => i.key === key)!;
		return item.label(locale);
	}
</script>

<footer class="site-footer">
	<div class="site-footer__in">
		<div class="site-footer__grid">
			<div class="site-footer__brand">
				<div class="site-footer__cta">$ connect --brandon</div>
				<p class="site-footer__tagline">{m.footer_tagline({}, { locale })}</p>
			</div>
			<div class="site-footer__cols">
				<div class="site-footer__col">
					<div class="site-footer__ch">{m.footer_col_site({}, { locale })}</div>
					<a href={navHref('about')}>{navLabel('about')}</a>
					<a href={navHref('posts')}>{navLabel('posts')}</a>
					<a href={navHref('study')}>{navLabel('study')}</a>
				</div>
				<div class="site-footer__col">
					<div class="site-footer__ch">{m.footer_col_more({}, { locale })}</div>
					<a href={navHref('system')}>{navLabel('system')}</a>
					<a href="{base(locale)}/projects">{m.nav_projects({}, { locale })}</a>
					<a href="{base(locale)}/tags">{m.nav_tags({}, { locale })}</a>
				</div>
				<div class="site-footer__col">
					<div class="site-footer__ch">{m.footer_col_connect({}, { locale })}</div>
					<a href="{base(locale)}/contact">{m.nav_contact({}, { locale })}</a>
					<a href="https://github.com/brandonwie" target="_blank" rel="noopener noreferrer">
						GitHub ↗
					</a>
					<a href="https://linkedin.com/in/brandonwie" target="_blank" rel="noopener noreferrer">
						LinkedIn ↗
					</a>
				</div>
			</div>
		</div>
		<div class="site-footer__copy">
			<span>© 2026 Brandon Seokhyun Wie · built with the 3B harness</span>
			<span>uptime: ∞ · theme: rosé-pine</span>
		</div>
	</div>
</footer>

<style>
	.site-footer {
		margin-top: 20px;
		padding: 56px 0 44px;
		border-top: 1px solid var(--line);
	}
	.site-footer__in {
		max-width: 72rem;
		margin: 0 auto;
		padding: 0 1.5rem;
	}
	.site-footer__grid {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 30px;
	}
	.site-footer__cta {
		font-family: var(--font-sans);
		font-size: 24px;
		font-weight: 700;
		color: var(--ink);
	}
	.site-footer__tagline {
		max-width: 34ch;
		margin-top: 10px;
		font-family: var(--font-sans);
		color: var(--muted);
		line-height: 1.5;
	}
	.site-footer__cols {
		display: flex;
		flex-wrap: wrap;
		gap: 54px;
	}
	.site-footer__col {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.site-footer__ch {
		margin-bottom: 3px;
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--faint);
	}
	.site-footer__col a {
		font-size: 12px;
		color: var(--muted);
		text-decoration: none;
		transition: color 0.2s;
	}
	.site-footer__col a:hover {
		color: var(--foam);
	}
	.site-footer__copy {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 10px;
		margin-top: 40px;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--faint);
	}
</style>
