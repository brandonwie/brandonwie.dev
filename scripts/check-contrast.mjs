/**
 * Contrast gate for the colour tokens in `src/app.css` (WCAG 2.1).
 *
 *   node scripts/check-contrast.mjs [stylesheet]
 *
 * Reads every `--name: light-dark(#light, #dark);` token and fails when a text
 * colour is too close to a ground it is used on:
 *   - `ink` and `muted` need 7:1 (body text)
 *   - every other text colour needs 4.5:1
 *   - `line-strong` needs 3:1 on `bg` (control boundaries)
 * The grounds are `bg`, `surface`, `surface-2` and `code-bg`.
 */
import { readFileSync } from 'node:fs';

const CSS = process.argv[2] ?? new URL('../src/app.css', import.meta.url);
const GROUNDS = ['bg', 'surface', 'surface-2', 'code-bg'];
const BODY = ['ink', 'muted'];
const TEXT = [
	'faint',
	'accent',
	'accent-strong',
	'love',
	'gold',
	'rose',
	'pine',
	'foam',
	'iris',
	'ok',
];

const channel = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

function luminance(hex) {
	const n = parseInt(hex.slice(1), 16);
	const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => channel(v / 255));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
	const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (high + 0.05) / (low + 0.05);
}

const tokens = {};
const pattern = /--([a-z0-9-]+):\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/gi;
for (const [, name, light, dark] of readFileSync(CSS, 'utf8').matchAll(pattern)) {
	tokens[name] = { light, dark };
}

const failures = [];
function need(text, ground, minimum) {
	for (const theme of ['light', 'dark']) {
		if (!tokens[text] || !tokens[ground]) {
			failures.push(`missing token: ${tokens[text] ? ground : text}`);
			return;
		}
		const value = ratio(tokens[text][theme], tokens[ground][theme]);
		if (value < minimum) {
			failures.push(`${theme}: ${text} on ${ground} is ${value.toFixed(2)}:1, needs ${minimum}:1`);
		}
	}
}

for (const ground of GROUNDS) {
	for (const text of BODY) need(text, ground, 7);
	for (const text of TEXT) need(text, ground, 4.5);
}
need('line-strong', 'bg', 3);
// Selected text and the skip link put the page colour on an accent or ink ground.
need('bg', 'accent', 4.5);

if (failures.length > 0) {
	console.error(`contrast: ${failures.length} pair(s) below target`);
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}
console.log(`contrast: ${Object.keys(tokens).length} tokens, all pairs meet their target`);
