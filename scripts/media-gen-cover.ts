/**
 * media-gen-cover.ts
 *
 * Deterministic renderer for media-gen Catppuccin terminal covers.
 * Turns one per-post content brief (resources/media/<slug>/brief.json) into two
 * rasterized covers that share the same design at two aspect ratios:
 *
 *   - og   1200x630  (1.91:1) -> static/og/<slug>.png    (list card + og:image / Twitter meta)
 *   - hero 2400x1260 (1.91:1) -> static/hero/<slug>.png   (in-post hero; reusable X / LinkedIn article cover)
 *
 * SVG sources are kept under resources/media/<slug>/<platform>.svg so every
 * cover is editable + re-rasterizable. Mirrors the /3b:media-gen skill recipe
 * (hand-placed Catppuccin terminal SVG -> rsvg-convert), industrialized so all
 * posts render consistently from a single template.
 *
 * Usage:
 *   tsx scripts/media-gen-cover.ts                 # render every brief, both platforms
 *   tsx scripts/media-gen-cover.ts --slug=foo      # one slug only
 *   tsx scripts/media-gen-cover.ts --platforms=og  # subset (og | hero | og,hero)
 *   tsx scripts/media-gen-cover.ts --check         # validate briefs, no render
 *
 * Rasterizer: rsvg-convert (only supported local engine, per skill).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA_DIR = join(ROOT, 'resources/media');
const OG_OUT = join(ROOT, 'static/og');
const HERO_OUT = join(ROOT, 'static/hero');

// ── Types ────────────────────────────────────────────────────────────────
type GlyphId =
	| 'graph'
	| 'network'
	| 'search'
	| 'vector'
	| 'symbol'
	| 'database'
	| 'cache'
	| 'queue'
	| 'lock'
	| 'shield'
	| 'pipeline'
	| 'cloud'
	| 'api'
	| 'diff'
	| 'clock'
	| 'layers'
	| 'branch'
	| 'terminal'
	| 'chart'
	| 'doc'
	| 'gear'
	| 'node';

interface Component {
	label: string;
	sublabel: string;
	glyph: GlyphId;
}

interface Brief {
	slug: string;
	topic: string;
	thesis: string;
	components: Component[];
	takeaway: string;
	theme?: 'terminal-mocha' | 'terminal-latte';
	alt?: string;
}

interface Theme {
	bgTop: string;
	bgBot: string;
	panel: string;
	panelStroke: string;
	divider: string;
	title: string;
	path: string;
	dollar: string;
	text: string;
	sub: string;
	caption: string;
	handle: string;
	lights: [string, string, string];
	accents: [string, string, string, string];
}

const THEMES: Record<string, Theme> = {
	'terminal-mocha': {
		bgTop: '#181825',
		bgBot: '#11111b',
		panel: '#1e1e2e',
		panelStroke: '#313244',
		divider: '#313244',
		title: '#bac2de',
		path: '#585b70',
		dollar: '#a6e3a1',
		text: '#cdd6f4',
		sub: '#a6adc8',
		caption: '#7f849c',
		handle: '#45475a',
		lights: ['#f38ba8', '#f9e2af', '#a6e3a1'],
		accents: ['#a6e3a1', '#fab387', '#89b4fa', '#cba6f7'],
	},
	'terminal-latte': {
		bgTop: '#e6e9ef',
		bgBot: '#dce0e8',
		panel: '#eff1f5',
		panelStroke: '#ccd0da',
		divider: '#ccd0da',
		title: '#5c5f77',
		path: '#9ca0b0',
		dollar: '#40a02b',
		text: '#4c4f69',
		sub: '#6c6f85',
		caption: '#7c7f93',
		handle: '#bcc0cc',
		lights: ['#d20f39', '#df8e1d', '#40a02b'],
		accents: ['#40a02b', '#fe640b', '#1e66f5', '#8839ef'],
	},
};

// ── Geometry profiles ────────────────────────────────────────────────────
interface Profile {
	key: 'og' | 'hero';
	vbW: number;
	vbH: number;
	outW: number;
	outH: number;
	panel: { x: number; y: number; w: number; h: number; rx: number };
	lights: { cy: number; cx: [number, number, number]; r: number };
	title: { x: number; y: number; size: number; maxW: number };
	path: { x: number; y: number; size: number };
	divider: { y: number; x1: number; x2: number };
	thesis: { x: number; y: number; size: number; maxW: number };
	cards: { y: number; h: number; x0: number; x1: number };
	caption: { x: number; y: number; size: number; maxW: number };
	handle: { x: number; y: number; size: number };
}

const PROFILES: Record<'og' | 'hero', Profile> = {
	og: {
		key: 'og',
		vbW: 1200,
		vbH: 630,
		outW: 1200,
		outH: 630,
		// full-bleed: the terminal surface fills the whole frame (no floating-panel margin)
		panel: { x: 0, y: 0, w: 1200, h: 630, rx: 0 },
		lights: { cy: 50, cx: [52, 80, 108], r: 9 },
		title: { x: 144, y: 57, size: 22, maxW: 640 },
		path: { x: 1148, y: 57, size: 18 },
		divider: { y: 84, x1: 52, x2: 1148 },
		thesis: { x: 52, y: 176, size: 40, maxW: 1096 },
		cards: { y: 246, h: 238, x0: 52, x1: 1148 },
		caption: { x: 52, y: 572, size: 24, maxW: 1000 },
		handle: { x: 1148, y: 572, size: 22 },
	},
	hero: {
		key: 'hero',
		vbW: 1600,
		vbH: 640,
		outW: 2000,
		outH: 800,
		panel: { x: 80, y: 60, w: 1440, h: 520, rx: 20 },
		lights: { cy: 102, cx: [120, 150, 180], r: 9 },
		title: { x: 222, y: 109, size: 22, maxW: 900 },
		path: { x: 1500, y: 109, size: 18 },
		divider: { y: 132, x1: 100, x2: 1500 },
		thesis: { x: 120, y: 212, size: 38, maxW: 1360 },
		cards: { y: 272, h: 196, x0: 120, x1: 1480 },
		caption: { x: 120, y: 540, size: 24, maxW: 1100 },
		handle: { x: 1500, y: 540, size: 22 },
	},
};

// ── Text helpers ─────────────────────────────────────────────────────────
function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

const CHAR_W = 0.6; // monospace advance per em

/** Shrink font to fit maxW; hard-truncate with ellipsis at minFont. */
function fit(
	text: string,
	maxW: number,
	baseFont: number,
	minFont: number,
): { text: string; size: number } {
	const clean = text.trim();
	const needed = clean.length * CHAR_W * baseFont;
	if (needed <= maxW) return { text: clean, size: baseFont };
	const size = Math.max(minFont, Math.floor(maxW / (clean.length * CHAR_W)));
	const maxChars = Math.floor(maxW / (CHAR_W * size));
	if (clean.length <= maxChars) return { text: clean, size };
	return { text: clean.slice(0, Math.max(1, maxChars - 1)) + '…', size };
}

