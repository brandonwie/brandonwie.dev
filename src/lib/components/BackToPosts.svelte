<script lang="ts">
	/**
	 * BackToPosts — deterministic, locale-aware "back to the posts list" link.
	 *
	 * Lives in the page body (below the global header), not in the chrome. Uses a
	 * real href, not history.back(), so it works from a cold load, search, RSS, or
	 * an external referral.
	 */
	import { m } from '$lib/paraglide/messages';
	import { postsHref } from '$lib/data/nav';
	import type { Locale } from '$lib/data/nav';

	let { locale = 'en' }: { locale?: Locale } = $props();
</script>

<a
	href={postsHref(locale)}
	class="inline-flex items-center gap-1 text-sm text-muted no-underline transition-colors hover:text-accent"
>
	<span aria-hidden="true">←</span>
	<span>{m.back_to_posts()}</span>
</a>
