'use client';

import { useEffect, useState } from 'react';

import type { TocHeading } from './TableOfContents';

/** Block-meter width on wide screens (README: 44 cells) and on phones. */
const WIDE_CELLS = 44;
const NARROW_CELLS = 16;

/** Page scroll as a 0-100 percentage, updated on scroll and resize. */
export function useReadingProgress(): number {
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

	return progress;
}

/**
 * The heading the reader is in: the last one whose top has crossed the upper
 * quarter of the viewport (the band the TOC's IntersectionObserver watches).
 */
function useCurrentSection(headings: TocHeading[]): TocHeading | null {
	const [current, setCurrent] =
		typeof useState === 'function' ? useState<TocHeading | null>(null) : [null, () => {}];

	if (typeof useEffect === 'function') {
		useEffect(() => {
			if (headings.length === 0) return;
			function update() {
				const line = window.innerHeight * 0.25;
				let found: TocHeading | null = null;
				for (const heading of headings) {
					const el = document.getElementById(heading.id);
					if (el && el.getBoundingClientRect().top <= line) found = heading;
				}
				setCurrent(found);
			}
			update();
			window.addEventListener('scroll', update, { passive: true });
			window.addEventListener('resize', update, { passive: true });
			return () => {
				window.removeEventListener('scroll', update);
				window.removeEventListener('resize', update);
			};
		}, [headings]);
	}

	return current;
}

function meter(progress: number, cells: number) {
	const filled = Math.round((progress / 100) * cells);
	return (
		<>
			[{'█'.repeat(filled)}
			<span className="off">{'░'.repeat(cells - filled)}</span>]
		</>
	);
}

/**
 * ReadingProgress — the `less` pager line pinned to the top of the viewport.
 *
 * Ported from `src/lib/components/ReadingProgress.svelte` (a fixed 2px bar);
 * the Phosphor Fade design draws it as a status line instead: file name, the
 * current `§ section`, a block meter and the percentage. The element keeps the
 * `role="progressbar"` contract and its `aria-value*` attributes; the meter
 * glyphs are decorative.
 */
export function ReadingProgress({
	label = 'Reading progress',
	file,
	headings = [],
}: {
	label?: string;
	/** Pager file name, e.g. `<slug>/index.md` (terminal syntax, not copy). */
	file: string;
	headings?: TocHeading[];
}) {
	const progress = useReadingProgress();
	const section = useCurrentSection(headings);
	const pct = Math.round(progress);

	return (
		<div
			className="pg-post__pager"
			role="progressbar"
			aria-label={label}
			aria-valuenow={pct}
			aria-valuemin={0}
			aria-valuemax={100}
			data-pagefind-ignore
		>
			<span className="pg-post__pager-file">{file}</span>
			{section ? <span className="pg-post__pager-sec">§ {section.text}</span> : null}
			<span className="term-meter pg-post__meter pg-post__meter--wide" aria-hidden="true">
				{meter(progress, WIDE_CELLS)}
			</span>
			<span className="term-meter pg-post__meter pg-post__meter--narrow" aria-hidden="true">
				{meter(progress, NARROW_CELLS)}
			</span>
			<span className="pg-post__pager-pct">{pct}%</span>
		</div>
	);
}
