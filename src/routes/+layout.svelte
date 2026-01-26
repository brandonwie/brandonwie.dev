<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Brandon Wie | Software Engineer</title>
	<meta name="description" content="Brandon Wie's personal blog - Software engineering insights, tutorials, and learnings" />
	<meta property="og:title" content="Brandon Wie | Software Engineer" />
	<meta property="og:description" content="Software engineering insights, tutorials, and learnings" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://brandonwie.dev" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Brandon Wie | Software Engineer" />
	<meta name="twitter:description" content="Software engineering insights, tutorials, and learnings" />
</svelte:head>

<div class="min-h-screen bg-terminal-bg-primary text-terminal-text-primary font-mono">
	{@render children()}
</div>
