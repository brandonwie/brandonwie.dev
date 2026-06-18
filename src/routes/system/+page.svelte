<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { absoluteUrl, DEFAULT_OG_IMAGE, localeCode, SITE_NAME } from '$lib/seo';

	const pageTitle = `${m.system_3b_title()} | Brandon Wie`;
	const pageDescription = m.system_3b_meta_description();
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={absoluteUrl('/system')} />
	<link rel="alternate" hreflang="en" href={absoluteUrl('/system')} />
	<link rel="alternate" hreflang="ko" href={absoluteUrl('/ko/system')} />
	<link rel="alternate" hreflang="x-default" href={absoluteUrl('/system')} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:url" content={absoluteUrl('/system')} />
	<meta property="og:image" content={DEFAULT_OG_IMAGE} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:locale" content={localeCode('en')} />
	<meta property="og:locale:alternate" content={localeCode('ko')} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
	<meta name="twitter:image" content={DEFAULT_OG_IMAGE} />
</svelte:head>

<main id="main-content" class="min-h-screen bg-terminal-bg-primary text-terminal-text-primary">
	<section class="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-16 sm:px-6">
		<p class="mb-3 text-xs uppercase text-terminal-text-dim">{m.system_3b_subtitle()}</p>
		<h1 class="mb-4 text-2xl font-semibold text-terminal-accent-orange">{m.system_3b_title()}</h1>
		<p class="mb-8 max-w-xl text-sm leading-6 text-terminal-text-muted">
			{m.system_3b_index_intro()}
		</p>
		<a
			href="/system/3b"
			class="text-sm font-semibold text-terminal-text-primary no-underline transition-colors hover:text-terminal-accent-orange"
		>
			{m.system_3b_open_hub()} →
		</a>
	</section>
</main>