// ── Glyph library (hand-drawn, one per card) ─────────────────────────────
// Each returns SVG centered on (cx, cy); `s` is the half-extent; `a` is accent.
function glyph(id: GlyphId, cx: number, cy: number, s: number, a: string): string {
	const sw = Math.max(2.4, s * 0.12);
	const ln = (x1: number, y1: number, x2: number, y2: number, w = sw) =>
		`<line x1="${r(cx + x1)}" y1="${r(cy + y1)}" x2="${r(cx + x2)}" y2="${r(cy + y2)}" stroke="${a}" stroke-width="${r(w)}" stroke-linecap="round"/>`;
	const ci = (x: number, y: number, rad: number, fill = 'none') =>
		`<circle cx="${r(cx + x)}" cy="${r(cy + y)}" r="${r(rad)}" fill="${fill}" stroke="${a}" stroke-width="${r(sw)}"/>`;
	const dot = (x: number, y: number, rad: number) =>
		`<circle cx="${r(cx + x)}" cy="${r(cy + y)}" r="${r(rad)}" fill="${a}"/>`;
	const rect = (x: number, y: number, w: number, h: number, rx = 4, fill = 'none') =>
		`<rect x="${r(cx + x)}" y="${r(cy + y)}" width="${r(w)}" height="${r(h)}" rx="${r(rx)}" fill="${fill}" stroke="${a}" stroke-width="${r(sw)}"/>`;

	switch (id) {
		case 'graph':
		case 'network': {
			const o = s * 0.92;
			return [
				ln(0, 0, -o, -o * 0.7),
				ln(0, 0, o, -o * 0.7),
				ln(0, 0, -o, o * 0.7),
				ln(0, 0, o, o * 0.7),
				ci(-o, -o * 0.7, s * 0.26),
				ci(o, -o * 0.7, s * 0.26),
				ci(-o, o * 0.7, s * 0.26),
				ci(o, o * 0.7, s * 0.26),
				dot(0, 0, s * 0.3),
			].join('');
		}
		case 'search': {
			const bw = s * 1.4;
			return [
				`<rect x="${r(cx - bw)}" y="${r(cy - s * 0.7)}" width="${r(bw * 1.2)}" height="${r(sw * 1.3)}" rx="2" fill="${a}" opacity="0.55"/>`,
				`<rect x="${r(cx - bw)}" y="${r(cy - s * 0.2)}" width="${r(bw)}" height="${r(sw * 1.3)}" rx="2" fill="${a}"/>`,
				`<rect x="${r(cx - bw)}" y="${r(cy + s * 0.3)}" width="${r(bw * 0.8)}" height="${r(sw * 1.3)}" rx="2" fill="${a}" opacity="0.4"/>`,
				ci(s * 0.5, s * 0.4, s * 0.5),
				ln(s * 0.85, s * 0.75, s * 1.2, s * 1.1),
			].join('');
		}
		case 'vector': {
			return [
				rect(-s, -s, s * 2, s * 2, 6),
				`<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(s * 0.66)}" fill="none" stroke="${a}" stroke-width="${r(sw * 0.8)}" stroke-dasharray="${r(s * 0.22)} ${r(s * 0.18)}"/>`,
				dot(0, 0, s * 0.18),
				dot(-s * 0.55, -s * 0.4, s * 0.12),
				dot(s * 0.5, -s * 0.5, s * 0.12),
				dot(s * 0.45, s * 0.5, s * 0.12),
				ln(0, 0, s * 0.5, -s * 0.5, sw * 0.7),
			].join('');
		}
		case 'symbol': {
			const bw = s * 0.95;
			const bh = s * 0.7;
			return [
				rect(-s * 1.35, -bh, bw, bh * 2, 4),
				rect(s * 0.4, -bh, bw, bh * 2, 4),
				ln(-s * 0.4, 0, s * 0.32, 0, sw * 0.9),
				`<path d="M ${r(cx + s * 0.32)} ${r(cy)} l ${r(-s * 0.22)} ${r(-s * 0.2)} l 0 ${r(s * 0.4)} z" fill="${a}"/>`,
			].join('');
		}
		case 'database': {
			const rx = s * 0.95;
			const ry = s * 0.34;
			const top = cy - s * 0.8;
			const bot = cy + s * 0.8;
			return [
				`<ellipse cx="${r(cx)}" cy="${r(top)}" rx="${r(rx)}" ry="${r(ry)}" fill="none" stroke="${a}" stroke-width="${r(sw)}"/>`,
				`<path d="M ${r(cx - rx)} ${r(top)} L ${r(cx - rx)} ${r(bot)} A ${r(rx)} ${r(ry)} 0 0 0 ${r(cx + rx)} ${r(bot)} L ${r(cx + rx)} ${r(top)}" fill="none" stroke="${a}" stroke-width="${r(sw)}"/>`,
				`<path d="M ${r(cx - rx)} ${r(cy)} A ${r(rx)} ${r(ry)} 0 0 0 ${r(cx + rx)} ${r(cy)}" fill="none" stroke="${a}" stroke-width="${r(sw * 0.8)}" opacity="0.7"/>`,
			].join('');
		}
		case 'cache': {
			// zap / lightning bolt
			return `<path d="M ${r(cx + s * 0.2)} ${r(cy - s)} L ${r(cx - s * 0.5)} ${r(cy + s * 0.1)} L ${r(cx)} ${r(cy + s * 0.1)} L ${r(cx - s * 0.15)} ${r(cy + s)} L ${r(cx + s * 0.55)} ${r(cy - s * 0.15)} L ${r(cx)} ${r(cy - s * 0.15)} Z" fill="none" stroke="${a}" stroke-width="${r(sw)}" stroke-linejoin="round"/>`;
		}
		case 'queue': {
			const n = 4;
			const bw = s * 0.42;
			const gap = s * 0.16;
			const total = n * bw + (n - 1) * gap;
			let x = -total / 2;
			const parts: string[] = [];
			for (let i = 0; i < n; i++) {
				parts.push(rect(x, -s * 0.5, bw, s, 3, i === 0 ? a : 'none'));
				x += bw + gap;
			}
			parts.push(ln(-total / 2 - s * 0.5, 0, -total / 2 - s * 0.05, 0, sw * 0.8));
			return parts.join('');
		}
		case 'lock': {
			const bw = s * 1.3;
			const bh = s * 1.05;
			return [
				`<path d="M ${r(cx - s * 0.55)} ${r(cy - s * 0.15)} L ${r(cx - s * 0.55)} ${r(cy - s * 0.6)} A ${r(s * 0.55)} ${r(s * 0.55)} 0 0 1 ${r(cx + s * 0.55)} ${r(cy - s * 0.6)} L ${r(cx + s * 0.55)} ${r(cy - s * 0.15)}" fill="none" stroke="${a}" stroke-width="${r(sw)}"/>`,
				`<rect x="${r(cx - bw / 2)}" y="${r(cy - s * 0.15)}" width="${r(bw)}" height="${r(bh)}" rx="5" fill="none" stroke="${a}" stroke-width="${r(sw)}"/>`,
				dot(0, s * 0.32, s * 0.16),
			].join('');
		}
		case 'shield': {
			return [
				`<path d="M ${r(cx)} ${r(cy - s)} L ${r(cx + s * 0.85)} ${r(cy - s * 0.6)} L ${r(cx + s * 0.85)} ${r(cy + s * 0.15)} Q ${r(cx + s * 0.85)} ${r(cy + s * 0.8)} ${r(cx)} ${r(cy + s)} Q ${r(cx - s * 0.85)} ${r(cy + s * 0.8)} ${r(cx - s * 0.85)} ${r(cy + s * 0.15)} L ${r(cx - s * 0.85)} ${r(cy - s * 0.6)} Z" fill="none" stroke="${a}" stroke-width="${r(sw)}"/>`,
				`<path d="M ${r(cx - s * 0.4)} ${r(cy + s * 0.05)} L ${r(cx - s * 0.08)} ${r(cy + s * 0.38)} L ${r(cx + s * 0.45)} ${r(cy - s * 0.3)}" fill="none" stroke="${a}" stroke-width="${r(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`,
			].join('');
		}
		case 'pipeline': {
			const bw = s * 0.62;
			const bh = s * 0.7;
			const xs = [-s * 1.25, 0, s * 1.25];
			const parts: string[] = [];
			xs.forEach((x) => parts.push(rect(x - bw / 2, -bh / 2, bw, bh, 4)));
			parts.push(ln(xs[0] + bw / 2, 0, xs[1] - bw / 2, 0, sw * 0.8));
			parts.push(ln(xs[1] + bw / 2, 0, xs[2] - bw / 2, 0, sw * 0.8));
			return parts.join('');
		}
		case 'cloud': {
			return `<path d="M ${r(cx - s * 0.9)} ${r(cy + s * 0.4)} A ${r(s * 0.42)} ${r(s * 0.42)} 0 0 1 ${r(cx - s * 0.5)} ${r(cy - s * 0.2)} A ${r(s * 0.55)} ${r(s * 0.55)} 0 0 1 ${r(cx + s * 0.4)} ${r(cy - s * 0.35)} A ${r(s * 0.42)} ${r(s * 0.42)} 0 0 1 ${r(cx + s * 0.95)} ${r(cy + s * 0.4)} Z" fill="none" stroke="${a}" stroke-width="${r(sw)}" stroke-linejoin="round"/>`;
		}
		case 'api': {
			return [
				`<path d="M ${r(cx - s * 0.5)} ${r(cy - s)} Q ${r(cx - s)} ${r(cy - s)} ${r(cx - s)} ${r(cy - s * 0.4)} Q ${r(cx - s)} ${r(cy)} ${r(cx - s * 1.25)} ${r(cy)} Q ${r(cx - s)} ${r(cy)} ${r(cx - s)} ${r(cy + s * 0.4)} Q ${r(cx - s)} ${r(cy + s)} ${r(cx - s * 0.5)} ${r(cy + s)}" fill="none" stroke="${a}" stroke-width="${r(sw)}"/>`,
				`<path d="M ${r(cx + s * 0.5)} ${r(cy - s)} Q ${r(cx + s)} ${r(cy - s)} ${r(cx + s)} ${r(cy - s * 0.4)} Q ${r(cx + s)} ${r(cy)} ${r(cx + s * 1.25)} ${r(cy)} Q ${r(cx + s)} ${r(cy)} ${r(cx + s)} ${r(cy + s * 0.4)} Q ${r(cx + s)} ${r(cy + s)} ${r(cx + s * 0.5)} ${r(cy + s)}" fill="none" stroke="${a}" stroke-width="${r(sw)}"/>`,
				dot(0, 0, s * 0.2),
			].join('');
		}
		case 'diff': {
			return [
				`<rect x="${r(cx - s)}" y="${r(cy - s * 0.85)}" width="${r(s * 2)}" height="${r(s * 0.62)}" rx="3" fill="${a}" opacity="0.5"/>`,
				`<rect x="${r(cx - s)}" y="${r(cy + s * 0.22)}" width="${r(s * 1.5)}" height="${r(s * 0.62)}" rx="3" fill="none" stroke="${a}" stroke-width="${r(sw * 0.8)}"/>`,
				ln(-s * 0.7, -s * 0.54, -s * 0.2, -s * 0.54, sw * 0.7),
				ln(-s * 0.45, -s * 0.79, -s * 0.45, -s * 0.29, sw * 0.7),
				ln(-s * 0.7, s * 0.53, -s * 0.2, s * 0.53, sw * 0.7),
			].join('');
		}
		case 'clock': {
			return [
				ci(0, 0, s * 0.92),
				ln(0, 0, 0, -s * 0.55, sw * 0.9),
				ln(0, 0, s * 0.42, s * 0.2, sw * 0.9),
			].join('');
		}
		case 'layers': {
			const w = s * 1.1;
			const h = s * 0.42;
			const dia = (yo: number, fill = 'none') =>
				`<path d="M ${r(cx)} ${r(cy + yo - h)} L ${r(cx + w)} ${r(cy + yo)} L ${r(cx)} ${r(cy + yo + h)} L ${r(cx - w)} ${r(cy + yo)} Z" fill="${fill}" stroke="${a}" stroke-width="${r(sw * 0.85)}"/>`;
			return [dia(s * 0.6), dia(0), dia(-s * 0.6, a)].reverse().join('');
		}
		case 'branch': {
			return [
				ln(-s * 0.6, -s, -s * 0.6, s, sw),
				ci(-s * 0.6, -s, s * 0.24, a),
				ci(-s * 0.6, s, s * 0.24),
				ci(s * 0.7, -s * 0.1, s * 0.24),
				`<path d="M ${r(cx - s * 0.6)} ${r(cy + s * 0.2)} Q ${r(cx - s * 0.6)} ${r(cy - s * 0.1)} ${r(cx + s * 0.46)} ${r(cy - s * 0.1)}" fill="none" stroke="${a}" stroke-width="${r(sw * 0.85)}"/>`,
			].join('');
		}
		case 'terminal': {
			return [
				rect(-s * 1.15, -s * 0.85, s * 2.3, s * 1.7, 5),
				`<path d="M ${r(cx - s * 0.6)} ${r(cy - s * 0.2)} L ${r(cx - s * 0.15)} ${r(cy + s * 0.12)} L ${r(cx - s * 0.6)} ${r(cy + s * 0.44)}" fill="none" stroke="${a}" stroke-width="${r(sw * 0.9)}" stroke-linecap="round" stroke-linejoin="round"/>`,
				ln(s * 0.05, s * 0.44, s * 0.6, s * 0.44, sw * 0.9),
			].join('');
		}
		case 'chart': {
			const bw = s * 0.42;
			return [
				ln(-s, s * 0.9, s, s * 0.9, sw * 0.8),
				`<rect x="${r(cx - s * 0.85)}" y="${r(cy + s * 0.1)}" width="${r(bw)}" height="${r(s * 0.8)}" fill="${a}" opacity="0.6"/>`,
				`<rect x="${r(cx - s * 0.2)}" y="${r(cy - s * 0.5)}" width="${r(bw)}" height="${r(s * 1.4)}" fill="${a}"/>`,
				`<rect x="${r(cx + s * 0.45)}" y="${r(cy - s * 0.1)}" width="${r(bw)}" height="${r(s)}" fill="${a}" opacity="0.8"/>`,
			].join('');
		}
		case 'doc': {
			const w = s * 1.3;
			const h = s * 1.7;
			const fold = s * 0.5;
			return [
				`<path d="M ${r(cx - w / 2)} ${r(cy - h / 2)} L ${r(cx + w / 2 - fold)} ${r(cy - h / 2)} L ${r(cx + w / 2)} ${r(cy - h / 2 + fold)} L ${r(cx + w / 2)} ${r(cy + h / 2)} L ${r(cx - w / 2)} ${r(cy + h / 2)} Z" fill="none" stroke="${a}" stroke-width="${r(sw)}" stroke-linejoin="round"/>`,
				ln(-s * 0.35, s * 0.1, s * 0.35, s * 0.1, sw * 0.7),
				ln(-s * 0.35, s * 0.5, s * 0.35, s * 0.5, sw * 0.7),
			].join('');
		}
		case 'gear': {
			const teeth: string[] = [];
			for (let i = 0; i < 8; i++) {
				const ang = (i / 8) * Math.PI * 2;
				const x1 = Math.cos(ang) * s * 0.72;
				const y1 = Math.sin(ang) * s * 0.72;
				const x2 = Math.cos(ang) * s;
				const y2 = Math.sin(ang) * s;
				teeth.push(ln(x1, y1, x2, y2, sw * 1.1));
			}
			return [ci(0, 0, s * 0.62), ...teeth, dot(0, 0, s * 0.2)].join('');
		}
		case 'node':
		default:
			return [ci(0, 0, s * 0.85), dot(0, 0, s * 0.28)].join('');
	}
}

