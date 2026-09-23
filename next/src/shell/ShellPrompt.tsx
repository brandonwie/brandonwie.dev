'use client';

import { usePathname } from 'next/navigation';

import { TermPrompt } from './TermPrompt';
import { cwdFor } from './terminal-path';

/**
 * The idle prompt that closes every page, below `~/.plan`: the route's cwd and
 * a block cursor. A client component because a layout is not given the
 * pathname; under `output: 'export'` each route prerenders with its own.
 *
 * `pinnedCwd` is for the error routes, whose prerender sees `/_not-found`
 * while the browser sees the requested URL — pinning keeps both renders equal.
 */
export function ShellPrompt({ pinnedCwd }: { pinnedCwd?: string }) {
	const pathname = usePathname();
	return <TermPrompt className="term-ps1--idle" cwd={pinnedCwd ?? cwdFor(pathname)} cursor />;
}
