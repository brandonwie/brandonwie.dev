'use client';

import type { MermaidConfig } from 'mermaid';
import { useEffect, useId, useRef, useState } from 'react';

import { currentTheme, onThemeChange, tokenColor } from '@/shell/theme';

/**
 * Mermaid settings for the theme on screen.
 *
 * Colours are read from the site tokens as literals, because mermaid does
 * colour maths on them. `theme: 'base'` is the one mermaid theme meant to be
 * recoloured.
 *
 * `securityLevel: 'strict'`: the posts use no click directives and no HTML but
 * `<br>`, which strict mode keeps.
 *
 * @param fontFamily - the family the diagram container renders in; mermaid
 *   measures labels with it, so it must be the one the page uses
 */
function mermaidConfig(fontFamily: string): MermaidConfig {
	const bg = tokenColor('bg');
	const surface = tokenColor('surface');
	const raised = tokenColor('surface-2');
	const ink = tokenColor('ink');
	const muted = tokenColor('muted');
	const faint = tokenColor('faint');
	const edge = tokenColor('line-strong');
	const accent = tokenColor('accent');

	return {
		startOnLoad: false,
		// mermaid 12 defaults to the ELK layout and the `neo` look; pin the v11
		// rendering so existing diagrams keep their layout.
		layout: 'dagre',
		look: 'classic',
		theme: 'base',
		themeVariables: {
			darkMode: currentTheme() === 'dark',
			background: bg,
			mainBkg: surface,
			secondaryBkg: surface,
			primaryColor: surface,
			secondaryColor: raised,
			tertiaryColor: bg,
			primaryTextColor: ink,
			secondaryTextColor: muted,
			tertiaryTextColor: muted,
			textColor: ink,
			titleColor: ink,
			primaryBorderColor: accent,
			nodeBorder: accent,
			lineColor: faint,
			arrowheadColor: faint,
			clusterBkg: bg,
			clusterBorder: edge,
			edgeLabelBackground: bg,

			// Sequence diagrams
			actorBkg: surface,
			actorBorder: accent,
			actorTextColor: ink,
			actorLineColor: edge,
			signalColor: faint,
			signalTextColor: ink,
			labelBoxBkgColor: surface,
			labelBoxBorderColor: edge,
			labelTextColor: ink,
			loopTextColor: ink,
			noteBkgColor: raised,
			noteBorderColor: edge,
			noteTextColor: ink,
			activationBkgColor: raised,
			activationBorderColor: edge,
			sequenceNumberColor: bg,

			// Gantt: every bar sits on a ground that `ink` reads on.
			sectionBkgColor: bg,
			altSectionBkgColor: surface,
			sectionBkgColor2: bg,
			gridColor: edge,
			taskBkgColor: raised,
			taskBorderColor: edge,
			taskTextColor: ink,
			taskTextLightColor: ink,
			taskTextDarkColor: ink,
			taskTextOutsideColor: ink,
			taskTextClickableColor: accent,
			activeTaskBkgColor: surface,
			activeTaskBorderColor: accent,
			doneTaskBkgColor: bg,
			doneTaskBorderColor: edge,
			critBkgColor: raised,
			critBorderColor: accent,
			todayLineColor: accent,
			excludeBkgColor: bg,

			fontFamily,
			fontSize: '14px',
		},
		flowchart: {
			htmlLabels: true,
			curve: 'basis',
			// mermaid 12 lowered wrappingWidth to 120 and added a 120px minNodeWidth;
			// keep the v11 values so labels keep the line breaks the posts wrote.
			wrappingWidth: 200,
			minNodeWidth: 0,
		},
		securityLevel: 'strict',
	};
}

/**
 * A mermaid diagram. The pipeline emits `<mermaid-diagram code="...">` and the
 * renderer maps that element here.
 *
 * The server render holds the diagram source, so the content is readable before
 * hydration and without JavaScript. The browser replaces it with the drawing,
 * and draws again when the theme changes.
 */
export default function Mermaid({ code }: { code: string }) {
	const id = useId().replace(/[^a-zA-Z0-9]/g, '');
	const ref = useRef<HTMLDivElement>(null);
	const [error, setError] = useState(false);
	// Counts theme changes: a new value draws the diagram again in the new colours.
	const [themeVersion, setThemeVersion] = useState(0);

	useEffect(() => onThemeChange(() => setThemeVersion((version) => version + 1)), []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const mermaid = (await import('mermaid')).default;
				const fontFamily = ref.current ? getComputedStyle(ref.current).fontFamily : 'monospace';
				// Labels are measured in this font: wait for it, or they are sized for the fallback.
				await document.fonts.load(`14px ${fontFamily}`);
				mermaid.initialize(mermaidConfig(fontFamily));
				const { svg } = await mermaid.render(`mermaid-${id}-${themeVersion}`, code);
				if (cancelled || !ref.current) return;
				ref.current.innerHTML = svg;
				// Mermaid lets a diagram shrink to its box, which makes the labels of a
				// wide one too small to read on a phone. Keep the drawn size: the box scrolls.
				const drawing = ref.current.querySelector('svg');
				if (drawing) drawing.style.minWidth = drawing.style.maxWidth;
				setError(false);
			} catch {
				if (!cancelled) setError(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [code, id, themeVersion]);

	// Two disjoint markers: `data-mermaid-error` is a diagram the browser could
	// not draw, `data-mermaid` one it drew or has not tried yet.
	return (
		<div
			ref={ref}
			{...(error ? { 'data-mermaid-error': '' } : { 'data-mermaid': '' })}
			suppressHydrationWarning
		>
			<pre>{code}</pre>
		</div>
	);
}
