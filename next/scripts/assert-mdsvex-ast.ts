/**
 * mdsvex's own parser, asked directly which posts it treats specially.
 *
 *   pnpm migration:ast
 *
 * Four review rounds each found one more construct mdsvex handles differently
 * from the typography preprocessor, and each fix was a better heuristic over
 * text: html nodes, then `svelte:*` elements, then a tag whose attributes hold a
 * `<`, then template directives. A reviewer then pointed at the obvious thing
 * none of those rounds used — mdsvex accepts `remarkPlugins`, so its OWN parsed
 * tree can be read, and the class stops being guessed.
 *
 * A post is refused when mdsvex parses ANY of `html`, `svelteBlock` or
 * `svelteTag` out of it. Those are exactly the node classes whose text mdsvex's
 * extensions make ineligible for smartypants, and the preprocessor would
 * educate them anyway.
 *
 * This does NOT replace the heuristics in `remark-smart-typography.ts`, and the
 * fixtures below say why: `<svelte:component this={a < b} />` produces no
 * special node at all — mdsvex leaves it as text and diverges later — so the
 * AST oracle cannot see it and the shape rules still can. The two are
 * complementary, and neither alone is the class.
 *
 * Test-only. mdsvex is a devDependency of the SvelteKit app; nothing in `next/`
 * imports it at build time, and this check leaves with it.
 *
 * Exit 0 = no post carries a special node. Exit 1 = at least one does, or the
 * fixtures stopped producing the classes this check exists to find. Exit 2 = it
 * could not run.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import matter from 'gray-matter';
import { compile } from 'mdsvex';

const CONTENT = fileURLToPath(new URL('../../src/content/posts/', import.meta.url));

/** Node classes mdsvex's extensions produce and smartypants never educates. */
export const SPECIAL_NODES = ['html', 'svelteBlock', 'svelteTag'] as const;

/**
 * Fixtures that MUST still produce each class.
 *
 * Without these the check passes trivially the day the hook stops firing — the
 * same vacuity failure the corpus and projection checks each guard against. One
 * fixture per class in `SPECIAL_NODES`, and a reviewer found the first version
 * short one: `svelteTag` was refused with nothing proving it could still be
 * recognised.
 */
const CLASS_FIXTURES: Array<{ source: string; expect: string }> = [
	{ source: '> <span>b</span> c -- d', expect: 'html' },
	{ source: '{#if x}a -- b{/if}', expect: 'svelteBlock' },
	{ source: '{@const y = "a -- b"}', expect: 'svelteBlock' },
	// `svelteTag` was in SPECIAL_NODES with no fixture and no control, which is
	// the same vacuity this list exists to prevent: the oracle would have gone on
	// refusing a class nothing proved it could still see. All four `svelte:*`
	// forms probed produce it.
	{ source: '<svelte:head><title>x -- y</title></svelte:head>', expect: 'svelteTag' },
	{ source: '<svelte:component this={X} />', expect: 'svelteTag' },
];

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (entry.endsWith('.md')) out.push(full);
	}
	return out;
}

/** Every node type mdsvex parses out of a source. */
export async function collectNodeTypes(source: string): Promise<Set<string>> {
	const seen = new Set<string>();
	const collect = () => (tree: unknown) => {
		const visit = (node: { type?: unknown; children?: unknown[] }): void => {
			seen.add(String(node.type));
			for (const child of (node.children ?? []) as Array<{ type?: unknown }>) visit(child);
		};
		visit(tree as { type?: unknown });
	};
	await compile(source, {
		remarkPlugins: [collect as never],
		smartypants: false,
		highlight: false as never,
	});
	return seen;
}

/** The special classes a source carries, if any. */
export async function specialNodesIn(source: string): Promise<string[]> {
	const types = await collectNodeTypes(source);
	return SPECIAL_NODES.filter((type) => types.has(type));
}

export async function runAstOracle(
	sources: Array<{ label: string; source: string }> | null = null,
	quiet = false,
): Promise<number> {
	const say = (...parts: unknown[]): void => {
		if (!quiet) console.log(...parts);
	};

	for (const { source, expect } of CLASS_FIXTURES) {
		const found = await specialNodesIn(source);
		if (!found.includes(expect)) {
			console.error(
				`FATAL: fixture ${JSON.stringify(source)} no longer produces a \`${expect}\` node; this check would pass on anything`,
			);
			return 2;
		}
	}

	const posts =
		sources ??
		walk(CONTENT).map((file) => ({
			label: relative(CONTENT, file),
			source: matter(readFileSync(file, 'utf8')).content,
		}));
	if (posts.length === 0) {
		console.error('FATAL: no sources reached the oracle');
		return 2;
	}

	const offenders: string[] = [];
	for (const { label, source } of posts) {
		const found = await specialNodesIn(source);
		if (found.length) offenders.push(`${label}: ${found.join(', ')}`);
	}

	say(`\n${posts.length} source(s) parsed by mdsvex; ${SPECIAL_NODES.join('/')} refused`);
	if (offenders.length) {
		for (const line of offenders) console.error(`SPECIAL NODE ${line}`);
		console.error(
			`RESULT: ${offenders.length}/${posts.length} source(s) carry markup whose typography mdsvex handles differently`,
		);
		return 1;
	}
	say(`RESULT: ${posts.length}/${posts.length} carry none`);
	return 0;
}

if (process.argv[1]?.endsWith('assert-mdsvex-ast.ts')) {
	process.exit(await runAstOracle());
}
