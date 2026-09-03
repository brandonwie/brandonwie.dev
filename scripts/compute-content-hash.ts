#!/usr/bin/env -S deno run --allow-read --allow-env
/**
 * Compute the full SHA-256 hash of a 3B knowledge entry's cleaned body.
 *
 * Mirrors cleanBody() + computeContentHash() from sync-from-3b.ts:253-325.
 * Use when an expanded blog post's source_content_hash needs to be refreshed
 * after merging upstream content changes — sync:check prints only the first
 * 16 hex chars, which is not enough to write back to frontmatter.
 *
 * Usage:
 *   deno run --allow-read --allow-env scripts/compute-content-hash.ts --slug=<slug>
 *   deno run --allow-read --allow-env scripts/compute-content-hash.ts --path=<absolute-path>
 *
 * Examples:
 *   npm run hash -- --slug=ai-code-review-confusion-patterns
 *   npm run hash -- --path=/Users/brandonwie/dev/personal/3b/knowledge/ai-ml/foo.md
 *
 * Output: single line, 64-char hex hash followed by newline.
 *
 * IMPORTANT: If cleanBody() in sync-from-3b.ts changes, this file must be
 * updated in lockstep — otherwise the hash will diverge from what the sync
 * script writes for non-expanded posts.
 *
 * Deliberately uses only Deno built-ins (no jsr:@std/* imports) so that adding
 * this helper does not introduce new entries in deno.lock — the publish-time
 * commit must contain the helper without dragging in lockfile churn.
 */

// C3 (dual-runtime evidence): 3B moved from ~/dev/personal/3b to ~/dev/3b, so the
// legacy default no longer exists on a current machine. Honor THREEB_PATH, then
// fall back to the first existing root: ~/dev/3b, then the legacy path.
function resolveThreeBRoot(): string {
	const fromEnv = Deno.env.get('THREEB_PATH');
	if (fromEnv) return fromEnv;
	const home = Deno.env.get('HOME');
	const candidates = [`${home}/dev/3b`, `${home}/dev/personal/3b`];
	for (const candidate of candidates) {
		try {
			if (Deno.statSync(candidate).isDirectory) return candidate;
		} catch {
			/* not this one */
		}
	}
	return candidates[0];
}

const KNOWLEDGE_ROOT = `${resolveThreeBRoot()}/knowledge`;

/**
 * Mirror of isPlainParagraphLine() from sync-from-3b.ts:113-124.
 *
 * Tests the TRIMMED line, not the raw line: an indented list item or fenced
 * block must not be misread as prose.
 */
function isPlainParagraphLine(line: string): boolean {
	const trimmed = line.trim();
	return (
		trimmed.length > 0 &&
		!trimmed.startsWith('#') &&
		!trimmed.startsWith('```') &&
		!trimmed.startsWith('>') &&
		!trimmed.startsWith('-') &&
		!trimmed.startsWith('---')
	);
}

/**
 * Mirror of cleanBody() from sync-from-3b.ts:298-359. Strips:
 *   - the H1 title (already extracted to frontmatter.title)
 *   - the ENTIRE first paragraph after H1, including its wrapped continuation
 *     lines (already extracted to frontmatter.description)
 *   - "## Related" sections
 *   - "## When This Came Up" sections
 *   - leading horizontal rule
 *   - multiple blank-line runs (normalized to single blank lines)
 */
function cleanBody(body: string): string {
	let cleaned = body;
	cleaned = cleaned.replace(/^#\s+.+\n+/, '');

	const lines = cleaned.split('\n');
	let foundFirstParagraph = false;
	let skippingFirstParagraph = false;
	const filteredLines: string[] = [];

	for (const line of lines) {
		if (!foundFirstParagraph && line.trim() === '') {
			continue;
		}

		// Skip the whole first paragraph (description), including wrapped lines.
		if (!foundFirstParagraph && isPlainParagraphLine(line)) {
			foundFirstParagraph = true;
			skippingFirstParagraph = true;
			continue;
		}

		if (skippingFirstParagraph) {
			if (line.trim() === '') {
				skippingFirstParagraph = false;
				continue;
			}

			if (isPlainParagraphLine(line)) {
				continue;
			}

			skippingFirstParagraph = false;
		}

		if (foundFirstParagraph || line.trim() === '') {
			filteredLines.push(line);
		}
	}

	cleaned = filteredLines.join('\n');
	cleaned = cleaned.replace(/##\s*Related[\s\S]*?(?=##|$)/gi, '');
	cleaned = cleaned.replace(/##\s*When This Came Up[\s\S]*?(?=##|$)/gi, '');
	cleaned = cleaned.replace(/^[\s\n]*---[\s\n]+/, '');
	cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
	return cleaned.trim();
}

async function computeContentHash(cleanedBody: string): Promise<string> {
	const data = new TextEncoder().encode(cleanedBody);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function parseBody(content: string): string {
	const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) {
		throw new Error('No YAML frontmatter found in file.');
	}
	return match[2];
}

/**
 * Minimal recursive .md finder. Inlined to avoid pulling jsr:@std/fs into
 * deno.lock for this small helper.
 */
async function findSlug(root: string, target: string): Promise<string | null> {
	const stack: string[] = [root];
	while (stack.length > 0) {
		const dir = stack.pop()!;
		for await (const entry of Deno.readDir(dir)) {
			const full = `${dir}/${entry.name}`;
			if (entry.isDirectory) {
				stack.push(full);
			} else if (entry.isFile && entry.name === target) {
				return full;
			}
		}
	}
	return null;
}

/**
 * Minimal `--key=value` parser. Only supports the two flags this helper accepts,
 * so we do not need jsr:@std/cli.
 */
function parseFlags(args: string[]): { slug?: string; path?: string } {
	const out: { slug?: string; path?: string } = {};
	for (const a of args) {
		const m = a.match(/^--(slug|path)=(.+)$/);
		if (!m) continue;
		if (m[1] === 'slug') out.slug = m[2];
		if (m[1] === 'path') out.path = m[2];
	}
	return out;
}

async function main() {
	const { slug, path } = parseFlags(Deno.args);

	if (!slug && !path) {
		console.error('Usage: --slug=<slug> OR --path=<absolute-path>');
		Deno.exit(2);
	}

	let filePath: string;
	if (path) {
		filePath = path;
	} else {
		const found = await findSlug(KNOWLEDGE_ROOT, `${slug}.md`);
		if (!found) {
			console.error(`No file matching ${slug}.md under ${KNOWLEDGE_ROOT}`);
			Deno.exit(3);
		}
		filePath = found;
	}

	const content = await Deno.readTextFile(filePath);
	const body = parseBody(content);
	const cleaned = cleanBody(body);
	const hash = await computeContentHash(cleaned);

	console.log(hash);
}

await main();
