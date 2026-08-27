'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * Client boundary for a mermaid diagram.
 *
 * The pipeline emits `<mermaid-diagram code="...">` at the remark stage and the
 * renderer maps that element here. Mermaid renders in the browser, so this is
 * the one place in the content path that must hydrate -- and the reason the
 * pipeline produces React elements rather than an HTML string.
 *
 * The `code` prop arrives verbatim from the fence; nothing escapes or re-parses
 * it, which is what the Svelte version had to do with template literals.
 */
export default function Mermaid({ code }: { code: string }) {
	const id = useId().replace(/[^a-zA-Z0-9]/g, '');
	const ref = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const mermaid = (await import('mermaid')).default;
				mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
				const { svg } = await mermaid.render(`mermaid-${id}`, code);
				if (!cancelled && ref.current) ref.current.innerHTML = svg;
			} catch (cause) {
				if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [code, id]);

	if (error) {
		return (
			<pre data-mermaid-error="" role="img" aria-label="Diagram failed to render">
				{code}
			</pre>
		);
	}

	// The server render emits the diagram source, so the content is present and
	// readable before hydration and if JavaScript never arrives. On a successful
	// client render the SVG replaces it.
	return (
		<div ref={ref} data-mermaid="" suppressHydrationWarning>
			<pre>{code}</pre>
		</div>
	);
}
