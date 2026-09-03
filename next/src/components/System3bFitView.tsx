'use client';

import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';

/**
 * Re-fits the viewport whenever `trigger` changes. Renders nothing.
 *
 * Must render INSIDE <ReactFlow> so useReactFlow() picks up the flow store.
 * xyflow's `fitView` prop only fits on initial mount, and custom nodes measure
 * asynchronously, so this waits for the second frame after an altitude change
 * before fitting.
 *
 * Ported from System3bFitView.svelte, where the same job needed a component
 * because useSvelteFlow() had to run inside the flow context. In React the
 * component still exists for the same reason — a hook needs a component to live
 * in — but it is now the whole file: no markup, one effect.
 */
export default function System3bFitView({ trigger }: { trigger: unknown }) {
	const { fitView } = useReactFlow();

	useEffect(() => {
		let raf2 = 0;
		const raf1 = requestAnimationFrame(() => {
			raf2 = requestAnimationFrame(() => {
				void fitView({ padding: 0.18, duration: 220 });
			});
		});
		return () => {
			cancelAnimationFrame(raf1);
			cancelAnimationFrame(raf2);
		};
		// `trigger` is read only to re-run the fit on altitude change.
	}, [trigger, fitView]);

	return null;
}
