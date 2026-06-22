<!--
	System3bBandNode.svelte — non-interactive layer lane behind the chips.
	Spans the full graph width; carries the layer name top-left. zIndex -1 so it
	sits behind subsystem chips and pans/zooms with the graph (true swimlane).
-->
<script lang="ts">
	import type { NodeProps } from '@xyflow/svelte';
	let { data }: NodeProps = $props();
</script>

<!-- NOTE: Svelte interpolates {…} inside quoted style: directive values, so
     style:width="{Number(data.width)}px" is valid + render-verified — NOT literal CSS. -->
<div class="s3b-band" style:width="{Number(data.width)}px" style:height="{Number(data.height)}px">
	<span class="lane-label">{data.name}</span>
</div>

<style>
	.s3b-band {
		border: 1px dashed var(--line2);
		border-radius: 10px;
		background: color-mix(in srgb, var(--panel) 30%, transparent);
		pointer-events: none;
	}
	.lane-label {
		position: absolute;
		top: 6px;
		left: 10px;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--faint);
		white-space: nowrap;
	}
</style>
