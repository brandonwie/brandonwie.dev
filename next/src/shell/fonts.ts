import localFont from 'next/font/local';

// The files are the `latin` subsets Google Fonts serves, and `unicode-range`
// below is that subset's range. next/font accepts only literals, so the range
// is written out in each call.

const inter = localFont({
	src: './fonts/Inter-Variable.woff2',
	weight: '100 900',
	style: 'normal',
	variable: '--font-inter',
	display: 'swap',
	declarations: [
		{
			prop: 'unicode-range',
			value:
				'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
		},
	],
});

// A separate family so the italic file downloads only on a page that has italic text.
const interItalic = localFont({
	src: './fonts/Inter-Italic-Variable.woff2',
	weight: '100 900',
	style: 'italic',
	variable: '--font-inter-italic',
	display: 'swap',
	preload: false,
	declarations: [
		{
			prop: 'unicode-range',
			value:
				'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
		},
	],
});

// No metric-adjusted fallback: next/font would derive it from Arial, which is not monospaced.
const jetbrainsMono = localFont({
	src: './fonts/JetBrainsMono-Variable.woff2',
	weight: '100 800',
	style: 'normal',
	variable: '--font-jbm',
	display: 'swap',
	adjustFontFallback: false,
	declarations: [
		{
			prop: 'unicode-range',
			value:
				'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
		},
	],
});

/** Class list for `<html>`: defines `--font-inter`, `--font-inter-italic` and `--font-jbm`. */
export const fontVariables = `${inter.variable} ${interItalic.variable} ${jetbrainsMono.variable}`;