/** round to 2dp, drop trailing zeros */
function r(n: number): number {
	return Math.round(n * 100) / 100;
}

// ── SVG composition ──────────────────────────────────────────────────────
function renderSvg(brief: Brief, p: Profile): string {
	const t = THEMES[brief.theme ?? 'terminal-mocha'] ?? THEMES['terminal-mocha'];
	const n = brief.components.length;
	const out: string[] = [];

	out.push(
		`<svg viewBox="0 0 ${p.vbW} ${p.vbH}" xmlns="http://www.w3.org/2000/svg" font-family="'DejaVu Sans Mono','SF Mono',Menlo,Consolas,monospace">`,
	);
	out.push(
		`<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bgTop}"/><stop offset="1" stop-color="${t.bgBot}"/></linearGradient></defs>`,
	);
	// full-bleed terminal surface
	out.push(`<rect width="${p.vbW}" height="${p.vbH}" fill="url(#bg)"/>`);

	// traffic lights
	p.lights.cx.forEach((cx, i) =>
		out.push(`<circle cx="${cx}" cy="${p.lights.cy}" r="${p.lights.r}" fill="${t.lights[i]}"/>`),
	);
	// window title + path
	const topic = fit(brief.topic, p.title.maxW, p.title.size, 14);
	out.push(
		`<text x="${p.title.x}" y="${p.title.y}" font-size="${topic.size}" fill="${t.title}">${escapeXml(topic.text)}</text>`,
	);
	out.push(
		`<text x="${p.path.x}" y="${p.path.y}" font-size="${p.path.size}" fill="${t.path}" text-anchor="end">~/posts</text>`,
	);
	out.push(
		`<line x1="${p.divider.x1}" y1="${p.divider.y}" x2="${p.divider.x2}" y2="${p.divider.y}" stroke="${t.divider}" stroke-width="2"/>`,
	);
	// thesis line
	const thesis = fit(brief.thesis, p.thesis.maxW, p.thesis.size, 22);
	out.push(
		`<text x="${p.thesis.x}" y="${p.thesis.y}" font-size="${thesis.size}"><tspan fill="${t.dollar}">$ </tspan><tspan fill="${t.text}">${escapeXml(thesis.text)}</tspan></text>`,
	);

	// component cards
	const innerW = p.cards.x1 - p.cards.x0;
	const gap =
		n <= 2
			? p.key === 'hero'
				? 90
				: 80
			: n === 3
				? p.key === 'hero'
					? 40
					: 28
				: p.key === 'hero'
					? 30
					: 22;
	const cardW = (innerW - (n - 1) * gap) / n;
	const labelSize = Math.min(p.key === 'hero' ? 28 : 26, Math.max(14, Math.floor(cardW / 13)));
	const subSize = Math.max(12, labelSize - 6);
	const gScale = Math.min(1.15, Math.max(0.72, cardW / (p.key === 'hero' ? 360 : 300)));
	const gHalf = (p.key === 'hero' ? 30 : 26) * gScale;
	const glyphCy = p.cards.y + (p.key === 'hero' ? 78 : 88);
	const labelY = p.cards.y + (p.key === 'hero' ? 150 : 172);
	const subY = p.cards.y + (p.key === 'hero' ? 180 : 204);

	brief.components.forEach((c, i) => {
		const x = p.cards.x0 + i * (cardW + gap);
		const a = t.accents[i % t.accents.length];
		const cx = x + cardW / 2;
		out.push(
			`<rect x="${r(x)}" y="${p.cards.y}" width="${r(cardW)}" height="${p.cards.h}" rx="14" fill="${t.panel}" stroke="${a}" stroke-opacity="0.5" stroke-width="2"/>`,
		);
		out.push(glyph(c.glyph, cx, glyphCy, gHalf, a));
		const lab = fit(c.label, cardW - 30, labelSize, 12);
		const sub = fit(c.sublabel, cardW - 30, subSize, 11);
		out.push(
			`<text x="${r(x + 20)}" y="${labelY}" font-size="${lab.size}" fill="${t.text}">${escapeXml(lab.text)}</text>`,
		);
		out.push(
			`<text x="${r(x + 20)}" y="${subY}" font-size="${sub.size}" fill="${t.sub}">${escapeXml(sub.text)}</text>`,
		);
	});

	// caption + handle
	const cap = fit(brief.takeaway, p.caption.maxW, p.caption.size, 16);
	out.push(
		`<text x="${p.caption.x}" y="${p.caption.y}" font-size="${cap.size}"><tspan fill="${t.dollar}">$ </tspan><tspan fill="${t.caption}">${escapeXml(cap.text)}</tspan></text>`,
	);
	out.push(
		`<text x="${p.handle.x}" y="${p.handle.y}" font-size="${p.handle.size}" fill="${t.handle}" text-anchor="end">@BrandonWie</text>`,
	);

	out.push('</svg>');
	return out.join('\n');
}

