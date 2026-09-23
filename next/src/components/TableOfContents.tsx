'use client';

import { useEffect, useState } from 'react';

import { useReadingProgress } from './ReadingProgress';

export interface TocHeading {
	text: string;
	depth: number;
	id: string;
}

interface TableOfContentsProps {
	headings: TocHeading[];
	title: string;
	/**
	 * `rail`: the sticky right-hand frame (wide screens), `nav.article-toc`.
	 * `inline`: the collapsible `<details>` frame above the prose (narrow screens).
	 */
	variant: 'rail' | 'inline';
	/** Rail footer labels, from the article copy. */
	backLabel?: string;
	searchLabel?: string;
	readLabel?: string;
}

interface TocRow {
	heading: TocHeading;
	/** `01`.. for top-level rows; empty for nested ones. */
	num: string;
	/** Tree glyph for nested rows: `├` inside a run, `└` on its last row. */
	branch: string | null;
}

function tocRows(headings: TocHeading[]): TocRow[] {
	let n = 0;
	return headings.map((heading, index) => {
		if (heading.depth <= 2) {
			n += 1;
			return { heading, num: String(n).padStart(2, '0'), branch: null };
		}
		const next = headings[index + 1];
		return { heading, num: '', branch: next && next.depth > 2 ? '├' : '└' };
	});
}

/**
 * TableOfContents — article navigation in a terminal frame.
 *
 * Ported from `src/lib/components/TableOfContents.svelte`. The article renders
 * it twice: the rail beside the prose on wide screens and the `<details>` frame
 * above the prose below that; CSS shows one. Both track the active heading with
 * the same IntersectionObserver, and a jump from the collapsible frame closes it.
 */
export function TableOfContents({
	headings,
	title,
	variant,
	backLabel,
	searchLabel,
	readLabel,
}: TableOfContentsProps) {
	const [activeId, setActiveId] =
		typeof useState === 'function' ? useState<string>('') : ['', () => {}];
	const [mobileOpen, setMobileOpen] =
		typeof useState === 'function' ? useState(false) : [false, () => {}];
	const progress = useReadingProgress();

	if (typeof useEffect === 'function') {
		useEffect(() => {
			if (typeof window === 'undefined' || headings.length === 0) return;

			const observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							setActiveId(entry.target.id);
						}
					}
				},
				{ rootMargin: '-80px 0px -75% 0px', threshold: 0 },
			);

			for (const heading of headings) {
				const el = document.getElementById(heading.id);
				if (el) observer.observe(el);
			}

			return () => observer.disconnect();
		}, [headings]);
	}

	function scrollTo(id: string) {
		const el = document.getElementById(id);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth' });
			setActiveId(id);
			setMobileOpen(false);
		}
	}

	if (headings.length === 0) return null;

	const count = (
		<span className="dim" aria-hidden="true">
			{' '}
			· {headings.length}
		</span>
	);

	const list = (
		<ol className="toc-list pg-post__toc-list">
			{tocRows(headings).map(({ heading, num, branch }) => {
				const active = activeId === heading.id;
				return (
					<li key={heading.id} className={`toc-depth-${heading.depth}${active ? ' is-on' : ''}`}>
						<a
							href={`#${heading.id}`}
							aria-current={active ? 'location' : undefined}
							onClick={(e) => {
								e.preventDefault();
								scrollTo(heading.id);
							}}
						>
							<span className="n" aria-hidden="true">
								{active ? '>' : num}
							</span>
							{branch ? (
								<span className="tr" aria-hidden="true">
									{branch}
								</span>
							) : null}
							<span className="t">{heading.text}</span>
						</a>
					</li>
				);
			})}
		</ol>
	);

	if (variant === 'inline') {
		return (
			<details
				className="term-frame pg-post__toc-inline"
				open={mobileOpen}
				onToggle={(e) => setMobileOpen(e.currentTarget.open)}
				data-pagefind-ignore
			>
				<summary className="term-frame__title">
					<span className="pg-post__toc-mark" aria-hidden="true" />
					{title}
					{count}
				</summary>
				{list}
			</details>
		);
	}

	return (
		<nav
			className="term-frame article-toc pg-post__toc"
			aria-labelledby="article-toc-title"
			data-pagefind-ignore
		>
			<h2 id="article-toc-title" className="term-frame__title">
				{title}
				{count}
			</h2>
			{list}
			<div className="pg-post__keys">
				{backLabel ? (
					<div>
						<span>
							<kbd>bksp</kbd> {backLabel}
						</span>
					</div>
				) : null}
				{searchLabel ? (
					<div>
						<span>
							<kbd>⌘K</kbd> {searchLabel}
						</span>
					</div>
				) : null}
				{readLabel ? (
					<div aria-hidden="true">
						<span>{readLabel}</span>
						<span className="text-crt-amber">{Math.round(progress)}%</span>
					</div>
				) : null}
			</div>
		</nav>
	);
}
