'use client';

import { useEffect } from 'react';

/**
 * CodeCopy — enhances prose code fences with a client-side copy button.
 *
 * Runs exclusively in the browser after mount. Finds all `<pre class="shiki">`
 * elements inside `.prose-terminal` and injects a copy button into each pre header.
 * Has zero effect on the prerendered static HTML export (preserving A3/A4 prose parity).
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
			const preElements = document.querySelectorAll<HTMLPreElement>('.prose-terminal pre');

			const cleanupCallbacks: Array<() => void> = [];

			for (const pre of preElements) {
				if (pre.querySelector('.code-copy-btn')) continue;

				// Ensure relative positioning for absolute button placement
				if (getComputedStyle(pre).position === 'static') {
					pre.style.position = 'relative';
				}

				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'code-copy-btn';
				btn.setAttribute('aria-label', copyLabel);
				btn.textContent = copyLabel;

				let timer: ReturnType<typeof setTimeout> | null = null;

				const handleClick = async () => {
					const code = pre.querySelector('code')?.innerText ?? pre.innerText;
					try {
						await navigator.clipboard.writeText(code);
						btn.textContent = copiedLabel;
						btn.setAttribute('aria-label', copiedLabel);
						btn.classList.add('code-copy-btn--copied');
						if (timer) clearTimeout(timer);
						timer = setTimeout(() => {
							btn.textContent = copyLabel;
							btn.setAttribute('aria-label', copyLabel);
							btn.classList.remove('code-copy-btn--copied');
						}, 2000);
					} catch {
						// Clipboard API unavailable or permission denied
					}
				};

				btn.addEventListener('click', handleClick);
				pre.appendChild(btn);

				cleanupCallbacks.push(() => {
					if (timer) clearTimeout(timer);
					btn.removeEventListener('click', handleClick);
					btn.remove();
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
