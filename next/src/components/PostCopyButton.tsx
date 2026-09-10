'use client';

import { useState } from 'react';

/**
 * PostCopyButton — copies the current page URL to clipboard.
 *
 * Ported from `PostDetail.svelte:94-100,258-265`.
 * Provides transient copied state with 2-second timeout.
 */
export function PostCopyButton({
	copyLabel = 'Copy link',
	copiedLabel = 'Copied!',
}: {
	copyLabel?: string;
	copiedLabel?: string;
}) {
	const [copied, setCopied] = typeof useState === 'function' ? useState(false) : [false, () => {}];

	async function handleCopy() {
		try {
			if (typeof navigator !== 'undefined' && navigator.clipboard) {
				await navigator.clipboard.writeText(window.location.href);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			}
		} catch {
			// Clipboard API can reject in certain contexts
		}
	}

	return (
		<button
			type="button"
			className="post__copy"
			onClick={handleCopy}
			aria-label={copied ? copiedLabel : copyLabel}
		>
			{copied ? copiedLabel : copyLabel}
		</button>
	);
}
