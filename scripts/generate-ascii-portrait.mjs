#!/usr/bin/env node
// Convert a PNG portrait to ASCII art for the About page hero.
//
// Output is the plain-text file src/lib/data/portrait.ascii.txt, which
// next/src/components/AboutPage.tsx reads at build time and renders in a <pre>.
//
// Why build time: the page then ships plain text. No image request, no canvas,
// and the portrait stays selectable and searchable.
//
// Regenerate the shipped file (macOS sips does the crop):
//
//   sips --cropToHeightWidth 410 373 --cropOffset 30 20 src/lib/data/portrait.png \
//     --out /tmp/portrait-crop.png
//   node scripts/generate-ascii-portrait.mjs /tmp/portrait-crop.png \
//     src/lib/data/portrait.ascii.txt --cols 96 --ramp blocks --contrast \
//     --contrast-scope all --knockout 0.85
//
// No dependencies: PNG is decoded with node:zlib. 8-bit, non-interlaced only
// (colour types 0/2/3/4/6) — which is what every export path produces. A JPEG
// source must be saved as PNG first; the script says so rather than guessing.
//
// Options:
//   --cols N          output width in characters (default 40)
//   --ramp NAME       ascii | fine | blocks (default ascii)
//   --invert          dense glyphs for dark pixels (a negative on this light-on-
//                     dark page; leave it off for a positive image)
//   --contrast        stretch the 1st..99th percentile of cell luminance to 0..1
//                     (foreground cells only when --knockout is set, unless
//                     --contrast-scope all)
//   --contrast-scope S  foreground (default) | all: which cells set the --contrast
//                     percentiles; all includes background cells' whole-cell
//                     luminance (they still print as spaces)
//   --knockout T      blank the border-connected background: flood-fill from edge
//                     pixels with luminance >= T (0..1], e.g. 0.88; cells more
//                     than half background print a space
//   --cell-ratio N    glyph advance / line height (default 0.6: JetBrains Mono
//                     advances 0.6em and the page sets line-height: 1)

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const RAMPS = {
	// 10 steps. Reads as a photograph at 40-64 columns.
	ascii: ' .:-=+*#%@',
	// 70 steps. Finer, needs 80+ columns to pay off.
	fine: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
	// 5 steps of block glyphs. Heaviest, most legible at small sizes.
	blocks: ' ░▒▓█',
};

function parseArgs(argv) {
	const [input, output, ...rest] = argv;
	if (!input || !output) {
		console.error(
			'usage: generate-ascii-portrait.mjs <input.png> <output.txt> [--cols N] [--ramp ascii|fine|blocks] [--invert] [--contrast] [--cell-ratio N] [--knockout T] [--contrast-scope foreground|all]',
		);
		process.exit(1);
	}
	const opts = {
		input,
		output,
		cols: 40,
		ramp: 'ascii',
		invert: false,
		contrast: false,
		cellRatio: 0.6,
		knockout: 0,
		contrastScope: 'foreground',
	};
	for (let i = 0; i < rest.length; i++) {
		if (rest[i] === '--cols') opts.cols = Number(rest[++i]);
		else if (rest[i] === '--ramp') opts.ramp = rest[++i];
		else if (rest[i] === '--invert') opts.invert = true;
		else if (rest[i] === '--contrast') opts.contrast = true;
		else if (rest[i] === '--cell-ratio') opts.cellRatio = Number(rest[++i]);
		else if (rest[i] === '--knockout') opts.knockout = Number(rest[++i]);
		else if (rest[i] === '--contrast-scope') opts.contrastScope = rest[++i];
		else {
			console.error(`unknown argument: ${rest[i]}`);
			process.exit(1);
		}
	}
	if (!Number.isInteger(opts.cols) || opts.cols < 8 || opts.cols > 400) {
		console.error('--cols must be an integer between 8 and 400');
		process.exit(1);
	}
	if (!Number.isFinite(opts.cellRatio) || opts.cellRatio <= 0 || opts.cellRatio > 4) {
		console.error('--cell-ratio must be a number greater than 0 and at most 4');
		process.exit(1);
	}
	if (opts.knockout !== 0 && !(opts.knockout > 0 && opts.knockout <= 1)) {
		console.error('--knockout must be a luminance threshold in (0, 1]');
		process.exit(1);
	}
	if (opts.contrastScope !== 'foreground' && opts.contrastScope !== 'all') {
		console.error('--contrast-scope must be foreground or all');
		process.exit(1);
	}
	if (!RAMPS[opts.ramp]) {
		console.error(`--ramp must be one of: ${Object.keys(RAMPS).join(', ')}`);
		process.exit(1);
	}
	return opts;
}

