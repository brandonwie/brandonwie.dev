<!--
	ContactPage.svelte — link-only contact (URL: /contact, /ko/contact).

	Source-bounded + static (SSG-safe): no form, no backend. Channels reuse the
	already-reviewed bilingual `links[]` from about.ts, filtered to real contact
	destinations (external profiles + mailto) — the internal "system map" link is
	dropped. Email is the site-published brandon@brandonwie.dev (NOT invented).
	/ko/contact is real KO parity (about.ts ships KO labels). Only page chrome
	strings are new Paraglide labels.
-->
<script lang="ts">
	import StudySeoHead from '$lib/components/study/StudySeoHead.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getAboutContent, type AboutLink, type AboutLocale } from '$lib/data/about';

	let { locale = 'en' }: { locale?: AboutLocale } = $props();

	const content = $derived(getAboutContent(locale));
	const basePath = $derived(locale === 'ko' ? '/ko' : '');
	const pageTitle = $derived(`${m.contact_meta_title()} | Brandon Wie`);

	// Real contact channels only: external profiles + mailto (drop internal links).
	const channels = $derived(
		content.links.filter((l: AboutLink) => l.external || l.href.startsWith('mailto:')),
	);

	function isExternal(href: string): boolean {
		return href.startsWith('http');
	}

	// Human-readable destination (email address / bare host+path).
	function channelValue(href: string): string {
		if (href.startsWith('mailto:')) return href.slice('mailto:'.length);
		return href.replace(/^https?:\/\//, '');
	}
</script>

<StudySeoHead {pageTitle} description={m.contact_meta_description()} basePath="/contact" {locale} />

<main id="main-content" class="mx-auto max-w-3xl px-6 py-12 lg:py-16">
	<!-- Header -->
	<section>
		<div
			class="mb-5 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.12em] text-faint"
		>
			<a href={basePath || '/'} class="transition-colors hover:text-foam">~</a>
			<span class="text-line2">/</span>
			<span>contact</span>
		</div>
		<p class="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-foam">
			{m.contact_eyebrow()}
		</p>
		<h1 class="mt-4 font-sans text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
			{m.contact_title()}
		</h1>
		<p class="mt-6 font-sans text-lg leading-8 text-muted">{m.contact_intro()}</p>
	</section>

	<!-- Channels -->
	<section class="mt-12">
		<div class="mb-5 flex items-center gap-3.5">
			<span class="font-mono font-bold text-foam">#</span>
			<h2 class="font-sans text-xl font-semibold tracking-tight text-ink">
				{m.contact_channels_heading()}
			</h2>
			<span class="h-px flex-1 bg-line2"></span>
		</div>
		<ul class="grid gap-3">
			{#each channels as channel (channel.href)}
				<li>
					<a
						href={channel.href}
						target={isExternal(channel.href) ? '_blank' : undefined}
						rel={isExternal(channel.href) ? 'noopener noreferrer' : undefined}
						class="group flex items-center justify-between gap-4 rounded-lg border border-line2 bg-surface px-5 py-4 no-underline transition-colors hover:border-foam"
					>
						<span class="flex min-w-0 flex-col gap-1">
							<span class="font-mono text-xs uppercase tracking-[0.14em] text-faint"
								>{channel.label}</span
							>
							<span class="truncate font-sans text-sm text-ink">{channelValue(channel.href)}</span>
						</span>
						<span
							class="font-mono text-faint transition-colors group-hover:text-foam"
							aria-hidden="true">{isExternal(channel.href) ? '↗' : '✉'}</span
						>
					</a>
				</li>
			{/each}
		</ul>
	</section>
</main>