// ── Validation ───────────────────────────────────────────────────────────
function validate(b: unknown, slug: string): string[] {
	const errs: string[] = [];
	const brief = b as Partial<Brief>;
	for (const f of ['topic', 'thesis', 'takeaway'] as const) {
		if (!brief[f] || typeof brief[f] !== 'string') errs.push(`missing ${f}`);
	}
	if (!Array.isArray(brief.components)) errs.push('components must be an array');
	else if (brief.components.length < 2 || brief.components.length > 4)
		errs.push(`components must be 2-4 (got ${brief.components.length})`);
	else
		brief.components.forEach((c, i) => {
			if (!c.label) errs.push(`component[${i}].label missing`);
			if (!c.glyph) errs.push(`component[${i}].glyph missing`);
		});
	if (brief.slug && brief.slug !== slug) errs.push(`slug mismatch: ${brief.slug} vs dir ${slug}`);
	return errs;
}

// ── Render one slug ──────────────────────────────────────────────────────
function rasterize(svgPath: string, pngPath: string, w: number, h: number): void {
	execFileSync('rsvg-convert', ['-w', String(w), '-h', String(h), svgPath, '-o', pngPath]);
}

function renderSlug(slug: string, platforms: ('og' | 'hero')[]): { ok: boolean; errs: string[] } {
	const dir = join(MEDIA_DIR, slug);
	const briefPath = join(dir, 'brief.json');
	if (!existsSync(briefPath)) return { ok: false, errs: ['no brief.json'] };
	let brief: Brief;
	try {
		brief = JSON.parse(readFileSync(briefPath, 'utf8'));
	} catch (e) {
		return { ok: false, errs: [`bad JSON: ${(e as Error).message}`] };
	}
	const errs = validate(brief, slug);
	if (errs.length) return { ok: false, errs };
	brief.slug = slug;

	// One 1.91:1 design, rasterized at two resolutions:
	//   og   1200x630  -> static/og/<slug>.png    (list card + og:image / Twitter meta)
	//   hero 2400x1260 -> static/hero/<slug>.png   (in-post hero; reusable as X / LinkedIn article cover)
	const svg = renderSvg(brief, PROFILES.og);
	const svgPath = join(dir, 'og.svg');
	writeFileSync(svgPath, svg + '\n');
	if (platforms.includes('og')) {
		if (!existsSync(OG_OUT)) mkdirSync(OG_OUT, { recursive: true });
		rasterize(svgPath, join(OG_OUT, `${slug}.png`), 1200, 630);
	}
	if (platforms.includes('hero')) {
		if (!existsSync(HERO_OUT)) mkdirSync(HERO_OUT, { recursive: true });
		rasterize(svgPath, join(HERO_OUT, `${slug}.png`), 2400, 1260);
	}
	return { ok: true, errs: [] };
}

