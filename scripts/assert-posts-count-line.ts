/**
 * B4 regression — the `/posts` count line's unfiltered label is translated.
 *
 * Production printed `// 167 · all` on `/ko/posts`: the label was a literal in
 * PostsListPage. It now reads `posts_count_all` through `postsListCopy`. This
 * reads the static export (`next/build`, so run `pnpm build:next` first):
 *
 *   PC-01  build/posts.html     count line ends `· all`
 *   PC-02  build/ko/posts.html  count line ends `· 전체` and never `· all`
 *
 * POSITIVE CONTROLS (always run): the same verdict is applied to doctored copies
 * of the built HTML — the Korean line reverted to `all` (the production bug) and
 * the English line swapped to `전체` — and each MUST be rejected. A verdict that
 * accepted either would pass on the bug it guards against.
 *
 * Exit 0 pass, 1 fail, 2 harness error (build missing or markup not found).
 *
 * Run: tsx scripts/assert-posts-count-line.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = 'next/build';
const COUNT_LINE = /<p class="pg-posts__count">([\s\S]*?)<\/p>/;

/** Visible text of the count line: React's `<!-- -->` separators and tags stripped. */
export function countLineText(html: string): string | null {
	const match = html.match(COUNT_LINE);
	if (!match) return null;
	return match[1]
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Null when the line carries `expected` as its label, else the reason it does not. */
export function countLineVerdict(html: string, expected: 'all' | '전체'): string | null {
	const text = countLineText(html);
	if (text === null) return 'no <p class="pg-posts__count"> in the page';
	if (!/^\/\/ \d+ · /.test(text)) return `unexpected count line shape: "${text}"`;
	if (!text.endsWith(`· ${expected}`)) return `"${text}" does not end with "· ${expected}"`;
	if (expected === '전체' && /· all\b/.test(text)) return `"${text}" still prints "· all"`;
	return null;
}

function main(): number {
	const enFile = join(BUILD, 'posts.html');
	const koFile = join(BUILD, 'ko', 'posts.html');
	for (const file of [enFile, koFile]) {
		if (!existsSync(file)) {
			console.error(`ERROR ${file} missing — run pnpm build:next first`);
			return 2;
		}
	}
	const en = readFileSync(enFile, 'utf8');
	const ko = readFileSync(koFile, 'utf8');
	if (countLineText(en) === null || countLineText(ko) === null) {
		console.error('ERROR count line markup not found; the selector no longer matches the page');
		return 2;
	}

	const rows: Array<{ id: string; ok: boolean; detail: string }> = [];
	const enProblem = countLineVerdict(en, 'all');
	rows.push({
		id: 'PC-01',
		ok: enProblem === null,
		detail: enProblem ?? `/posts count line: "${countLineText(en)}"`,
	});
	const koProblem = countLineVerdict(ko, '전체');
	rows.push({
		id: 'PC-02',
		ok: koProblem === null,
		detail: koProblem ?? `/ko/posts count line: "${countLineText(ko)}"`,
	});

	// Positive controls: the bug and its mirror must both be caught.
	const koReverted = ko.replace(COUNT_LINE, (line) => line.replace('전체', 'all'));
	const enSwapped = en.replace(COUNT_LINE, (line) => line.replace(/all(?=<\/p>)/, '전체'));
	const controls = [
		{
			id: 'PC-C1',
			what: '/ko/posts reverted to "· all" (the production bug)',
			changed: koReverted !== ko,
			caught: countLineVerdict(koReverted, '전체') !== null,
		},
		{
			id: 'PC-C2',
			what: '/posts printing "· 전체"',
			changed: enSwapped !== en,
			caught: countLineVerdict(enSwapped, 'all') !== null,
		},
	];
	for (const control of controls) {
		rows.push({
			id: control.id,
			ok: control.changed && control.caught,
			detail: control.changed
				? `${control.what}: ${control.caught ? 'rejected' : 'ACCEPTED — the check cannot fail'}`
				: `${control.what}: the doctoring did not change the page, control is vacuous`,
		});
	}

	for (const row of rows) console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.id}  ${row.detail}`);
	const passed = rows.filter((row) => row.ok).length;
	console.log(`\n${rows.length} rows: ${passed} passed`);
	return passed === rows.length ? 0 : 1;
}

process.exit(main());
