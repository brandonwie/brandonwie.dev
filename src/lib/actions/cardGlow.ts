/**
 * use:cardGlow — tracks the cursor's X position over a card and writes it to the
 * `--mx` custom property, driving the radial-glow highlight (see `.card::before`
 * in app.css). Ports the card mouse-glow from the tmp/site mockup's site.js.
 *
 * This only mutates a CSS custom property, so the highlight is a pure compositor
 * paint — no Svelte re-render per mouse move.
 */
export function cardGlow(node: HTMLElement): { destroy: () => void } {
	function handleMove(event: MouseEvent) {
		const rect = node.getBoundingClientRect();
		node.style.setProperty('--mx', `${event.clientX - rect.left}px`);
	}

	node.addEventListener('mousemove', handleMove, { passive: true });

	return {
		destroy() {
			node.removeEventListener('mousemove', handleMove);
		},
	};
}
