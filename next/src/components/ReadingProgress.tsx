'use client';

import { useEffect, useRef } from 'react';

/**
 * A thin bar under the top edge that fills as the reader moves through the
 * post. It measures the `article` element, so comments and the footer do not
 * count. The bar is written to directly on scroll; React does not re-render.
 */
export function ReadingProgress({ label }: { label: string }) {
	const bar = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const article = document.querySelector('article');
		if (!article) return;

		function update() {
			const rect = article!.getBoundingClientRect();
			const distance = rect.height - window.innerHeight;
			const done = distance > 0 ? Math.min(Math.max(-rect.top / distance, 0), 1) : 1;
			if (!bar.current) return;
			bar.current.style.setProperty('--progress', String(done));
			bar.current.setAttribute('aria-valuenow', String(Math.round(done * 100)));
		}

		update();
		window.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', update, { passive: true });
		return () => {
			window.removeEventListener('scroll', update);
			window.removeEventListener('resize', update);
		};
	}, []);

	return (
		<div
			ref={bar}
			className="progress"
			role="progressbar"
			aria-label={label}
			aria-valuenow={0}
			aria-valuemin={0}
			aria-valuemax={100}
		/>
	);
}
