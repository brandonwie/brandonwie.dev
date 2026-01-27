<script lang="ts">
	/**
	 * Korean Home Page (/ko)
	 *
	 * Same as English home but with Korean locale active.
	 * Terminal component will display Korean translations.
	 */
	import { goto } from '$app/navigation';
	import Terminal from '$lib/components/terminal/Terminal.svelte';
	import { posts } from '$lib/stores/posts';
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	onMount(async () => {
		// Sample posts - only include posts that actually exist
		// TODO: In production, load from +page.ts for proper SSR
		const samplePosts = [
			{
				slug: 'redis-caching-patterns',
				title: 'Redis Caching Patterns for APIs',
				description: 'Effective caching strategies for backend APIs using Redis',
				date: '2026-01-15',
				tags: ['redis', 'caching', 'backend'],
				category: 'backend'
			}
		];

		posts.set(samplePosts);
	});

	function handleNavigateToPost(slug: string) {
		goto(`/ko/posts/${slug}`);
	}
</script>

<svelte:head>
	<title>{m.site_title()}</title>
</svelte:head>

<Terminal onNavigateToPost={handleNavigateToPost} />
