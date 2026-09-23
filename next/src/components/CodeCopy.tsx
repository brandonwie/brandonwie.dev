'use client';

import { useEffect } from 'react';

/**
 * CodeCopy — enhances prose code fences with a client-side copy button.
 *
 * Runs exclusively in the browser after mount. Finds every Shiki `<pre>` inside
 * `.prose-terminal`, which the page CSS draws as a terminal frame, and adds two
 * pieces to the frame border: a line-count label (top left, decorative) and a
 * bracket `[ Copy ]` button (top right, always visible). Both sit OUTSIDE the
 * `<code>` element, and the line-number gutter is CSS generated content, so the
 * button still copies clean code text. Has zero effect on the prerendered
 * static HTML export (preserving A3/A4 prose parity).
 */
export function CodeCopy({
	copyLabel = 'Copy',
	copiedLabel = 'Copied!',
}: {
	copyLabel?: string;
	copiedLabel?: string;
}) {
	if (typeof useEffect === 'function') {
		useEffect(() => {
			const preElements = document.querySelectorAll<HTMLPreElement>('.prose-terminal pre.shiki');

			const cleanupCallbacks: Array<() => void> = [];

			for (const pre of preElements) {
				if (pre.querySelector('.code-copy-btn')) continue;

				const lines = pre.querySelectorAll('code > .line').length;
				const label = document.createElement('span');
				label.className = 'pg-code__label';
				label.setAttribute('aria-hidden', 'true');
				label.textContent = `${lines} ${lines === 1 ? 'line' : 'lines'}`;

				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'pg-btn code-copy-btn';
				btn.setAttribute('aria-label', copyLabel);
				btn.textContent = copyLabel;

				let timer: ReturnType<typeof setTimeout> | null = null;

				const handleClick = async () => {
					const code = pre.querySelector('code')?.innerText ?? pre.innerText;
					try {
						await navigator.clipboard.writeText(code);
						btn.textContent = copiedLabel;
						btn.setAttribute('aria-label', copiedLabel);
						btn.classList.add('is-done');
						if (timer) clearTimeout(timer);
						timer = setTimeout(() => {
							btn.textContent = copyLabel;
							btn.setAttribute('aria-label', copyLabel);
							btn.classList.remove('is-done');
						}, 2000);
					} catch {
						// Clipboard API unavailable or permission denied
					}
				};

				btn.addEventListener('click', handleClick);
				pre.prepend(label);
				pre.appendChild(btn);

				cleanupCallbacks.push(() => {
					if (timer) clearTimeout(timer);
					btn.removeEventListener('click', handleClick);
					btn.remove();
					label.remove();
				});
			}

			return () => {
				for (const cleanup of cleanupCallbacks) {
					cleanup();
				}
			};
		}, [copyLabel, copiedLabel]);
	}

	return null;
}
