'use client';

import Link, { type LinkProps } from 'next/link';
import { type AnchorHTMLAttributes, type ReactNode, useState } from 'react';

export type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
	LinkProps & {
		children: ReactNode;
	};

/**
 * AppLink — intra-locale client navigation link with hover-triggered prefetching.
 *
 * Matches SvelteKit's `data-sveltekit-preload-data="hover"` contract:
 * - When unhovered, `prefetch={false}` disables speculative viewport prefetching,
 *   preventing link-flooding on routes with many links (e.g. /tags, /posts).
 * - On `onMouseEnter` or `onFocus`, `prefetch={null}` restores Next.js smart prefetch
 *   for the hovered/focused target ahead of the click.
 */
export function AppLink({
	href,
	children,
	prefetch,
	onMouseEnter,
	onFocus,
	...props
}: AppLinkProps) {
	const [active, setActive] = useState(false);

	return (
		<Link
			href={href}
			prefetch={prefetch ?? (active ? null : false)}
			onMouseEnter={(e) => {
				setActive(true);
				onMouseEnter?.(e);
			}}
			onFocus={(e) => {
				setActive(true);
				onFocus?.(e);
			}}
			{...props}
		>
			{children}
		</Link>
	);
}

export default AppLink;
