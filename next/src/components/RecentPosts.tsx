'use client';

import { useState } from 'react';

import { AppLink } from '@/components/AppLink';
import type { PostListing } from '@/components/PostCard';
import { PostPreview } from '@/components/PostPreview';

export interface RecentPostRow extends PostListing {
	href: string;
}

/**
 * RecentPosts — the home page's `ls -lt ~/posts | head -10` frame plus the
 * preview pane (D6).
 *
 * The preview defaults to row 01 and is server-rendered with it, so it shows a
 * real post without JavaScript. After hydration it follows BOTH pointer hover
 * (`onMouseEnter`) and keyboard focus (`onFocus`), and keeps the last one.
 * Every string arrives resolved from the server component, so no message
 * module enters this client bundle.
 */
export function RecentPosts({
	rows,
	heading,
	total,
	seeAllLabel,
	seeAllHref,
	emptyText,
}: {
	rows: RecentPostRow[];
	heading: string;
	total: number;
	seeAllLabel: string;
	seeAllHref: string;
	emptyText: string;
}) {
	const [current, setCurrent] = useState(0);
	const previewed = rows[current] ?? rows[0];
	const rest = total - rows.length;

	return (
		<div className={rows.length > 0 ? 'pg-home__recent' : 'pg-home__recent is-empty'}>
			<div className="term-frame pg-home__list">
				<h2 className="term-frame__title">
					{heading}{' '}
					<span className="dim">
						· {rows.length}/{total}
					</span>
				</h2>
				{rows.length === 0 ? (
					<p className="pg-home__empty">
						<span className="text-crt-amber">ls: ~/posts:</span> {emptyText}
					</p>
				) : (
					<>
						<div className="pg-home__hdr" aria-hidden="true">
							<span>#</span>
							<span>date</span>
							<span>cat</span>
							<span>title / description</span>
						</div>
						{rows.map((row, index) => (
							<AppLink
								key={row.slug}
								className="pg-home__post"
								href={row.href}
								data-row={index + 1}
								onMouseEnter={() => setCurrent(index)}
								onFocus={() => setCurrent(index)}
							>
								<span className="pg-home__ix" aria-hidden="true">
									{String(index + 1).padStart(2, '0')}
								</span>
								<time className="pg-home__dt" dateTime={row.date}>
									{row.dateLabel}
								</time>
								<span className="pg-home__cat">{row.category}</span>
								<h3 className="pg-home__ti">{row.title}</h3>
								{row.description ? <span className="pg-home__ds">{row.description}</span> : null}
							</AppLink>
						))}
						{rest > 0 ? (
							<div className="pg-home__more">
								<span className="text-crt-faint" aria-hidden="true">
									... +{rest}
								</span>
								<AppLink className="term-lnk" href={seeAllHref}>
									{seeAllLabel} →
								</AppLink>
							</div>
						) : null}
					</>
				)}
			</div>
			{previewed ? <PostPreview post={previewed} index={current} /> : null}
		</div>
	);
}
