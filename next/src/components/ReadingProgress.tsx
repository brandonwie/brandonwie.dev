'use client';

import { useEffect, useState } from 'react';

/**
 * ReadingProgress — scroll-tracking top progress bar.
 *
 * Ported from `src/lib/components/ReadingProgress.svelte`.
 * Fixed at the top edge of the viewport (z-index 50) with role="progressbar".
 */
export function ReadingProgress({ label = 'Reading progress' }: { label?: string }) {
	const [progress, setProgress] = typeof useState === 'function' ? useState(0) : [0, () => {}];

	if (typeof useEffect === 'function') {
		useEffect(() => {
			function updateProgress() {
				const doc = document.documentElement;
				const docHeight = doc.scrollHeight - doc.clientHeight;
				const current = docHeight > 0 ? Math.min((window.scrollY / docHeight) * 100, 100) : 0;
				setProgress(current);
			}

			updateProgress();
			window.addEventListener('scroll', updateProgress, { passive: true });
			window.addEventListener('resize', updateProgress, { passive: true });

			return () => {
				window.removeEventListener('scroll', updateProgress);
				window.removeEventListener('resize', updateProgress);
			};
		}, []);
	}

	return (
		<div
			className="fixed top-0 left-0 z-50 h-0.5 bg-terminal-accent-orange transition-[width] duration-100 ease-out"
			style={{ width: `${progress}%` }}
			role="progressbar"
			aria-label={label}
			aria-valuenow={Math.round(progress)}
			aria-valuemin={0}
			aria-valuemax={100}
		/>
	);
}