// ── CLI ──────────────────────────────────────────────────────────────────
function main() {
	const args = process.argv.slice(2);
	const slugArg = args.find((a) => a.startsWith('--slug='))?.split('=')[1];
	const platArg = args.find((a) => a.startsWith('--platforms='))?.split('=')[1];
	const checkOnly = args.includes('--check');
	const platforms = (platArg ? platArg.split(',') : ['og', 'hero']) as ('og' | 'hero')[];

	if (!existsSync(MEDIA_DIR)) {
		console.error(`No briefs dir: ${MEDIA_DIR}`);
		process.exit(1);
	}
	const slugs = slugArg
		? [slugArg]
		: readdirSync(MEDIA_DIR, { withFileTypes: true })
				.filter((d) => d.isDirectory() && existsSync(join(MEDIA_DIR, d.name, 'brief.json')))
				.map((d) => d.name)
				.sort();

	let ok = 0;
	const failed: { slug: string; errs: string[] }[] = [];
	for (const slug of slugs) {
		if (checkOnly) {
			const briefPath = join(MEDIA_DIR, slug, 'brief.json');
			try {
				const errs = validate(JSON.parse(readFileSync(briefPath, 'utf8')), slug);
				if (errs.length) failed.push({ slug, errs });
				else ok++;
			} catch (e) {
				failed.push({ slug, errs: [`bad JSON: ${(e as Error).message}`] });
			}
			continue;
		}
		const res = renderSlug(slug, platforms);
		if (res.ok) ok++;
		else failed.push({ slug, errs: res.errs });
	}

	console.log(
		`${checkOnly ? 'Checked' : 'Rendered'} ${ok}/${slugs.length} (${platforms.join('+')})`,
	);
	if (failed.length) {
		console.log(`\nFAILED ${failed.length}:`);
		failed.forEach((f) => console.log(`  ${f.slug}: ${f.errs.join('; ')}`));
		process.exit(1);
	}
}

main();
