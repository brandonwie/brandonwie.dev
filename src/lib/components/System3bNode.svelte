<!--
	System3bNode.svelte — custom @xyflow/svelte node for the /system/3b graph.
	Renders a subsystem chip (expandable) or a leaf node, colored by kind.
	Click (expandable only) → data.onExpand(subKey); hover → data.onHover(id).
	Handles are present but visually hidden so edges can attach.
-->
<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { kindStyle } from '$lib/utils/system3b-graph';
	import { m } from '$lib/paraglide/messages';

	let { id, data }: NodeProps = $props();

	const style = $derived(kindStyle(String(data.kind)));
	const expandable = $derived(Boolean(data.expandable));

	function click() {
		if (expandable && typeof data.onExpand === 'function') {
			(data.onExpand as (k: string) => void)(String(data.subKey));
		}
	}
	function hover(v: string | null) {
		if (typeof data.onHover === 'function') (data.onHover as (id: string | null) => void)(v);
	}
</script>

<Handle type="target" position={Position.Top} style="opacity:0;width:6px;height:6px;border:0" />
<button
	type="button"
	class="s3b-node"
	class:expandable
	style:--c={style.color}
	onclick={click}
	onmouseenter={() => hover(id)}
	onmouseleave={() => hover(null)}
	tabindex={expandable ? 0 : -1}
	aria-disabled={!expandable}
	title={expandable ? `${m.system_3b_graph_expand()} ${data.name}` : String(data.name)}
>
	<span class="dot"></span>
	<span class="label">{data.name}</span>
	{#if expandable}<span class="chev" aria-hidden="true">+</span>{/if}
</button>
<Handle type="source" position={Position.Bottom} style="opacity:0;width:6px;height:6px;border:0" />

<style>
	.s3b-node {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 180px;
		height: 56px;
		padding: 0 12px;
		background: var(--panel);
		border: 1px solid var(--line2);
		border-left: 3px solid var(--c);
		border-radius: 8px;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 12px;
		line-height: 1.2;
		text-align: left;
		cursor: default;
		transition:
			background 120ms ease,
			border-color 120ms ease;
	}
	.s3b-node.expandable {
		cursor: pointer;
	}
	.s3b-node.expandable:hover {
		background: var(--overlay);
		border-color: var(--c);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--c);
		flex: 0 0 auto;
	}
	.label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chev {
		color: var(--c);
		font-weight: 700;
		font-size: 14px;
		flex: 0 0 auto;
	}
</style>
