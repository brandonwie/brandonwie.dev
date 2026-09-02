/**
 * Fail-closed corpus test for the mdsvex replacement (plan.md Open Decision 6).
 *
 * Compiles AND renders every content file through the Next pipeline. Parsing
 * alone would not catch a node that survives remark but throws when React
 * renders it, which is the failure mode a component-producing pipeline
 * actually has.
 *
 * Fails closed on: any file that throws, a file count other than the expected
 * corpus size, a file that produces no content, and a mermaid fence that did
 * not become a component (which would mean the highlighter saw it first).
 *
 *   pnpm migration:corpus
 *
 * Exit 0 = every file compiled and rendered. Exit 1 = at least one did not.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { initializeMermaidOnce } from '../src/components/Mermaid';
import { articleJsonLd } from '../src/content/article-json-ld';
import { renderMarkdown } from '../src/markdown/pipeline';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CONTENT = join(REPO_ROOT, 'src/content/posts');
const EXPECTED_FILES = 334;

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (entry.endsWith('.md')) out.push(full);
	}
	return out;
}

interface Failure {
	file: string;
	reason: string;
}

const files = walk(CONTENT).sort();
const failures: Failure[] = [];
let withMermaid = 0;
let withHeadings = 0;
let totalReadingTime = 0;

for (const file of files) {
	const rel = relative(REPO_ROOT, file);
	const source = readFileSync(file, 'utf8');
	try {
		const rendered = await renderMarkdown(source);
		const html = renderToStaticMarkup(rendered.content);

		if (!html.trim()) {
			failures.push({ file: rel, reason: 'rendered to nothing' });
			continue;
		}
		if (rendered.readingTime < 1) {
			failures.push({ file: rel, reason: `readingTime ${rendered.readingTime} < 1` });
			continue;
		}
		// A mermaid fence must have become a component before the highlighter
		// ran. If one survived as a highlighted code block, ordering broke.
		if (/```mermaid/.test(source)) {
			if (!html.includes('data-mermaid')) {
				failures.push({ file: rel, reason: 'mermaid fence did not become a component' });
				continue;
			}
			withMermaid += 1;
		}
		if (/language-mermaid|lang="mermaid"/.test(html)) {
			failures.push({ file: rel, reason: 'mermaid reached the highlighter' });
			continue;
		}
		if (rendered.headings.length > 0) withHeadings += 1;
		totalReadingTime += rendered.readingTime;
	} catch (cause) {
		failures.push({ file: rel, reason: cause instanceof Error ? cause.message : String(cause) });
	}
}

console.log(`corpus: ${files.length} files`);
console.log(`  rendered ok        ${files.length - failures.length}`);
console.log(`  with mermaid       ${withMermaid}`);
console.log(`  with headings      ${withHeadings}`);
console.log(
	`  mean reading time  ${(totalReadingTime / Math.max(1, files.length)).toFixed(1)} min`,
);

if (files.length !== EXPECTED_FILES) {
	console.error(
		`\nFAIL: expected ${EXPECTED_FILES} files, walked ${files.length}. ` +
			`Update EXPECTED_FILES deliberately -- a silently shrinking corpus is how ` +
			`a passing run stops meaning anything.`,
	);
	process.exit(1);
}

if (failures.length > 0) {
	console.error(`\nFAIL: ${failures.length} file(s) did not compile and render:`);
	for (const f of failures.slice(0, 20)) console.error(`  ${f.file}\n    ${f.reason}`);
	if (failures.length > 20) console.error(`  ... and ${failures.length - 20} more`);
	process.exit(1);
}

const scriptBreakout = '</script><script>globalThis.__jsonLdControl = true</script>';
const jsonLdControlMeta = {
	title: scriptBreakout,
	description: 'JSON-LD script-text boundary control',
	date: new Date('2026-01-01T00:00:00.000Z'),
	updated: '2026-01-02',
	tags: ['security'],
	category: 'test',
};
const serializedJsonLd = articleJsonLd('json-ld-control', jsonLdControlMeta, 'en');
const parsedJsonLd = JSON.parse(serializedJsonLd) as Record<string, unknown>;
if (
	serializedJsonLd.includes('<') ||
	!serializedJsonLd.includes('\\u003c/script>') ||
	parsedJsonLd.headline !== scriptBreakout
) {
	console.error(
		'FAIL: JSON-LD must escape the HTML script-text boundary without changing its data',
	);
	process.exit(1);
}
console.log('  json-ld boundary   literal < escaped + semantic round-trip');

for (const [locale, expectedLanguage] of [
	['en', 'en-US'],
	['ko', 'ko-KR'],
] as const) {
	const localizedJsonLd = articleJsonLd('json-ld-locale-control', jsonLdControlMeta, locale);
	const localizedData = JSON.parse(localizedJsonLd) as Record<string, unknown>;
	if (localizedData.inLanguage !== expectedLanguage) {
		console.error(
			`FAIL: JSON-LD locale ${locale} must serialize inLanguage=${expectedLanguage}; received ${String(localizedData.inLanguage)}`,
		);
		process.exit(1);
	}
}
console.log('  json-ld locales    en-US + ko-KR');

const initializationFailure = new Error('mermaid initialization control');
const attemptedConfigs: unknown[] = [];
const fakeMermaid = {
	initialize(config: unknown): void {
		attemptedConfigs.push(config);
		if (attemptedConfigs.length === 1) throw initializationFailure;
	},
};
let failurePropagated = false;
try {
	initializeMermaidOnce(fakeMermaid);
} catch (cause) {
	failurePropagated = cause === initializationFailure;
}
initializeMermaidOnce(fakeMermaid);
initializeMermaidOnce(fakeMermaid);
const strictConfigOnly = attemptedConfigs.every((config) => {
	const record = config as Record<string, unknown>;
	return (
		record.startOnLoad === false && record.theme === 'dark' && record.securityLevel === 'strict'
	);
});
if (!failurePropagated || attemptedConfigs.length !== 2 || !strictConfigOnly) {
	console.error(
		'FAIL: Mermaid initialization must propagate failure, retry once, then preserve its strict config',
	);
	process.exit(1);
}
console.log('  mermaid init       one failed attempt + one successful initialization');

console.log('\nPASS: every content file compiled and rendered.');