function decodePng(buf) {
	if (buf.readUInt32BE(0) !== 0x89504e47) {
		throw new Error('not a PNG. Export the photo as PNG first (JPEG is not supported).');
	}
	let pos = 8;
	let ihdr = null;
	let palette = null;
	const idat = [];
	while (pos < buf.length) {
		const len = buf.readUInt32BE(pos);
		const type = buf.toString('ascii', pos + 4, pos + 8);
		const data = buf.subarray(pos + 8, pos + 8 + len);
		if (type === 'IHDR') {
			ihdr = {
				width: data.readUInt32BE(0),
				height: data.readUInt32BE(4),
				depth: data[8],
				colorType: data[9],
				interlace: data[12],
			};
		} else if (type === 'PLTE') palette = Buffer.from(data);
		else if (type === 'IDAT') idat.push(Buffer.from(data));
		else if (type === 'IEND') break;
		pos += 12 + len;
	}
	if (!ihdr) throw new Error('PNG has no IHDR chunk');
	if (ihdr.depth !== 8) throw new Error(`unsupported bit depth ${ihdr.depth} (need 8)`);
	if (ihdr.interlace !== 0)
		throw new Error('interlaced PNG is not supported — re-export without Adam7');

	const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.colorType];
	if (!channels) throw new Error(`unsupported colour type ${ihdr.colorType}`);

	const raw = inflateSync(Buffer.concat(idat));
	const stride = ihdr.width * channels;
	const bpp = channels;
	const out = Buffer.alloc(stride * ihdr.height);

	let p = 0;
	for (let y = 0; y < ihdr.height; y++) {
		const filter = raw[p++];
		const line = raw.subarray(p, p + stride);
		p += stride;
		const cur = out.subarray(y * stride, (y + 1) * stride);
		const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
		for (let i = 0; i < stride; i++) {
			const a = i >= bpp ? cur[i - bpp] : 0;
			const b = prev ? prev[i] : 0;
			const c = prev && i >= bpp ? prev[i - bpp] : 0;
			let v = line[i];
			if (filter === 1) v += a;
			else if (filter === 2) v += b;
			else if (filter === 3) v += (a + b) >> 1;
			else if (filter === 4) {
				const pp = a + b - c;
				const pa = Math.abs(pp - a);
				const pb = Math.abs(pp - b);
				const pc = Math.abs(pp - c);
				v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			}
			cur[i] = v & 0xff;
		}
	}

	return { ...ihdr, channels, palette, pixels: out, stride };
}

