<script lang="ts">
	import AboutPage from '$lib/components/AboutPage.svelte';
	import { getAboutContent } from '$lib/data/about';

	const content = getAboutContent('ko');
</script>

<svelte:head>
	<title>{content.metaTitle} | Brandon Wie</title>
	<meta name="description" content={content.metaDescription} />
	<meta property="og:title" content={`${content.metaTitle} | Brandon Wie`} />
	<meta property="og:description" content={content.metaDescription} />
	<meta property="og:url" content="https://brandonwie.dev/ko/about" />
	<link rel="canonical" href="https://brandonwie.dev/ko/about" />
</svelte:head>

<AboutPage locale="ko" />
