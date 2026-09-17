'use client';

/**
 * SlideVideo — a muted, looping product recording. The React port of
 * `src/lib/components/deck/SlideVideo.svelte`.
 *
 * WHY VIDEO, NOT GIF: a GIF cannot be paused, so it competes with the slide's
 * own step animation and with the speaker. These are the real products, which
 * is worth showing, but only one thing on screen should move at a time. Video
 * also costs a fraction of the bytes — the two source GIFs were 3.5MB together;
 * as MP4 plus WebM they are around 400KB.
 *
 * Pass `paused` while a step animation runs, then release it.
 *
 * WHAT CHANGED: `bind:this` becomes a callback ref (which also sets the
 * `muted` *property* — React renders the attribute for SSR HTML but a
 * longstanding quirk means the property is what the autoplay policy reads),
 * and Svelte's `$effect` becomes a `useEffect` on `[paused]`. `reducedMotion`
 * stays an imperative read per run, exactly as the original: an OS setting
 * change mid-slide does not retrigger anything there either.
 */

import { useEffect, useRef } from 'react';

import { reducedMotion } from '@/deck/gsap';

interface Props {
	/** Basename without extension; `.webm` and `.mp4` are both served. */
	src: string;
	/** Describes the recording for anyone who cannot see it. */
	label: string;
	paused?: boolean;
}

export default function SlideVideo({ src, label, paused = false }: Props) {
	const el = useRef<HTMLVideoElement | null>(null);

	useEffect(() => {
		const video = el.current;
		if (!video) return;

		// Reduced motion holds the first frame rather than hiding the evidence.
		if (paused || reducedMotion()) {
			video.pause();
		} else {
			// A rejected play() is not an error worth surfacing — some browsers
			// refuse autoplay until the page has been interacted with, and the
			// next advance will retry.
			void video.play().catch(() => {});
		}
	}, [paused]);

	return (
		<video
			ref={(node) => {
				el.current = node;
				if (node) node.muted = true;
			}}
			className="slide-video"
			muted
			loop
			playsInline
			autoPlay
			preload="metadata"
			aria-label={label}
		>
			<source src={`${src}.webm`} type="video/webm" />
			<source src={`${src}.mp4`} type="video/mp4" />
		</video>
	);
}
