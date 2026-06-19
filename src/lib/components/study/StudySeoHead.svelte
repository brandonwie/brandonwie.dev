<script lang="ts">
	import type { StudyLocale } from '$lib/data/study';
	import { absoluteUrl, DEFAULT_OG_IMAGE, localeCode, SITE_NAME } from '$lib/seo';

	let {
		pageTitle,
		description,
		basePath,
		locale = 'en',
	}: {
		pageTitle: string;
		description: string;
		/** English (default-locale) path, e.g. `/study/dsa-i`. Korean URL is derived as `/ko{basePath}`. */
		basePath: string;
		locale?: StudyLocale;
	} = $props();

	const enUrl = $derived(absoluteUrl(basePath));
	const koUrl = $derived(absoluteUrl(`/ko${basePath}`));
	const canonicalHref = $derived(locale === 'ko' ? koUrl : enUrl);
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonicalHref} />
	<meta property="og:image" content={DEFAULT_OG_IMAGE} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:locale" content={localeCode(locale)} />
	<meta property="og:locale:alternate" content={localeCode(locale === 'ko' ? 'en' : 'ko')} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={DEFAULT_OG_IMAGE} />
	<link rel="canonical" href={canonicalHref} />
	<link rel="alternate" hreflang="en" href={enUrl} />
	<link rel="alternate" hreflang="ko" href={koUrl} />
	<link rel="alternate" hreflang="x-default" href={enUrl} />
</svelte:head>
