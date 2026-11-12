import type { NextConfig } from 'next';

/**
 * Static export for Cloudflare Pages: no server runtime.
 *
 *   output: 'export'   every route is rendered at build time
 *   distDir: 'build'   the export lands in `next/build` (Next keeps distDir
 *                      inside the package)
 *   trailingSlash      false: a page is `/x`, written as `x.html`
 */
const nextConfig: NextConfig = {
	output: 'export',
	distDir: 'build',
	trailingSlash: false,
	experimental: {
		// Keeps one static 404 document while locale route groups own separate root layouts.
		// Revalidate this experimental API on every Next.js upgrade.
		globalNotFound: true,
	},
};

export default nextConfig;
