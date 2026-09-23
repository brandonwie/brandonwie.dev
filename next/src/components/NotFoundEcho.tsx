'use client';

import { useEffect, useRef } from 'react';

import { TermPrompt } from '@/shell/TermPrompt';

/** The requested path as the typed "command": no leading slash, decoded. */
function commandFor(pathname: string): string {
	const raw = pathname.replace(/^\/+/, '');
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
}

/**
 * NotFoundEcho — the 404's `$ <path>` prompt and its `command not found` reply.
 *
 * The static `404.html` cannot know the requested path, so both spans render
 * EMPTY on the server and in the first client render (no hydration mismatch),
 * then an effect fills them from `location.pathname`. The path is
 * attacker-controlled, so it is written with `textContent` only — never
 * `innerHTML` — and `/<img src=x onerror=…>` prints as text. Without
 * JavaScript the reply reads `zsh: command not found` with no argument.
 * Both lines are a visual echo; the h1 carries the meaning for assistive tech.
 */
export function NotFoundEcho() {
	const commandRef = useRef<HTMLSpanElement>(null);
	const argWrapRef = useRef<HTMLSpanElement>(null);
	const argRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		const command = commandFor(window.location.pathname);
		if (!command) return;
		if (commandRef.current) commandRef.current.textContent = command;
		if (argRef.current) argRef.current.textContent = command;
		argWrapRef.current?.removeAttribute('hidden');
	}, []);

	return (
		<>
			<TermPrompt cwd="~" command={<span className="pg-nf__req" ref={commandRef} />} />
			<p className="pg-nf__err" aria-hidden="true">
				<span className="text-crt-faint">zsh:</span>{' '}
				<span className="text-crt-hi">command not found</span>
				<span ref={argWrapRef} hidden>
					: <span className="pg-nf__req text-crt-amber" ref={argRef} />
				</span>
			</p>
		</>
	);
}
