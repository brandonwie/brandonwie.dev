import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import '../../app/globals.css';

import type { Locale } from '../i18n/locale';
import { fontVariables } from './fonts';
import { THEME_STORAGE_KEY } from './theme';

export type { Locale };

/** Page background per theme: the one colour the browser chrome reads before any stylesheet. */
const THEME_COLOR = { light: '#fbfaf6', dark: '#141319' } as const;

export const DOCUMENT_METADATA: Metadata = {
	icons: {
		icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
	},
	manifest: '/site.webmanifest',
};

export const DOCUMENT_VIEWPORT: Viewport = {
	width: 'device-width',
	initialScale: 1,
	colorScheme: 'light dark',
	themeColor: [
		{ media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
		{ media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
	],
};

// Runs before first paint so a stored choice never flashes the other theme.
const THEME_INIT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

/**
 * The document shell. One instance per locale root layout; the error routes
 * have no Metadata API and pass `standaloneHead` to get the same head tags.
 *
 * @param standaloneHead - write the icon, manifest and theme tags by hand
 */
export function DocumentShell({
	lang,
	children,
	title,
	standaloneHead = false,
}: {
	lang: Locale;
	children: ReactNode;
	title?: string;
	standaloneHead?: boolean;
}) {
	return (
		// The inline script sets `data-theme` before hydration, so the attribute may differ.
		<html lang={lang} className={fontVariables} suppressHydrationWarning>
			<head>
				{title ? <title>{title}</title> : null}
				{standaloneHead ? (
					<>
						<meta name="color-scheme" content="light dark" />
						<meta
							name="theme-color"
							media="(prefers-color-scheme: light)"
							content={THEME_COLOR.light}
						/>
						<meta
							name="theme-color"
							media="(prefers-color-scheme: dark)"
							content={THEME_COLOR.dark}
						/>
						<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
						<link rel="manifest" href="/site.webmanifest" />
					</>
				) : null}
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
			</head>
			<body>{children}</body>
		</html>
	);
}
