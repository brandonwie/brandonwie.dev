<!--
	TagsPage.svelte — topic index (URL: /tags, /ko/tags).

	Fully data-derived from the posts passed by the root +layout load (locale-aware:
	KO posts on /ko/tags). No new data + no editorial copy — tag names are the
	posts' own English technical tags; all UI strings go through Paraglide m.*().
	Renders a count-sized tag cloud that jumps to a per-tag grouped post list.
-->
<script lang="ts">
	import StudySeoHead from '$lib/components/study/StudySeoHead.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getTagsWithCounts, type PostMetadata } from '$lib/stores/posts';
	import { effectiveDate } from '$lib/utils/date';

	let { locale = 'en', posts = [] }: { locale?: 'en' | 'ko'; posts?: PostMetadata[] } = $props();

	const basePath = $derived(locale === 'ko' ? '/ko' : '');
	const pageTitle = $derived(`${m.tags_meta_title()} | Brandon Wie`);

	// Tags sorted by post count (desc); the cloud + grouped list share this order.
	const tagList = $derived(getTagsWithCounts(posts));
	const maxCount = $derived(tagList.length ? tagList[0].count : 1);

	// Posts per tag, newest first.
	const postsByTag = $derived.by(() => {
		const map: Record<string, PostMetadata[]> = {};
		for (const post of posts) {
			for (const tag of post.tags) (map[tag] ??= []).push(post);
		}
		for (const tag of Object.keys(map)) {
			map[tag].sort(
				(a, b) =>
					new Date(effectiveDate(b.date, b.updated)).getTime() -
					new Date(effectiveDate(a.date, a.updated)).getTime(),
			);
		}
		return map;
	});

	// Stable anchor id for a tag (English tech tags → safe ascii slug).
	function tagSlug(tag: string): string {
		return tag
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)/g, '');
	}

	// Cloud font-size scales with frequency (0.8rem → ~1.7rem).
	function cloudSize(count: number): string {
		const ratio = maxCount > 0 ? count / maxCount : 0;
		return `${(0.8 + ratio * 0.9).toFixed(3)}rem`;
	}
</script>

<StudySeoHead {pageTitle} description={m.tags_meta_description()} basePath="/tags" {locale} />

{#snippet secHead(label: string)}
	<div class="mb-5 flex items-center gap-3.5">
		<span class="font-mono font-bold text-foam">#</span>
		<h2 class="font-sans text-xl font-semibold tracking-tight text-ink">{label}</h2>
		<span class="h-px flex-1 bg-line2"></span>
	</div>
{/snippet}

<main id="main-content" class="mx-auto max-w-6xl px-6 py-12 lg:py-16">
	<!-- Header -->
	<section class="max-w-3xl">
		<div
			class="mb-5 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.12em] text-faint"
		>
			<a href={basePath || '/'} class="transition-colors hover:text-foam">~</a>
			<span class="text-line2">/</span>
			<span>tags</span>
		</div>
		<p class="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-foam">
			{m.tags_eyebrow()}
		</p>
		<h1 class="mt-4 font-sans text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
			{m.tags_title()}
		</h1>
		<p class="mt-6 font-sans text-lg leading-8 text-muted">
			{m.tags_intro({ tags: tagList.length, posts: posts.length })}
		</p>
	</section>

	{#if tagList.length === 0}
		<p class="mt-14 font-mono text-sm text-faint">{m.tags_empty()}</p>
	{:else}
		<!-- Cloud -->
		<section class="mt-14">
			{@render secHead(m.tags_cloud_heading())}
			<div class="flex flex-wrap items-baseline gap-x-4 gap-y-3">
				{#each tagList as tag (tag.name)}
					<a
						href="#tag-{tagSlug(tag.name)}"
						class="font-mono leading-none text-muted transition-colors hover:text-foam"
						style={`font-size: ${cloudSize(tag.count)}`}
					>
						{tag.name}<span class="ml-1 align-super text-[0.6em] text-faint">{tag.count}</span>
					</a>
				{/each}
			</div>
		</section>

		<!-- Grouped list -->
		<section class="mt-16">
			{@render secHead(m.tags_all_heading())}
			<div class="grid gap-4">
				{#each tagList as tag (tag.name)}
					<article
						id="tag-{tagSlug(tag.name)}"
						class="scroll-mt-24 rounded-lg border border-line2 bg-surface p-5"
					>
						<div class="mb-3 flex items-baseline justify-between gap-3 border-b border-line pb-3">
							<h3 class="font-mono text-sm text-foam">#{tag.name}</h3>
							<span class="font-mono text-xs text-faint">{m.tags_count({ count: tag.count })}</span>
						</div>
						<ul class="grid gap-1.5">
							{#each postsByTag[tag.name] ?? [] as post (post.slug)}
								<li>
									<a
										href="{basePath}/posts/{post.slug}"
										class="font-sans text-sm leading-7 text-muted no-underline transition-colors hover:text-foam"
									>
										{post.title}
									</a>
								</li>
							{/each}
						</ul>
					</article>
				{/each}
			</div>
		</section>
	{/if}
</main>
