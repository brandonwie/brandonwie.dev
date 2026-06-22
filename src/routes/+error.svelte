<script lang="ts">
	/**
	 * Error Page (+error.svelte) — terminal redesign.
	 *
	 * Handles 404 / 500 / other errors. Renders inside the root layout, so the
	 * SiteHeader + Footer chrome is present. Reuses TerminalHero + TypedText; the
	 * failed path is read client-side (TypedText types on mount). Not localized —
	 * SvelteKit renders one shared error page; suggest links resolve per URL locale.
	 */
	import { page } from '$app/state';
	import TerminalHero from '$lib/components/TerminalHero.svelte';
	import TypedText from '$lib/components/TypedText.svelte';
	import { NAV_ITEMS, hrefFor, localeOf } from '$lib/data/nav';

	const status = $derived(page.status);
	const message = $derived(page.error?.message || 'Unknown error');
	const failedPath = $derived(page.url?.pathname || '/page');
	const locale = $derived(localeOf(page.url?.pathname || '/'));
	const digits = $derived(String(status));

	const title = $derived(
		status === 404 ? 'Page Not Found' : status === 500 ? 'Server Error' : `Error ${status}`,
	);
	const typedLine = $derived(
		status === 404
			? `$ cat ${failedPath} → No such file or directory`
			: status === 500
				? '$ ./server → Segmentation fault (core dumped)'
				: `$ echo $? → ${status}`,
	);
	const hint = $derived(
		status === 404
			? 'The page you are looking for does not exist.'
			: status === 500
				? 'Something went wrong on our end.'
				: message,
	);
</script>

<svelte:head>
	<title>{title} | Brandon Wie</title>
	<meta name="robots" content="noindex,follow" />
</svelte:head>

<main id="main-content" class="err">
	<TerminalHero title="brandon@moba: ~/{status}" prompt="cat {failedPath}">
		<div class="err__typed">
			{#key typedLine}
				<TypedText text={typedLine} speed={30} />
			{/key}
		</div>

		<div class="err__glitch" aria-hidden="true">
			{digits.slice(0, 1)}<span class="err__g">{digits.slice(1, 2)}</span>{digits.slice(2)}
		</div>

		<h1 class="err__title">{title}</h1>
		<p class="err__hint">{hint}</p>

		<div class="err__cta">
			<a class="err__btn err__btn--solid" href="/">cd ~</a>
			<button type="button" class="err__btn" onclick={() => history.back()}>cd -</button>
		</div>

		<nav class="err__suggest" aria-label="Suggested pages">
			{#each NAV_ITEMS as item (item.key)}
				<a href={hrefFor(item, locale)}>~/{item.label(locale)}</a>
			{/each}
		</nav>
	</TerminalHero>
</main>

<style>
	.err {
		max-width: 56rem;
		margin: 0 auto;
		padding: 8vh 1.5rem;
	}
	.err__typed {
		min-height: 22px;
		margin-bottom: 18px;
	}
	.err__glitch {
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: clamp(72px, 16vw, 160px);
		line-height: 1;
		letter-spacing: -0.04em;
		color: var(--ink);
	}
	.err__g {
		background: linear-gradient(90deg, var(--love), var(--iris));
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}
	.err__title {
		margin-top: 12px;
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: clamp(22px, 3vw, 32px);
		color: var(--ink);
	}
	.err__hint {
		max-width: 50ch;
		margin-top: 10px;
		font-family: var(--font-sans);
		color: var(--muted);
	}
	.err__cta {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 26px;
	}
	.err__btn {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		padding: 12px 18px;
		border: 1px solid var(--line2);
		border-radius: 8px;
		background: transparent;
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--ink);
		text-decoration: none;
		cursor: pointer;
		transition:
			color 0.2s,
			border-color 0.2s,
			background-color 0.2s;
	}
	.err__btn:hover {
		border-color: var(--foam);
		color: var(--foam);
	}
	.err__btn--solid {
		border-color: var(--foam);
		background: var(--foam);
		color: var(--bg);
	}
	.err__btn--solid:hover {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--bg);
	}
	.err__suggest {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-top: 30px;
		padding-top: 22px;
		border-top: 1px dashed var(--line2);
	}
	.err__suggest a {
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--muted);
		text-decoration: none;
		transition: color 0.2s;
	}
	.err__suggest a:hover {
		color: var(--foam);
	}
</style>
