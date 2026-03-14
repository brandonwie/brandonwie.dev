<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	interface Heading {
		text: string;
		depth: number;
		id: string;
	}

	let { headings }: { headings: Heading[] } = $props();

	let activeId = $state<string>('');
	let mobileOpen = $state(false);

	// Track which heading is currently in view via IntersectionObserver
	$effect(() => {
		if (typeof window === 'undefined' || headings.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						activeId = entry.target.id;
					}
				}
			},
			{ rootMargin: '-80px 0px -75% 0px', threshold: 0 },
		);

		// Observe all heading elements matching our IDs
		for (const heading of headings) {
			const el = document.getElementById(heading.id);
			if (el) observer.observe(el);
		}

		return () => observer.disconnect();
	});

	function scrollTo(id: string) {
		const el = document.getElementById(id);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth' });
			activeId = id;
			mobileOpen = false;
		}
	}
</script>

<!-- Desktop ToC (xl+): positioned in right margin of relative parent -->
<nav class="hidden xl:block absolute left-full ml-8 top-0 w-56" aria-label={m.on_this_page()}>
	<div class="sticky top-24">
		<h2 class="text-xs font-semibold uppercase tracking-wider text-terminal-text-dim mb-3">
			{m.on_this_page()}
		</h2>
		<ul class="space-y-1 border-l border-terminal-border">
			{#each headings as heading (heading.id)}
				<li>
					<button
						onclick={() => scrollTo(heading.id)}
						class="block w-full text-left text-sm leading-relaxed transition-colors duration-150
							{heading.depth === 3 ? 'pl-5' : 'pl-3'}
							{activeId === heading.id
							? 'text-terminal-accent-orange border-l-2 border-terminal-accent-orange -ml-px'
							: 'text-terminal-text-dim hover:text-terminal-text-muted'}"
					>
						{heading.text}
					</button>
				</li>
			{/each}
		</ul>
	</div>
</nav>

<!-- Mobile ToC (<xl): collapsible section -->
<details
	class="xl:hidden mb-8 rounded-lg border border-terminal-border bg-terminal-bg-secondary"
	bind:open={mobileOpen}
>
	<summary
		class="cursor-pointer px-4 py-3 text-sm font-semibold text-terminal-text-muted select-none"
	>
		{m.on_this_page()}
	</summary>
	<ul class="px-4 pb-3 space-y-1">
		{#each headings as heading (heading.id)}
			<li>
				<button
					onclick={() => scrollTo(heading.id)}
					class="block w-full text-left text-sm py-0.5 transition-colors
						{heading.depth === 3 ? 'pl-4' : 'pl-0'}
						{activeId === heading.id
						? 'text-terminal-accent-orange'
						: 'text-terminal-text-dim hover:text-terminal-text-muted'}"
				>
					{heading.text}
				</button>
			</li>
		{/each}
	</ul>
</details>
