'use client';

import { useEffect, useRef } from 'react';
import type { Locale } from '@/i18n/locale';

interface GiscusProps {
	slug: string;
	locale: Locale;
	title: string;
	statusMessage?: string;
}

/**
 * Giscus Comments Component
 *
 * WHAT: Embeds GitHub Discussions-based comments using giscus.
 * WHY: Provides commenting without a database - comments stored in GitHub Discussions.
 * HOW: Dynamically loads giscus script with post slug as the discussion term.
 *
 * DESIGN DECISION: Uses slug (not pathname) for discussion mapping so that
 * /posts/my-post and /ko/posts/my-post share the same comment thread.
 *
 * PRERENDER CONTRACT (A13):
 * Emits a stable localized mount boundary (`#giscus-comments` with `data-giscus-mount="true"`,
 * `data-giscus-term={slug}`, `data-giscus-locale={locale}`) in the prerendered HTML without
 * the client runtime script or iframe. The script is injected on mount in the browser.
 *
 * REFERENCE: https://giscus.app
 */
export function Giscus({ slug, locale, title, statusMessage }: GiscusProps) {
	const containerRef =
		typeof useRef === 'function' ? useRef<HTMLDivElement>(null) : { current: null };

	if (typeof useEffect === 'function') {
		useEffect(() => {
			const container = containerRef.current;
			if (!container) return;

			// Prevent duplicate script injection
			if (container.querySelector('script[src="https://giscus.app/client.js"]')) {
				return;
			}

			const script = document.createElement('script');
			script.src = 'https://giscus.app/client.js';
			script.async = true;
			script.crossOrigin = 'anonymous';

			// Configuration from giscus.app (matches src/lib/components/Giscus.svelte)
			script.dataset.repo = 'brandonwie/brandonwie.dev';
			script.dataset.repoId = 'R_kgDORBkERA';
			script.dataset.category = 'Blog Comments';
			script.dataset.categoryId = 'DIC_kwDORBkERM4C1gHN';
			script.dataset.mapping = 'specific';
			script.dataset.term = slug; // Shared between EN/KO versions
			script.dataset.strict = '0';
			script.dataset.reactionsEnabled = '1';
			script.dataset.emitMetadata = '0';
			script.dataset.inputPosition = 'top';
			script.dataset.theme = 'dark_dimmed';
			script.dataset.lang = locale;
			script.dataset.loading = 'lazy';

			container.appendChild(script);
		}, [slug, locale]);
	}

	return (
		<section
			className="comments-shell mt-16 border-t border-terminal-border pt-12"
			aria-labelledby="comments-title"
			data-pagefind-ignore
		>
			<h2 id="comments-title" className="mb-8 text-xl font-semibold text-terminal-text-primary">
				{title}
			</h2>
			{statusMessage ? <p className="sr-only">{statusMessage}</p> : null}
			<div
				ref={containerRef}
				className="giscus-container"
				id="giscus-comments"
				data-giscus-mount="true"
				data-giscus-term={slug}
				data-giscus-locale={locale}
			/>
		</section>
	);
}
