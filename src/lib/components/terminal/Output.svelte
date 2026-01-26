<script lang="ts">
	import type { OutputLine } from '$lib/stores/terminal';

	interface Props {
		lines: OutputLine[];
	}

	let { lines }: Props = $props();

	function getLineClass(type: OutputLine['type']): string {
		switch (type) {
			case 'error':
				return 'text-terminal-accent-red';
			case 'success':
				return 'text-terminal-accent-green';
			case 'directory':
				return 'text-terminal-accent-yellow';
			case 'file':
				return 'text-terminal-accent-green';
			case 'link':
				return 'text-terminal-accent-cyan hover:underline cursor-pointer';
			default:
				return 'text-terminal-text-primary';
		}
	}

	function handleClick(line: OutputLine) {
		if (line.link) {
			if (line.link.startsWith('http') || line.link.startsWith('mailto')) {
				window.open(line.link, '_blank', 'noopener,noreferrer');
			} else {
				// Internal link - navigate
				window.location.href = line.link;
			}
		}
	}
</script>

<div class="space-y-0.5">
	{#each lines as line, i (i)}
		{#if line.type === 'html'}
			<div class="prose-terminal prose max-w-none">
				{@html line.content}
			</div>
		{:else if line.type === 'markdown'}
			<div class="prose-terminal prose max-w-none">
				{line.content}
			</div>
		{:else}
			<div
				class={getLineClass(line.type)}
				class:cursor-pointer={!!line.link}
				onclick={() => handleClick(line)}
				onkeydown={(e) => e.key === 'Enter' && handleClick(line)}
				role={line.link ? 'link' : undefined}
				tabindex={line.link ? 0 : undefined}
			>
				<pre class="m-0 whitespace-pre-wrap break-words font-mono">{line.content}</pre>
			</div>
		{/if}
	{/each}
</div>
