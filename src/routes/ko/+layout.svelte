<script lang="ts">
	/**
	 * Korean Layout — wraps all /ko/* routes.
	 *
	 * Locale is resolved purely from the URL via Paraglide's `url` strategy
	 * (see vite.config.ts urlPatterns), so this layout no longer calls
	 * setLocale(). Pinning it here used to persist a `ko` cookie that leaked onto
	 * English routes; with strategy ['url', 'baseLocale'] the URL is the only
	 * source of truth and no cookie can override it.
	 */
	let { children } = $props();
</script>

{@render children()}