// Luminance of one pixel, 0..1.
function lumAt(img, x, y) {
	const i = y * img.stride + x * img.channels;
	let r, g, b;
	if (img.colorType === 3) {
		const idx = img.pixels[i] * 3;
		[r, g, b] = [img.palette[idx], img.palette[idx + 1], img.palette[idx + 2]];
	} else if (img.colorType === 0 || img.colorType === 4) {
		r = g = b = img.pixels[i];
	} else {
		[r, g, b] = [img.pixels[i], img.pixels[i + 1], img.pixels[i + 2]];
	}
	return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Luminance at the given fraction of a sorted array (nearest rank).
function percentile(sorted, q) {
	const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
	return sorted[i];
}

// Mark the background: flood-fill (BFS, 4-connected) from every border pixel
// with luminance >= threshold through connected pixels that also pass it. Only
// light pixels reachable from the edge count, so bright skin enclosed by hair
// or the face outline survives.
function knockoutMask(img, threshold) {
	const { width: w, height: h } = img;
	const bg = new Uint8Array(w * h);
	const queue = new Int32Array(w * h);
	let head = 0;
	let tail = 0;
	const visit = (x, y) => {
		const i = y * w + x;
		if (bg[i] || lumAt(img, x, y) < threshold) return;
		bg[i] = 1;
		queue[tail++] = i;
	};
	for (let x = 0; x < w; x++) {
		visit(x, 0);
		visit(x, h - 1);
	}
	for (let y = 0; y < h; y++) {
		visit(0, y);
		visit(w - 1, y);
	}
	while (head < tail) {
		const i = queue[head++];
		const x = i % w;
		const y = (i - x) / w;
		if (x > 0) visit(x - 1, y);
		if (x < w - 1) visit(x + 1, y);
		if (y > 0) visit(x, y - 1);
		if (y < h - 1) visit(x, y + 1);
	}
	return bg;
}

// Box-average the source down to cols x rows, then map to the ramp.
// rows = cols * h / w * cellRatio: a glyph cell is cellRatio as wide as it is
// tall, so each row must cover proportionally more source height than a column.
// With a knockout mask, a cell that is more than half background prints a
// space; otherwise only its foreground pixels are averaged.
function toAscii(img, { cols, chars, invert, contrast, contrastScope, cellRatio, knockout }) {
	const rows = Math.max(1, Math.round(((cols * img.height) / img.width) * cellRatio));
	const cellW = img.width / cols;
	const cellH = img.height / rows;
	const bg = knockout ? knockoutMask(img, knockout) : null;
	// NaN marks a knocked-out (background) cell.
	const lums = new Float64Array(cols * rows);
	// Whole-cell mean, background included; feeds --contrast-scope all.
	const fullLums = new Float64Array(cols * rows);
	for (let ry = 0; ry < rows; ry++) {
		for (let rx = 0; rx < cols; rx++) {
			const x0 = Math.floor(rx * cellW);
			const x1 = Math.max(x0 + 1, Math.floor((rx + 1) * cellW));
			const y0 = Math.floor(ry * cellH);
			const y1 = Math.max(y0 + 1, Math.floor((ry + 1) * cellH));
			let sum = 0;
			let n = 0;
			let total = 0;
			let fullSum = 0;
			for (let y = y0; y < y1 && y < img.height; y++) {
				for (let x = x0; x < x1 && x < img.width; x++) {
					const l = lumAt(img, x, y);
					total++;
					fullSum += l;
					if (bg && bg[y * img.width + x]) continue;
					sum += l;
					n++;
				}
			}
			fullLums[ry * cols + rx] = total ? fullSum / total : 0;
			if (bg && n * 2 < total) lums[ry * cols + rx] = NaN;
			else lums[ry * cols + rx] = n ? sum / n : 0;
		}
	}

	// Stretch the 1st..99th percentile to the full range so a flat photo still
	// spans the whole ramp; the outer 1% on each side clamps. Scope 'foreground'
	// measures only non-background cells, which pushes skin to the top of the
	// ramp; 'all' measures every whole cell, background included, so the white
	// backdrop stays the brightest value and skin keeps mid-ramp detail.
	let lo = 0;
	let hi = 1;
	if (contrast) {
		const sorted =
			contrastScope === 'all'
				? Float64Array.from(fullLums).sort()
				: lums.filter((v) => !Number.isNaN(v)).sort();
		if (sorted.length) {
			lo = percentile(sorted, 0.01);
			hi = percentile(sorted, 0.99);
		}
		if (hi - lo < 1e-6) [lo, hi] = [0, 1];
	}

	const last = chars.length - 1;
	const lines = [];
	for (let ry = 0; ry < rows; ry++) {
		let line = '';
		for (let rx = 0; rx < cols; rx++) {
			const raw = lums[ry * cols + rx];
			if (Number.isNaN(raw)) {
				line += ' ';
				continue;
			}
			const lum = Math.min(1, Math.max(0, (raw - lo) / (hi - lo)));
			const v = invert ? 1 - lum : lum;
			line += chars.charAt(Math.round(v * last));
		}
		lines.push(line.replace(/\s+$/, ''));
	}
	return lines.join('\n');
}

const opts = parseArgs(process.argv.slice(2));
let img;
try {
	img = decodePng(readFileSync(opts.input));
} catch (err) {
	console.error(`${opts.input}: ${err.message}`);
	process.exit(1);
}

const art = toAscii(img, {
	cols: opts.cols,
	chars: RAMPS[opts.ramp],
	invert: opts.invert,
	contrast: opts.contrast,
	cellRatio: opts.cellRatio,
	knockout: opts.knockout,
	contrastScope: opts.contrastScope,
});
writeFileSync(opts.output, `${art}\n`, 'utf8');

const rows = art.split('\n').length;
console.log(
	`${opts.input} (${img.width}x${img.height}) -> ${opts.output}  ${opts.cols}x${rows}  ramp=${opts.ramp}${opts.invert ? ' inverted' : ''}${opts.contrast ? ' contrast' : ''}${opts.knockout ? ` knockout=${opts.knockout}` : ''}`,
);
console.log(
	"Check it in a monospace editor before committing. A flat source maps to a flat ramp and reads as noise — raise the photo's contrast and re-run.",
);
