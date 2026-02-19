<script lang="ts">
	import { viewMode, toggleViewMode } from '$lib/stores/viewMode';
</script>

<button
	onclick={toggleViewMode}
	class="font-mono text-xs px-2 py-1 bg-terminal-bg-primary border border-terminal-border rounded text-terminal-text-muted transition-all duration-200 hover:border-terminal-accent-orange shrink-0"
	aria-label={$viewMode === 'blog' ? 'Switch to terminal view' : 'Switch to blog view'}
>
	<span class={$viewMode === 'blog' ? 'text-terminal-accent-orange font-semibold' : ''}>Blog</span>
	<span class="mx-0.5 opacity-50">/</span>
	<span class={$viewMode === 'terminal' ? 'text-terminal-accent-orange font-semibold' : ''}>CLI</span>
</button>
