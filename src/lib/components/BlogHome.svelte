<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import LanguageToggle from '$lib/components/LanguageToggle.svelte';
	import ViewToggle from '$lib/components/ViewToggle.svelte';
	import type { PostMetadata } from '$lib/stores/posts';

	let { posts, basePath = '/' }: { posts: PostMetadata[]; basePath?: string } = $props();

	const recentPosts = $derived(posts.slice(0, 10));

	function formatDate(dateStr: string): string {
		const locale = getLocale();
		return new Date(dateStr).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function postHref(slug: string): string {
		const base = basePath === '/' ? '' : basePath;
		return `${base}/posts/${slug}`;
	}

	function allPostsHref(): string {
		const base = basePath === '/' ? '' : basePath;
		return `${base}/posts`;
	}
</script>

<div class="min-h-screen bg-terminal-bg-primary">
	<!-- Header -->
	<header class="border-b border-terminal-border bg-terminal-bg-secondary">
		<div class="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 sm:px-6">
			<a
				href={basePath}
				class="text-terminal-accent-orange font-semibold text-sm sm:text-base no-underline"
			>
				Brandon Wie
			</a>
			<div class="flex items-center gap-2">
				<a
					href={allPostsHref()}
					class="font-mono text-xs px-2 py-1 text-terminal-text-muted no-underline transition-colors hover:text-terminal-accent-orange"
				>
					{m.posts_title()}
				</a>
				<ViewToggle />
				<LanguageToggle />
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="mx-auto max-w-2xl px-4 py-10 sm:px-6">
		<!-- Tagline -->
		<p class="text-terminal-text-muted text-sm mb-10">
			{m.blog_tagline()}
		</p>

		<!-- Recent Posts -->
		<section>
			<h2 class="text-xs font-semibold uppercase tracking-wider text-terminal-text-dim mb-6">
				{m.recent_posts()}
			</h2>

			{#if recentPosts.length === 0}
				<p class="text-terminal-text-muted">{m.no_posts()}</p>
			{:else}
				<div class="space-y-1">
					{#each recentPosts as post (post.slug)}
						<a
							href={postHref(post.slug)}
							class="group flex items-baseline gap-4 py-2.5 px-2 -mx-2 rounded no-underline transition-colors hover:bg-terminal-bg-hover"
						>
							<time
								datetime={post.date}
								class="text-xs text-terminal-text-dim shrink-0 w-[5.5rem] tabular-nums"
							>
								{formatDate(post.date)}
							</time>
							<div class="min-w-0">
								<span class="text-sm text-terminal-text-primary group-hover:text-terminal-accent-orange transition-colors">
									{post.title}
								</span>
								{#if post.description}
									<span class="text-xs text-terminal-text-dim ml-2 hidden sm:inline">
										— {post.description}
									</span>
								{/if}
							</div>
						</a>
					{/each}
				</div>
			{/if}

			<!-- See all posts link -->
			{#if posts.length > 10}
				<div class="mt-8">
					<a
						href={allPostsHref()}
						class="text-sm text-terminal-accent-orange no-underline hover:underline"
					>
						→ {m.see_all_posts({ count: posts.length })}
					</a>
				</div>
			{/if}
		</section>
	</main>

	<!-- Footer -->
	<footer class="border-t border-terminal-border mt-auto">
		<div class="mx-auto max-w-2xl px-4 py-6 sm:px-6 flex items-center justify-between text-xs text-terminal-text-dim">
			<span>&copy; Brandon Wie</span>
			<div class="flex items-center gap-4">
				<a
					href="https://github.com/brandonwie"
					class="no-underline text-terminal-text-dim hover:text-terminal-text-muted transition-colors"
					target="_blank"
					rel="noopener noreferrer"
				>
					GitHub
				</a>
				<a
					href="https://linkedin.com/in/brandonwie"
					class="no-underline text-terminal-text-dim hover:text-terminal-text-muted transition-colors"
					target="_blank"
					rel="noopener noreferrer"
				>
					LinkedIn
				</a>
			</div>
		</div>
	</footer>
</div>
