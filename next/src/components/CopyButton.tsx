'use client';

import { useState } from 'react';

/**
 * Copies text to the clipboard and says so for two seconds.
 *
 * @param text - what to copy; the address of the current page when absent
 */
export function CopyButton({
	label,
	copiedLabel,
	text,
	className,
}: {
	label: string;
	copiedLabel: string;
	text?: string;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(text ?? window.location.href);
		} catch {
			// The clipboard can be blocked (permissions, insecure origin): the label stays as it is.
			return;
		}
		setCopied(true);
		window.setTimeout(() => setCopied(false), 2000);
	}

	return (
		<button type="button" className={className} onClick={copy}>
			<span aria-live="polite">{copied ? copiedLabel : label}</span>
		</button>
	);
}
