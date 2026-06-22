/**
 * use:reveal — adds the `in` class when the element first scrolls into view, so
 * CSS can run a one-shot entrance transition (see `.reveal` / `.reveal.in` in
 * app.css). Ports the IntersectionObserver reveal from the tmp/site mockup's
 * site.js.
 *
 * Accessibility + resilience: when there is no IntersectionObserver (SSR, old
 * browsers) or the user prefers reduced motion, the element is revealed
 * immediately and no observer is attached — content is never left hidden.
 */
export function reveal(node: HTMLElement): { destroy?: () => void } {
	if (typeof IntersectionObserver === 'undefined') {
		node.classList.add('in');
		return {};
	}

	const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
	if (prefersReducedMotion) {
		node.classList.add('in');
		return {};
	}

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					node.classList.add('in');
					observer.unobserve(node);
				}
			}
		},
		{ threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
	);
	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		},
	};
}
