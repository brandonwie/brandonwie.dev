<script lang="ts">
	/**
	 * PostCard — shared post card with a generated cover image on top.
	 * Used by BlogHome (recent) and PostsListPage (/posts). Cover is the
	 * media-gen 1200x630 image at /og/<slug>.png, with a default fallback.
	 */
	import type { PostMetadata } from '$lib/stores/posts';
	import { coverImage, DEFAULT_COVER } from '$lib/seo';
	import { formatDateShort, effectiveDate } from '$lib/utils/date';

	let {
		post,
		href,
		headingLevel = 'h3',
	}: { post: PostMetadata; href: string; headingLevel?: 'h2' | 'h3' } = $props();

	const date = $derived(effectiveDate(post.date, post.updated));

	function onCoverError(event: Event) {
		const img = event.currentTarget as HTMLImageElement;
		if (img.dataset.fallback) {
			img.onerror = null; // default cover also failed — stop retrying
			return;
		}
		img.dataset.fallback = '1';
		img.src = DEFAULT_COVER;
	}
</script>

<a class="post-card" {href}>
	<div class="post-card__cover">
		<img
			src={coverImage(post.slug)}
			alt=""
			loading="lazy"
			decoding="async"
			width="1200"
			height="630"
			onerror={onCoverError}
		/>
	</div>
	<div class="post-card__body">
		<div class="post-card__meta">
			<span class="post-card__cat">{post.category}</span>
			<time datetime={date}>{formatDateShort(date)}</time>
		</div>
		<svelte:element this={headingLevel} class="post-card__title">{post.title}</svelte:element>
		{#if post.description}
			<p class="post-card__desc">{post.description}</p>
		{/if}
	</div>
</a>

<style>
	.post-card {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--line2);
		border-radius: 12px;
		background: color-mix(in srgb, var(--panel) 45%, transparent);
		text-decoration: none;
		transition:
			transform 0.25s,
			border-color 0.25s;
	}
	.post-card:hover {
		transform: translateY(-4px);
		border-color: var(--foam);
	}
	.post-card__cover {
		aspect-ratio: 1200 / 630;
		overflow: hidden;
		border-bottom: 1px solid var(--line);
		background: color-mix(in srgb, var(--bg2) 60%, transparent);
	}
	.post-card__cover img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.3s ease;
	}
	.post-card:hover .post-card__cover img {
		transform: scale(1.03);
	}
	.post-card__body {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 8px;
		padding: 15px 17px 17px;
	}
	.post-card__meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-family: var(--font-mono);
		font-size: 11px;
	}
	.post-card__cat {
		color: var(--iris);
	}
	.post-card__meta time {
		color: var(--faint);
	}
	.post-card__title {
		font-family: var(--font-sans);
		font-weight: 600;
		font-size: 17px;
		line-height: 1.25;
		color: var(--ink);
	}
	.post-card:hover .post-card__title {
		color: var(--foam);
	}
	.post-card__desc {
		display: -webkit-box;
		overflow: hidden;
		font-family: var(--font-sans);
		font-size: 13px;
		line-height: 1.5;
		color: var(--muted);
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}
</style>
