'use client';

import { useEffect, useState } from 'react';

export interface TypedTextProps {
	text: string;
	speed?: number;
	className?: string;
}

/**
 * TypedText — types a string character by character (45 ms/char by default).
 *
 * Phosphor Fade: an amber block cursor rides the end of the text WHILE typing
 * and is removed when typing ends, so the shell's idle prompt keeps the page's
 * only resting cursor. Under `prefers-reduced-motion: reduce` the full string
 * appears at once and no cursor is drawn.
 *
 * The animated span is `aria-hidden`; assistive tech reads the full string from
 * a visually hidden copy, so it never hears a half-typed sentence. Runs
 * client-side only (useEffect): SSR renders no visible text and no cursor.
 * Ports `src/lib/components/TypedText.svelte`.
 */
export function TypedText({ text, speed = 45, className }: TypedTextProps) {
	const [shown, setShown] = useState('');
	const [typing, setTyping] = useState(false);

	useEffect(() => {
		if (
			typeof window !== 'undefined' &&
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
		) {
			setShown(text);
			setTyping(false);
			return;
		}

		let i = 0;
		let timer: ReturnType<typeof setTimeout>;
		setTyping(true);
		const tick = () => {
			setShown(text.slice(0, i));
			i += 1;
			if (i <= text.length) {
				timer = setTimeout(tick, speed);
			} else {
				setTyping(false);
			}
		};
		tick();

		return () => clearTimeout(timer);
	}, [text, speed]);

	return (
		<span className={className ? `typed-text ${className}` : 'typed-text'}>
			<span className="sr-only">{text}</span>
			<span aria-hidden="true">
				{shown}
				{typing ? <span className="typed-text__cursor" data-typing-cursor="" /> : null}
			</span>
		</span>
	);
}
