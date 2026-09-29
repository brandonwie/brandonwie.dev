/**
 * Serve a built static site tree locally (`pnpm preview` serves next/build).
 *
 * Resolution order, the shape of a static export:
 *   exact file -> `${rel}.html` -> `${rel}/index.html` -> 404.html
 *
 *   node scripts/serve-build.mjs <build-dir> [port]
 *   node scripts/serve-build.mjs next/build 4173
 *
 * Also serves /__viewport?w=&h=&u= : a same-origin page holding one iframe at
 * an exact CSS pixel size, so responsive states can be checked in a browser
 * whose window cannot be resized.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const buildDir = process.argv[2];
const port = Number(process.argv[3] || 4173);

if (!buildDir || !existsSync(buildDir)) {
	console.error('usage: node scripts/serve-build.mjs <build-dir> [port]');
	process.exit(2);
}

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.xml': 'application/xml',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.wasm': 'application/wasm',
	'.txt': 'text/plain; charset=utf-8',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
};

/** Candidate order: exact file, `.html`, `/index.html`. */
function resolveStatic(dir, urlPath) {
	const clean = urlPath.split('?')[0].replace(/\/+$/, '') || '/';
	const rel = clean === '/' ? 'index.html' : clean.replace(/^\//, '');
	for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
		const full = join(dir, candidate);
		if (existsSync(full) && statSync(full).isFile()) return full;
	}
	return null;
}

function viewportPage(url) {
	const w = Number(url.searchParams.get('w') || 390);
	const h = Number(url.searchParams.get('h') || 844);
	const target = url.searchParams.get('u') || '/';
	const safe = target.replace(/"/g, '&quot;');
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>viewport ${w}x${h} — ${safe}</title>
<style>
  html,body{margin:0;padding:0;background:#000}
  #frame{width:${w}px;height:${h}px;border:0;display:block}
</style></head>
<body><iframe id="frame" src="${safe}"></iframe></body></html>`;
}

const server = createServer((req, res) => {
	const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
	if (url.pathname === '/__viewport') {
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		res.end(viewportPage(url));
		return;
	}
	if (url.pathname.startsWith('/__probe/')) {
		const name = url.pathname.slice('/__probe/'.length);
		const probe = join('scripts', 'capture', name);
		if (!/^[a-z-]+\.js$/.test(name) || !existsSync(probe)) {
			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('no such probe');
			return;
		}
		res.writeHead(200, { 'content-type': 'text/javascript' });
		res.end(readFileSync(probe));
		return;
	}

	const file = resolveStatic(buildDir, req.url ?? '/');
	if (file) {
		res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
		res.end(readFileSync(file));
		return;
	}
	const notFound = join(buildDir, '404.html');
	res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
	res.end(existsSync(notFound) ? readFileSync(notFound) : 'not found');
});

// Report the ADDRESS ACTUALLY BOUND, not the requested one. Passing 0 asks the
// OS for a free port, which avoids colliding with a server that still holds
// 4173 -- but the caller can only learn the choice from here.
server.listen(port, '127.0.0.1', () => {
	console.log(`serving ${buildDir} on http://127.0.0.1:${server.address().port}`);
});
