<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import LanguageToggle from '$lib/components/LanguageToggle.svelte';
	import ViewToggle from '$lib/components/ViewToggle.svelte';
	import type { PostMetadata } from '$lib/stores/posts';
	import { formatDateShort, effectiveDate } from '$lib/utils/date';

	let { posts, basePath = '/' }: { posts: PostMetadata[]; basePath?: string } = $props();

	const recentPosts = $derived(posts.slice(0, 10));
	const rssHref = $derived(basePath === '/' ? '/rss.xml' : `${basePath}/rss.xml`);

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
				Brandon (Seokhyun) Wie
			</a>
			<div class="flex items-center gap-2">
				<a
					href={allPostsHref()}
					class="font-mono text-xs px-2 py-1 text-terminal-text-muted no-underline transition-colors hover:text-terminal-accent-orange"
				>
					{m.posts_title()}
				</a>
				<a
					href="{basePath === '/' ? '' : basePath}/search"
					class="text-terminal-text-muted no-underline transition-colors hover:text-terminal-accent-orange"
					aria-label={m.search_title()}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="11" cy="11" r="8" />
						<path d="m21 21-4.3-4.3" />
					</svg>
				</a>
				<a
					href="{basePath === '/' ? '' : basePath}/stats"
					class="text-terminal-text-muted no-underline transition-colors hover:text-terminal-accent-orange"
					aria-label={m.stats_title()}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="18" y1="20" x2="18" y2="10" />
						<line x1="12" y1="20" x2="12" y2="4" />
						<line x1="6" y1="20" x2="6" y2="14" />
					</svg>
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

		<!-- Work Section -->
		<section class="mb-10">
			<h2 class="text-xs font-semibold uppercase tracking-wider text-terminal-text-dim mb-4">
				{m.work_section()}
			</h2>

			<!-- Arch Calendar -->
			<a
				href="https://www.archcalendar.com"
				target="_blank"
				rel="noopener noreferrer"
				class="group block py-3 px-2 -mx-2 rounded-sm no-underline transition-colors hover:bg-terminal-bg-hover"
			>
				<span
					class="text-sm font-semibold text-terminal-text-primary group-hover:text-terminal-accent-orange transition-colors"
				>
					Arch Calendar
				</span>
				<span class="text-xs text-terminal-text-dim ml-2">— {m.archcalendar_subtitle()}</span>
				<span class="text-xs text-terminal-text-dim ml-1 opacity-60">· {m.archcalendar_role()}</span
				>
				<p class="text-xs text-terminal-text-dim mt-1 mb-0">
					{m.archcalendar_description()}
				</p>
			</a>

			<!-- Crucio -->
			<div
				class="group block py-3 px-2 -mx-2 rounded-sm no-underline transition-colors hover:bg-terminal-bg-hover"
			>
				<a
					href="https://crucio.brandonwie.dev"
					target="_blank"
					rel="noopener noreferrer"
					class="text-sm font-semibold text-terminal-text-primary group-hover:text-terminal-accent-orange transition-colors no-underline"
				>
					Project Crucio
				</a>
				<span class="text-xs text-terminal-text-dim ml-2">— {m.portfolio_subtitle()}</span>
				<span class="text-xs text-terminal-text-dim ml-1 opacity-60">· {m.crucio_role()}</span>
				<p class="text-xs text-terminal-text-dim mt-1 mb-0">
					{m.portfolio_description()}
				</p>
			</div>
		</section>

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
							class="group flex items-baseline gap-4 py-2.5 px-2 -mx-2 rounded-sm no-underline transition-colors hover:bg-terminal-bg-hover"
						>
							<time
								datetime={effectiveDate(post.date, post.updated)}
								class="text-xs text-terminal-text-dim shrink-0 w-22 tabular-nums"
							>
								{formatDateShort(effectiveDate(post.date, post.updated))}
							</time>
							{#if post.updated && post.updated !== post.date}
								<span
									class="text-terminal-accent-green text-xs shrink-0"
									title="{m.updated()} {formatDateShort(post.updated)}">↻</span
								>
							{/if}
							<div class="min-w-0">
								<span
									class="text-sm text-terminal-text-primary group-hover:text-terminal-accent-orange transition-colors"
								>
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
		<div
			class="mx-auto max-w-2xl px-4 py-6 sm:px-6 flex items-center justify-between text-xs text-terminal-text-dim"
		>
			<span>&copy; Brandon (Seokhyun) Wie</span>
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
				<a
					href="https://www.archcalendar.com"
					class="no-underline text-terminal-text-dim hover:text-terminal-text-muted transition-colors"
					target="_blank"
					rel="noopener noreferrer"
				>
					Arch Calendar
				</a>
				<a
					href="https://crucio.brandonwie.dev"
					class="no-underline text-terminal-text-dim hover:text-terminal-text-muted transition-colors"
					target="_blank"
					rel="noopener noreferrer"
				>
					Crucio
				</a>
				<a
					href={rssHref}
					class="no-underline text-terminal-text-dim hover:text-terminal-text-muted transition-colors flex items-center gap-1"
					target="_blank"
					rel="noopener noreferrer"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle
							cx="5"
							cy="19"
							r="1"
						/></svg
					>
					RSS
				</a>
			</div>
		</div>
	</footer>
</div>
