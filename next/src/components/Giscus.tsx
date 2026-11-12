'use client';

import { useEffect, useRef } from 'react';

import type { Locale } from '@/i18n/locale';
import { currentTheme, onThemeChange } from '@/shell/theme';

const GISCUS_ORIGIN = 'https://giscus.app';

function giscusTheme(): string {
	return currentTheme() === 'dark' ? 'dark_dimmed' : 'light';
}

/**
 * Comments through giscus, stored in GitHub Discussions (https://giscus.app).
 *
 * The discussion is keyed by the post slug, not the path, so `/posts/x` and
 * `/ko/posts/x` share one thread. The script is added on mount, so the static
 * HTML holds no third-party request, and giscus loads its frame lazily.
 */
export function Giscus({ slug, locale, title }: { slug: string; locale: Locale; title: string }) {
	const container = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const mount = container.current;
		if (!mount) return;

		// An effect can run twice on one mount (development): add the script once.
		if (!mount.querySelector('script')) {
			const script = document.createElement('script');
			script.src = `${GISCUS_ORIGIN}/client.js`;
			script.async = true;
			script.crossOrigin = 'anonymous';
			script.dataset.repo = 'brandonwie/brandonwie.dev';
			script.dataset.repoId = 'R_kgDORBkERA';
			script.dataset.category = 'Blog Comments';
			script.dataset.categoryId = 'DIC_kwDORBkERM4C1gHN';
			script.dataset.mapping = 'specific';
			script.dataset.term = slug;
			script.dataset.strict = '0';
			script.dataset.reactionsEnabled = '1';
			script.dataset.emitMetadata = '0';
			script.dataset.inputPosition = 'top';
			script.dataset.theme = giscusTheme();
			script.dataset.lang = locale;
			script.dataset.loading = 'lazy';
			mount.appendChild(script);
		}

		return onThemeChange(() => {
			const frame = mount.querySelector<HTMLIFrameElement>('iframe.giscus-frame');
			if (!frame) return;
			// The frame loads lazily, near the end of the post. Before that it takes
			// no messages: the theme goes in its address instead.
			if (frame.classList.contains('giscus-frame--loading')) {
				const address = new URL(frame.src);
				address.searchParams.set('theme', giscusTheme());
				frame.src = address.href;
				return;
			}
			frame.contentWindow?.postMessage(
				{ giscus: { setConfig: { theme: giscusTheme() } } },
				GISCUS_ORIGIN,
			);
		});
	}, [slug, locale]);

	return (
		<section className="comments" aria-labelledby="comments-title" data-pagefind-ignore>
			<h2 id="comments-title" className="eyebrow">
				{title}
			</h2>
			<div ref={container} />
		</section>
	);
}
