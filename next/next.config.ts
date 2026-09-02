import type { NextConfig } from 'next';

/**
 * C7 — adapter output contract.
 *
 * The SvelteKit build emits a fully static tree via adapter-static
 * (`pages: 'build'`, `assets: 'build'`, `fallback: '404.html'`,
 * `precompress: true`, `strict: true`). The Next candidate has to reproduce the
 * same shape:
 *
 *   output: 'export'   static export, no server runtime on Cloudflare Pages
 *   distDir: 'build'   same directory NAME, but inside this package -- Next
 *                      requires distDir to stay within the project root, so the
 *                      candidate tree is `next/build` and the comparator is
 *                      pointed at it explicitly
 *   trailingSlash      false, matching the URL contract proven by the spike
 *                      (366/366 baseline paths)
 *
 * `precompress` has no Next equivalent; that gap is tracked in plan.md
 * § Settled by the Step 1 spike, not silently absorbed here.
 */
const nextConfig: NextConfig = {
	output: 'export',
	distDir: 'build',
	trailingSlash: false,
	images: { unoptimized: true },
	experimental: {
		// Keeps one static 404 document while locale route groups own separate root layouts.
		// Revalidate this experimental API on every Next.js upgrade.
		globalNotFound: true,
	},
};

export default nextConfig;
