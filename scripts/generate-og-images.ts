/**
 * generate-og-images.ts
 *
 * Build-time script that generates 1200×630 OG images for every blog post.
 * Uses Satori (JSX → SVG) + @resvg/resvg-js (SVG → PNG).
 *
 * Usage:  npx tsx scripts/generate-og-images.ts
 *         npx tsx scripts/generate-og-images.ts --force   # regenerate all
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import matter from 'gray-matter';

// ── Config ──────────────────────────────────────────────────────────────
const ROOT = join(import.meta.dirname, '..');
const POSTS_DIR = join(ROOT, 'src/content/posts/en');
const OUT_DIR = join(ROOT, 'static/og');
const FONTS_DIR = join(ROOT, 'static/fonts');
const WIDTH = 1200;
const HEIGHT = 630;
const FORCE = process.argv.includes('--force');

// ── Terminal color palette (matches app.css) ────────────────────────────
const colors = {
	bg: '#1a1a1a',
	bgSecondary: '#2d2d2d',
	textPrimary: '#e5e5e5',
	textMuted: '#888888',
	accentOrange: '#da7756',
	accentYellow: '#e5c07b',
	border: '#404040',
};

// ── Load fonts ──────────────────────────────────────────────────────────
const fontRegular = readFileSync(join(FONTS_DIR, 'JetBrainsMono-Regular.ttf'));
const fontBold = readFileSync(join(FONTS_DIR, 'JetBrainsMono-Bold.ttf'));

// ── Collect all posts ───────────────────────────────────────────────────
interface PostMeta {
	title: string;
	category: string;
	slug: string;
}

function collectPosts(): PostMeta[] {
	const posts: PostMeta[] = [];
	const categories = readdirSync(POSTS_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);

	for (const category of categories) {
		const catDir = join(POSTS_DIR, category);
		const files = readdirSync(catDir).filter((f) => f.endsWith('.md'));
		for (const file of files) {
			const raw = readFileSync(join(catDir, file), 'utf-8');
			const { data } = matter(raw);
			if (data.draft) continue;
			posts.push({
				title: data.title || basename(file, '.md'),
				category,
				slug: basename(file, '.md'),
			});
		}
	}
	return posts;
}

// ── Truncate title to fit ───────────────────────────────────────────────
function truncateTitle(title: string, maxChars = 80): string {
	if (title.length <= maxChars) return title;
	return title.slice(0, title.lastIndexOf(' ', maxChars)) + '...';
}

// ── Generate OG image markup (Satori JSX-like) ─────────────────────────
function buildMarkup(post: PostMeta) {
	const title = truncateTitle(post.title);

	return {
		type: 'div',
		props: {
			style: {
				display: 'flex',
				flexDirection: 'column',
				width: '100%',
				height: '100%',
				backgroundColor: colors.bg,
				padding: '60px',
				fontFamily: 'JetBrains Mono',
			},
			children: [
				// Top bar — simulated terminal header
				{
					type: 'div',
					props: {
						style: {
							display: 'flex',
							alignItems: 'center',
							gap: '8px',
							marginBottom: '12px',
						},
						children: [
							// Traffic light dots
							...(['#ff5f57', '#febc2e', '#28c840'] as const).map((color) => ({
								type: 'div',
								props: {
									style: {
										width: '14px',
										height: '14px',
										borderRadius: '50%',
										backgroundColor: color,
									},
								},
							})),
							// Tab title
							{
								type: 'div',
								props: {
									style: {
										marginLeft: '16px',
										fontSize: '16px',
										color: colors.textMuted,
									},
									children: 'brandonwie.dev',
								},
							},
						],
					},
				},
				// Terminal body with border
				{
					type: 'div',
					props: {
						style: {
							display: 'flex',
							flexDirection: 'column',
							flex: 1,
							border: `1px solid ${colors.border}`,
							borderRadius: '8px',
							padding: '48px',
							backgroundColor: colors.bgSecondary,
							justifyContent: 'center',
						},
						children: [
							// Category badge
							{
								type: 'div',
								props: {
									style: {
										display: 'flex',
										marginBottom: '24px',
									},
									children: [
										{
											type: 'div',
											props: {
												style: {
													fontSize: '18px',
													color: colors.accentYellow,
													backgroundColor: 'rgba(229, 192, 123, 0.15)',
													padding: '4px 12px',
													borderRadius: '4px',
												},
												children: post.category,
											},
										},
									],
								},
							},
							// Title
							{
								type: 'div',
								props: {
									style: {
										fontSize: title.length > 50 ? '36px' : '44px',
										fontWeight: 700,
										color: colors.textPrimary,
										lineHeight: 1.3,
										letterSpacing: '-0.02em',
									},
									children: title,
								},
							},
							// Bottom prompt line
							{
								type: 'div',
								props: {
									style: {
										display: 'flex',
										alignItems: 'center',
										marginTop: 'auto',
										paddingTop: '32px',
										gap: '8px',
										fontSize: '18px',
									},
									children: [
										{
											type: 'span',
											props: {
												style: { color: colors.accentOrange },
												children: 'visitor@brandonwie.dev',
											},
										},
										{
											type: 'span',
											props: {
												style: { color: colors.textMuted },
												children: ':~$',
											},
										},
										{
											type: 'span',
											props: {
												style: { color: colors.textPrimary },
												children: `cat ${post.slug}`,
											},
										},
										// Block cursor (static in image)
										{
											type: 'div',
											props: {
												style: {
													width: '10px',
													height: '20px',
													backgroundColor: colors.accentOrange,
													marginLeft: '2px',
												},
											},
										},
									],
								},
							},
						],
					},
				},
			],
		},
	};
}

// ── Build default OG image for homepage ─────────────────────────────────
function buildDefaultMarkup() {
	return {
		type: 'div',
		props: {
			style: {
				display: 'flex',
				flexDirection: 'column',
				width: '100%',
				height: '100%',
				backgroundColor: colors.bg,
				padding: '60px',
				fontFamily: 'JetBrains Mono',
			},
			children: [
				// Top bar
				{
					type: 'div',
					props: {
						style: {
							display: 'flex',
							alignItems: 'center',
							gap: '8px',
							marginBottom: '12px',
						},
						children: [
							...(['#ff5f57', '#febc2e', '#28c840'] as const).map((color) => ({
								type: 'div',
								props: {
									style: {
										width: '14px',
										height: '14px',
										borderRadius: '50%',
										backgroundColor: color,
									},
								},
							})),
							{
								type: 'div',
								props: {
									style: {
										marginLeft: '16px',
										fontSize: '16px',
										color: colors.textMuted,
									},
									children: 'brandonwie.dev',
								},
							},
						],
					},
				},
				// Body
				{
					type: 'div',
					props: {
						style: {
							display: 'flex',
							flexDirection: 'column',
							flex: 1,
							border: `1px solid ${colors.border}`,
							borderRadius: '8px',
							padding: '48px',
							backgroundColor: colors.bgSecondary,
							justifyContent: 'center',
							alignItems: 'center',
						},
						children: [
							{
								type: 'div',
								props: {
									style: {
										fontSize: '56px',
										fontWeight: 700,
										color: colors.textPrimary,
										marginBottom: '16px',
									},
									children: 'Brandon Wie',
								},
							},
							{
								type: 'div',
								props: {
									style: {
										fontSize: '24px',
										color: colors.accentOrange,
									},
									children: 'Software Engineer',
								},
							},
							{
								type: 'div',
								props: {
									style: {
										fontSize: '18px',
										color: colors.textMuted,
										marginTop: '24px',
									},
									children: 'Engineering insights, tutorials, and learnings',
								},
							},
						],
					},
				},
			],
		},
	};
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
	mkdirSync(OUT_DIR, { recursive: true });

	const posts = collectPosts();
	let generated = 0;
	let skipped = 0;

	const satoriFonts = [
		{
			name: 'JetBrains Mono',
			data: fontRegular,
			weight: 400 as const,
			style: 'normal' as const,
		},
		{
			name: 'JetBrains Mono',
			data: fontBold,
			weight: 700 as const,
			style: 'normal' as const,
		},
	];

	// Generate default OG image
	const defaultPath = join(OUT_DIR, 'default.png');
	if (FORCE || !existsSync(defaultPath)) {
		const svg = await satori(buildDefaultMarkup() as any, {
			width: WIDTH,
			height: HEIGHT,
			fonts: satoriFonts,
		});
		const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } });
		writeFileSync(defaultPath, resvg.render().asPng());
		generated++;
		console.log(`  ✓ default.png`);
	} else {
		skipped++;
	}

	// Generate per-post OG images
	for (const post of posts) {
		const outPath = join(OUT_DIR, `${post.slug}.png`);
		if (!FORCE && existsSync(outPath)) {
			skipped++;
			continue;
		}

		const markup = buildMarkup(post);
		const svg = await satori(markup as any, {
			width: WIDTH,
			height: HEIGHT,
			fonts: satoriFonts,
		});

		const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } });
		const png = resvg.render().asPng();
		writeFileSync(outPath, png);
		generated++;
		console.log(`  ✓ ${post.slug}.png`);
	}

	console.log(
		`\nOG images: ${generated} generated, ${skipped} skipped (${posts.length + 1} total)`,
	);
}

main().catch((err) => {
	console.error('OG image generation failed:', err);
	process.exit(1);
});
