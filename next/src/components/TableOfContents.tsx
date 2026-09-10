'use client';

import { useEffect, useState } from 'react';

export interface TocHeading {
	text: string;
	depth: number;
	id: string;
}

interface TableOfContentsProps {
	headings: TocHeading[];
	title: string;
}

/**
 * TableOfContents — responsive article navigation.
 *
 * Ported from `src/lib/components/TableOfContents.svelte`.
 * Desktop: sticky right sidebar (`nav.article-toc`) positioned relative to `.post`.
 * Mobile: collapsible `<details>` section at the top of the article.
 * Tracks current active heading via IntersectionObserver.
 */
export function TableOfContents({ headings, title }: TableOfContentsProps) {
	const [activeId, setActiveId] =
		typeof useState === 'function' ? useState<string>('') : ['', () => {}];
	const [mobileOpen, setMobileOpen] =
		typeof useState === 'function' ? useState(false) : [false, () => {}];

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

	return (
		<>
			{/* Mobile ToC (<xl): collapsible section */}
			<details
				className="xl:hidden mb-8 rounded-lg border border-terminal-border bg-terminal-bg-secondary"
				open={mobileOpen}
				onToggle={(e) => setMobileOpen(e.currentTarget.open)}
				data-pagefind-ignore
			>
				<summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-terminal-text-muted select-none">
					{title}
				</summary>
				<ol className="toc-list px-4 pb-3 space-y-1">
					{headings.map((heading) => (
						<li key={heading.id} className={`toc-depth-${heading.depth}`}>
							<a
								href={`#${heading.id}`}
								onClick={(e) => {
									e.preventDefault();
									scrollTo(heading.id);
								}}
								className={`block w-full text-left text-sm py-0.5 transition-colors ${
									heading.depth === 3 ? 'pl-4' : 'pl-0'
								} ${
									activeId === heading.id
										? 'text-terminal-accent-orange'
										: 'text-terminal-text-dim hover:text-terminal-text-muted'
								}`}
							>
								{heading.text}
							</a>
						</li>
					))}
				</ol>
			</details>

			{/* Desktop ToC (xl+): positioned in right margin of relative parent */}
			<nav className="article-toc" aria-labelledby="article-toc-title" data-pagefind-ignore>
				<div className="sticky top-32">
					<h2
						id="article-toc-title"
						className="text-xs font-semibold uppercase tracking-wider text-terminal-text-dim mb-3"
					>
						{title}
					</h2>
					<ol className="toc-list space-y-1 border-l border-terminal-border">
						{headings.map((heading) => (
							<li key={heading.id} className={`toc-depth-${heading.depth}`}>
								<a
									href={`#${heading.id}`}
									onClick={(e) => {
										e.preventDefault();
										scrollTo(heading.id);
									}}
									className={`block w-full text-left text-sm leading-relaxed transition-colors duration-150 ${
										heading.depth === 3 ? 'pl-5' : 'pl-3'
									} ${
										activeId === heading.id
											? 'text-terminal-accent-orange border-l-2 border-terminal-accent-orange -ml-px'
											: 'text-terminal-text-dim hover:text-terminal-text-muted'
									}`}
								>
									{heading.text}
								</a>
							</li>
						))}
					</ol>
				</div>
			</nav>
		</>
	);
}
