<script lang="ts">
	import { onMount } from 'svelte';
	import { fly, scale } from 'svelte/transition';

	let { title = 'Call stack' }: { title?: string } = $props();

	const steps = [
		{ mode: 'descend', frames: ['factorial(4)'], note: 'Call factorial(4); it must wait.' },
		{ mode: 'descend', frames: ['factorial(4)', 'factorial(3)'], note: '4 calls 3.' },
		{
			mode: 'descend',
			frames: ['factorial(4)', 'factorial(3)', 'factorial(2)'],
			note: '3 calls 2.',
		},
		{
			mode: 'descend',
			frames: ['factorial(4)', 'factorial(3)', 'factorial(2)', 'factorial(1)'],
			note: '1 still needs the base case.',
		},
		{
			mode: 'base',
			frames: ['factorial(4)', 'factorial(3)', 'factorial(2)', 'factorial(1)', 'factorial(0) = 1'],
			note: 'Base case returns 1.',
		},
		{
			mode: 'unwind',
			frames: ['factorial(4)', 'factorial(3)', 'factorial(2)', 'factorial(1) = 1'],
			note: 'Unwind: 1 x 1 = 1.',
		},
		{
			mode: 'unwind',
			frames: ['factorial(4)', 'factorial(3)', 'factorial(2) = 2'],
			note: 'Unwind: 2 x 1 = 2.',
		},
		{ mode: 'unwind', frames: ['factorial(4)', 'factorial(3) = 6'], note: 'Unwind: 3 x 2 = 6.' },
		{
			mode: 'done',
			frames: ['factorial(4) = 24'],
			note: 'Return to the original caller: 4 x 6 = 24.',
		},
	];

	let step = $state(0);
	let reduceMotion = $state(false);
	const current = $derived(steps[step]);

	onMount(() => {
		reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	});

	function previous() {
		step = Math.max(0, step - 1);
	}

	function next() {
		step = Math.min(steps.length - 1, step + 1);
	}
</script>

<article class="min-w-0 border border-line bg-surface p-5">
	<div class="flex items-center justify-between gap-4">
		<div>
			<h3 class="text-lg font-semibold text-ink">{title}</h3>
			<p class="mt-2 text-sm leading-6 text-muted">{current.note}</p>
		</div>
		<span class="font-mono text-xs text-faint">{step + 1}/{steps.length}</span>
	</div>

	<div class="mt-4 flex gap-2">
		<button
			class="border border-line bg-bg px-3 py-2 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
			type="button"
			onclick={previous}
			aria-label="Previous recursion step"
		>
			← Prev
		</button>
		<button
			class="border border-line bg-bg px-3 py-2 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
			type="button"
			onclick={next}
			aria-label="Next recursion step"
		>
			Next →
		</button>
	</div>

	<div class="mt-5 grid gap-2">
		{#each current.frames as frame, index (frame)}
			<div
				in:fly={{ y: -10, duration: reduceMotion ? 0 : 180 }}
				out:scale={{ duration: reduceMotion ? 0 : 120 }}
				class={`border px-3 py-2 font-mono text-sm ${
					current.mode === 'unwind' || current.mode === 'done'
						? 'border-gold border-dashed text-gold'
						: current.mode === 'base' && index === current.frames.length - 1
							? 'border-accent bg-highlight-med text-accent'
							: 'border-line text-muted'
				}`}
			>
				<span class="mr-2 text-[10px] uppercase text-faint">
					{current.mode === 'unwind' || current.mode === 'done' ? 'return' : 'call'}
				</span>
				{frame}
			</div>
		{/each}
	</div>
</article>
