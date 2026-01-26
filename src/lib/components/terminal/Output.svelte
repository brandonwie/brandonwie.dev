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
			case 'purple':
				return 'text-terminal-accent-purple';
			default:
				return 'text-terminal-text-primary';
		}
	}

	function getLinkHref(link: string): string {
		if (link.startsWith('http') || link.startsWith('mailto')) {
			return link;
		}
		return link;
	}

	function getLinkTarget(link: string): string | undefined {
		if (link.startsWith('http') || link.startsWith('mailto')) {
			return '_blank';
		}
		return undefined;
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
		{:else if line.link}
			<a
				href={getLinkHref(line.link)}
				target={getLinkTarget(line.link)}
				rel={line.link.startsWith('http') ? 'noopener noreferrer' : undefined}
				class={getLineClass(line.type)}
			>
				<pre class="m-0 whitespace-pre-wrap break-words font-mono">{line.content}</pre>
			</a>
		{:else}
			<div class={getLineClass(line.type)}>
				<pre class="m-0 whitespace-pre-wrap break-words font-mono">{line.content}</pre>
			</div>
		{/if}
	{/each}
</div>
