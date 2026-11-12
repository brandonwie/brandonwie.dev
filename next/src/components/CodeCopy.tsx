'use client';

import { useEffect } from 'react';

/**
 * Gives every server-rendered `.code__copy` button its action: copy the code
 * block below it. One listener on the document serves all of them.
 */
export function CodeCopy({ copiedLabel }: { copiedLabel: string }) {
	useEffect(() => {
		async function onClick(event: MouseEvent) {
			const button = (event.target as Element).closest<HTMLButtonElement>('.code__copy');
			const code = button?.closest('.code')?.querySelector('pre');
			if (!button || !code) return;
			try {
				await navigator.clipboard.writeText(code.textContent ?? '');
			} catch {
				// The clipboard can be blocked (permissions, insecure origin): leave the label unchanged.
				return;
			}
			const label = button.dataset.label ?? button.textContent ?? '';
			button.dataset.label = label;
			button.textContent = copiedLabel;
			window.setTimeout(() => {
				button.textContent = label;
			}, 2000);
		}

		document.addEventListener('click', onClick);
		return () => document.removeEventListener('click', onClick);
	}, [copiedLabel]);

	return null;
}
