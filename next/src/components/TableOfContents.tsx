'use client';

import { useEffect, useState } from 'react';

import type { Heading } from '@/markdown/pipeline';

/**
 * The heading the reader is in: the last one to enter the top quarter of the
 * screen. Empty before the first heading.
 */
function useActiveHeading(headings: readonly Heading[]): string {
	const [active, setActive] = useState('');

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) setActive(entry.target.id);
				}
			},
			{ rootMargin: '-80px 0px -75% 0px' },
		);
		for (const heading of headings) {
			const element = document.getElementById(heading.id);
			if (element) observer.observe(element);
		}
		return () => observer.disconnect();
	}, [headings]);

	return active;
}

/**
 * The contents of a post. The article renders it twice and CSS shows one:
 * `rail` is the sticky list beside the text on wide screens, `inline` the
 * collapsed block above the text on narrow ones. Links are plain anchors, so the
 * address carries the section and Back returns to where the reader was.
 */
export function TableOfContents({
	headings,
	title,
	variant,
}: {
	headings: readonly Heading[];
	title: string;
	variant: 'rail' | 'inline';
}) {
	const active = useActiveHeading(headings);
	const [open, setOpen] = useState(false);

	const list = (
		<ol>
			{headings.map((heading) => (
				<li key={heading.id} data-depth={heading.depth}>
					<a
						href={`#${heading.id}`}
						aria-current={active === heading.id ? 'location' : undefined}
						onClick={() => setOpen(false)}
					>
						{heading.text}
					</a>
				</li>
			))}
		</ol>
	);

	if (variant === 'inline') {
		return (
			<details
				className="toc toc--inline"
				open={open}
				onToggle={(event) => setOpen(event.currentTarget.open)}
			>
				<summary>
					{title} <span>{headings.length}</span>
				</summary>
				{list}
			</details>
		);
	}

	return (
		<nav className="toc toc--rail" aria-labelledby="toc-title">
			<h2 id="toc-title" className="eyebrow">
				{title}
			</h2>
			{list}
		</nav>
	);
}
