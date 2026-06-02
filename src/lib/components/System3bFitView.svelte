<!--
	System3bFitView.svelte — re-fits the viewport whenever `trigger` changes.
	Must render INSIDE <SvelteFlow> so useSvelteFlow() picks up the flow context.
	xyflow's `fitView` prop only fits on initial mount; custom nodes measure
	asynchronously, so we wait for the next frame after the altitude change before
	fitting. Renders nothing.
-->
<script lang="ts">
	import { useSvelteFlow } from '@xyflow/svelte';

	let { trigger }: { trigger: unknown } = $props();
	const { fitView } = useSvelteFlow();

	$effect(() => {
		// read trigger so the effect re-runs on altitude change
		void trigger;
		let raf2 = 0;
		const raf1 = requestAnimationFrame(() => {
			raf2 = requestAnimationFrame(() => {
				fitView({ padding: 0.18, duration: 220 });
			});
		});
		return () => {
			cancelAnimationFrame(raf1);
			cancelAnimationFrame(raf2);
		};
	});
</script>
