'use client';

import { useEffect, useState } from 'react';

export interface TypedTextProps {
	text: string;
	speed?: number;
}

/**
 * TypedText — types a string character-by-character with a blinking cursor.
 *
 * Ports the mockup's hero typing effect from `src/lib/components/TypedText.svelte`.
 * Runs client-side only (useEffect); SSR renders an empty span, so the page is
 * never blank of meaning that matters for SEO (the text is decorative flavor).
 * Honors prefers-reduced-motion by showing the full string immediately with no animation.
 */
export function TypedText({ text, speed = 45 }: TypedTextProps) {
	const [shown, setShown] = useState('');

	useEffect(() => {
		if (
			typeof window !== 'undefined' &&
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
		) {
			setShown(text);
			return;
		}

		let i = 0;
		let timer: ReturnType<typeof setTimeout>;
		const tick = () => {
			setShown(text.slice(0, i));
			i += 1;
			if (i <= text.length) {
				timer = setTimeout(tick, speed);
			}
		};
		tick();

		return () => clearTimeout(timer);
	}, [text, speed]);

	return (
		<span className="typed">
			{shown}
			<span className="typed__cursor" aria-hidden="true" />
		</span>
	);
}
