'use client';

import { useEffect, useState } from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** tmux-style `HH:MM DD-Mon-YY` in the visitor's local time. */
export function formatStatusClock(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}-${MONTHS[date.getMonth()]}-${pad(date.getFullYear() % 100)}`;
}

/**
 * The status line's clock. Empty in the static HTML (a build-time time would
 * be a lie) and filled after mount, so server and first client render agree.
 */
export function StatusClock() {
	const [now, setNow] = useState<string | null>(null);

	useEffect(() => {
		const tick = () => setNow(formatStatusClock(new Date()));
		tick();
		const id = window.setInterval(tick, 30_000);
		return () => window.clearInterval(id);
	}, []);

	return now ? <span className="term-status__clock">{now}</span> : null;
}
