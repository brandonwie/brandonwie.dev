'use client';

/**
 * Spike host for the command palette. Scaffolding: Slice 4 deletes it along
 * with the route.
 *
 * WHY A CLIENT WRAPPER AT ALL. `PaletteHost` takes a `navigate` function, and
 * a Server Component cannot pass a function across the boundary. The router is
 * also a hook, so the injection has to happen inside client code. Same shape
 * as `StudySpike`, arrived at from the opposite direction: there the copy
 * already held functions, here the functions have to be created on this side
 * of the line.
 *
 * The nav items point at real site routes, most of which are not ported yet.
 * Following one on this spike route reaches a 404, and that is the honest
 * outcome — faking a router would prove the palette navigates somewhere that
 * does not exist.
 */

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import PaletteHost from '@/components/palette/PaletteHost';
import type { PaletteLocale, PalettePost } from '@/palette/items';

interface Props {
	posts: PalettePost[];
	pathname: string;
	locale: PaletteLocale;
}

export default function PaletteSpike({ posts, pathname, locale }: Props) {
	const router = useRouter();
	const navigate = useCallback((href: string) => router.push(href), [router]);

	return <PaletteHost posts={posts} pathname={pathname} locale={locale} navigate={navigate} />;
}
