/**
 * Contract C13 — document shell and locale `lang` attribute: executable assertions.
 *
 *   pnpm migration:c13                  # asserts next/build against the frozen baseline
 *   pnpm migration:c13 <dir> <baseline>
 *
 * plan.md AC11 requires C13 to close on a ROW-PER-ELEMENT assertion table, not
 * a two-item check, "because an earlier revision closed C13 on `lang` plus the
 * preload decision alone, which would have let every other shell element
 * disappear while the contract passed". This file is that table, executed.
 *
 * It does NOT parse HTML itself. Both sides are read through
 * `migration-verify.ts`'s own `capture()`, so a shell element this script sees
 * is the shell element the parity comparator sees; there is no second parser to
 * drift. Importing the module is safe: its CLI is guarded on `process.argv[1]`.
 *
 * Three exit codes, and the difference between them matters:
 *
 *   0   every row that CAN be asserted at the candidate's current coverage
 *       passes, and every row that cannot is printed as PENDING with the exact
 *       reason and the coverage it still needs
 *   1   at least one row FAILED, or a PENDING row lost its stated reason
 *   2   the script could not run at all (missing build, missing baseline)
 *
 * Exit 0 therefore means "no shell regression in what exists", never "C13 is
 * discharged". The contract's status lives in
 * `3b/projects/brandonwie.dev/actives/nextjs-migration/verification/contracts/C13-document-shell.md`
 * and is OPEN until the candidate serves all 366 routes.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { capture, captureStatuses, compare, loadLedger } from './migration-verify.ts';
import type { Baseline } from './migration-verify.ts';

/** The comparator's closed, difference-bound exception ledger (see migration-verify.ts). */
const DEFAULT_LEDGER = 'verification/exception-ledger.json';

type Status = 'PASS' | 'FAIL' | 'PENDING';

interface Row {
	row: string;
	status: Status;
	detail: string;
}

const rows: Row[] = [];
const pass = (row: string, detail: string): void => void rows.push({ row, status: 'PASS', detail });
const fail = (row: string, detail: string): void => void rows.push({ row, status: 'FAIL', detail });
const pending = (row: string, detail: string): void =>
	void rows.push({ row, status: 'PENDING', detail });

/** `/ko` and everything under it is Korean; every other route is English. */
const localeOf = (url: string): 'en' | 'ko' =>
	url === '/ko' || url.startsWith('/ko/') ? 'ko' : 'en';

/**
 * `extractFields()` reads attributes as raw serialized text, so an href that a
 * browser parses identically can still differ as a string. SvelteKit copied
 * `app.html`'s `&` through verbatim; React escapes the same character to
 * `&amp;`. Both are the same URL after HTML parsing, and C13 is a contract
 * about the document, not about its serialization — so shell keys are compared
 * decoded here. The raw difference is real for the comparator and is reported
 * in the DIAGNOSTIC block rather than hidden.
 */
const decodeEntities = (value: string): string =>
	value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0*39;/g, "'")
		.replace(/&amp;/g, '&');

/** A page's shell with every key entity-decoded. Later keys never collide in practice. */
const decodedShell = (shell: Record<string, string>): Record<string, string> =>
	Object.fromEntries(Object.entries(shell).map(([key, value]) => [decodeEntities(key), value]));

/**
 * The single value a shell field holds across every baseline page, or null when
 * the baseline itself disagrees. A field that is not constant in the baseline
 * cannot be asserted as a constant in the candidate, and saying so is the point.
 */
function baselineConstant(
	pages: Record<string, { shell: Record<string, string> }>,
	key: string,
): { value: string | null; pagesWith: number; total: number; distinct: string[] } {
	const seen = new Map<string, number>();
	let pagesWith = 0;
	for (const url of Object.keys(pages)) {
		const value = decodedShell(pages[url].shell)[key];
		if (value === undefined) continue;
		pagesWith += 1;
		seen.set(value, (seen.get(value) ?? 0) + 1);
	}
	const distinct = [...seen.keys()];
	return {
		value: distinct.length === 1 ? distinct[0] : null,
		pagesWith,
		total: Object.keys(pages).length,
		distinct,
	};
}

/** Every candidate page carries `key` with `expected`, or the row fails naming the offenders. */
function assertOnEveryCandidatePage(
	row: string,
	pages: Record<string, { shell: Record<string, string> }>,
	key: string,
	expected: string,
	note: string,
): void {
	const offenders: string[] = [];
	for (const url of Object.keys(pages)) {
		const value = decodedShell(pages[url].shell)[key];
		if (value !== expected)
			offenders.push(`${url} => ${value === undefined ? 'ABSENT' : JSON.stringify(value)}`);
	}
	const total = Object.keys(pages).length;
	if (offenders.length) {
		fail(
			row,
			`${offenders.length}/${total} candidate page(s) wrong: ${offenders.slice(0, 5).join('; ')}`,
		);
		return;
	}
	pass(
		row,
		`${total}/${total} candidate pages carry ${key} = ${JSON.stringify(expected)} — ${note}`,
	);
}

/**
 * Run the C13 row table against one candidate tree.
 *
 * Exported so `assert-c13-shell-controls.ts` can drive it over deliberately
 * broken copies of the build. A check that has never been observed to fail is
 * not evidence, and this contract's whole reason for existing is that a shell
 * element can vanish without anything turning red.
 */
export async function runAssertions(
	candidateDir: string,
	baselineFile: string,
	quiet = false,
	ledgerFile = DEFAULT_LEDGER,
): Promise<number> {
	rows.length = 0;
	const say = (...parts: unknown[]): void => {
		if (!quiet) console.log(...parts);
	};

	if (!existsSync(candidateDir)) {
		console.error(
			`FATAL: candidate build not found: ${candidateDir} — run \`pnpm build:next\` first`,
		);
		return 2;
	}
	if (!existsSync(baselineFile)) {
		console.error(`FATAL: baseline not found: ${baselineFile}`);
		return 2;
	}

	const baseline = JSON.parse(await readFile(baselineFile, 'utf8'));
	const candidate = await capture(candidateDir);
	const basePages = baseline.pages as Record<
		string,
		{ lang: string | null; shell: Record<string, string> }
	>;
	const candPages = candidate.pages as unknown as Record<
		string,
		{ lang: string | null; shell: Record<string, string> }
	>;
	const baseCount = Object.keys(basePages).length;
	const candCount = Object.keys(candPages).length;

	say(
		`C13 document shell — candidate ${candidateDir} (${candCount} pages) vs baseline ${baselineFile} (${baseCount} pages)\n`,
	);

	// --- Row 1: <html lang> ------------------------------------------------
	// The contract asks for `ko` on every KO page and `en` on the rest,
	// enumerated. Enumerate the candidate; the baseline's own answer is
	// reported alongside because it is not what the contract assumed.
	{
		const wrong = Object.keys(candPages).filter((url) => candPages[url].lang !== localeOf(url));
		const baseWrong = Object.keys(basePages).filter((url) => basePages[url].lang !== localeOf(url));
		if (wrong.length) {
			fail(
				'html lang',
				`${wrong.length}/${candCount} candidate page(s) disagree with their URL locale: ${wrong.slice(0, 8).join(', ')}`,
			);
		} else if (candCount < baseCount) {
			pending(
				'html lang',
				`${candCount}/${candCount} built pages correct; the contract enumerates ${baseCount} ` +
					`(${Object.keys(basePages).filter((u) => localeOf(u) === 'ko').length} KO / ` +
					`${Object.keys(basePages).filter((u) => localeOf(u) === 'en').length} EN). ` +
					`Blocked on route coverage, not on the mechanism.`,
			);
		} else {
			pass('html lang', `${candCount}/${candCount} pages match their URL locale`);
		}
		if (baseWrong.length) {
			say(
				`  NOTE the baseline itself has ${baseWrong.length} page(s) whose lang contradicts its URL: ` +
					`${baseWrong.join(', ')}. Porting them faithfully and fixing them are different outcomes; ` +
					`see the C13 contract § Seven KO pages that ship lang="en".`,
			);
		}
	}

	// --- Rows 2-8: constant shell elements ---------------------------------
	// Each expectation is READ FROM THE BASELINE rather than written here, so a
	// value this file gets wrong cannot silently become the standard.
	const constants: Array<{ row: string; key: string; note: string }> = [
		{ row: 'charset', key: 'charset', note: 'Next emits it automatically' },
		{ row: 'viewport meta', key: 'meta:viewport', note: 'from `export const viewport`' },
		{ row: 'color-scheme meta', key: 'meta:color-scheme', note: 'viewport.colorScheme' },
		{ row: 'theme-color meta', key: 'meta:theme-color', note: 'viewport.themeColor, exact value' },
		{
			row: 'preconnect googleapis',
			key: 'link:preconnect:https://fonts.googleapis.com',
			note: 'Google Fonts link kept, so hints are required',
		},
		{
			row: 'preconnect gstatic',
			key: 'link:preconnect:https://fonts.gstatic.com',
			note: 'Google Fonts link kept, so hints are required',
		},
		{
			row: 'font loading',
			key:
				'link:stylesheet:https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700' +
				'&family=Space+Grotesk:wght@400;500;600;700&display=swap',
			note: 'JetBrains Mono + Space Grotesk at 400/500/600/700; mechanism = Google Fonts link, not next/font',
		},
	];
	for (const { row, key, note } of constants) {
		const b = baselineConstant(basePages, key);
		if (b.value === null) {
			fail(
				row,
				`baseline is not constant for ${key}: ${b.distinct.length} distinct value(s), ${b.pagesWith}/${b.total} pages carry it`,
			);
			continue;
		}
		if (b.pagesWith !== b.total) {
			fail(
				row,
				`baseline carries ${key} on only ${b.pagesWith}/${b.total} pages — the element is not universal, so a universal assertion would be false`,
			);
			continue;
		}
		assertOnEveryCandidatePage(row, candPages, key, b.value, note);
	}

	// --- Rows 9-10: favicon and manifest -----------------------------------
	// These are asserted on the candidate's own terms and NOT against the
	// baseline key, because the baseline key encodes a relative href that
	// varies with route depth. See the DIAGNOSTIC block below.
	for (const [row, key, expectedType] of [
		['favicon link', 'link:icon:/favicon.svg', 'image/svg+xml'],
		['manifest link', 'link:manifest:/site.webmanifest', ''],
	] as const) {
		assertOnEveryCandidatePage(
			row,
			candPages,
			key,
			expectedType,
			'absolute href; baseline href is route-relative, see DIAGNOSTIC',
		);
	}

	// Resolution: served, not inferred. plan.md § C12 requires fetching asset
	// URLs rather than diffing the tags that contain them, and the same reason
	// applies here — a link tag proves nothing about the file behind it.
	{
		const statuses = await captureStatuses(candidateDir, [
			'/favicon.svg',
			'/site.webmanifest',
			'/no-such-shell-asset.svg',
		]);
		const guard = statuses['/no-such-shell-asset.svg'];
		if (guard !== 404) {
			fail(
				'asset resolution',
				`the miss control returned ${guard}, not 404 — a server that answers everything proves nothing`,
			);
		} else {
			for (const [row, url] of [
				['favicon resolves', '/favicon.svg'],
				['manifest resolves', '/site.webmanifest'],
			] as const) {
				if (statuses[url] === 200) pass(row, `GET ${url} -> 200 (miss control -> 404)`);
				else fail(row, `GET ${url} -> ${statuses[url]}, expected 200`);
			}
		}
	}

	// --- Row 11: head/body integration -------------------------------------
	{
		const problems: string[] = [];
		for (const url of Object.keys(candPages)) {
			const shell = candPages[url].shell;
			if (shell.charset === undefined) problems.push(`${url} has no <head> charset`);
			for (const key of Object.keys(shell)) {
				if (key.includes('%sveltekit'))
					problems.push(`${url} leaked a SvelteKit placeholder: ${key}`);
			}
		}
		if (problems.length) fail('head/body integration', problems.slice(0, 5).join('; '));
		else
			pass(
				'head/body integration',
				`${candCount}/${candCount} pages: head populated by the Metadata API, body carries children directly. ` +
					`SvelteKit's <div style="display: contents"> wrapper is dropped — display:contents removes the box ` +
					`from layout and the accessibility tree, so document structure is unchanged.`,
			);
	}

	// --- Row 12: data-sveltekit-preload-data -------------------------------
	{
		const leaked = Object.keys(candPages).filter(
			(url) => candPages[url].shell['body:preload-data'] !== undefined,
		);
		const inBaseline = Object.keys(basePages).filter(
			(url) => basePages[url].shell['body:preload-data'] !== undefined,
		).length;
		if (leaked.length) {
			fail(
				'preload-data decision',
				`${leaked.length} candidate page(s) carry a SvelteKit-only body attribute`,
			);
		} else {
			// The decision is only "covered" if the ledger says so for THESE routes
			// at THEIR current fingerprints. Round 9 (PR #34) found this row
			// asserting coverage without reading the ledger: two new routes had
			// dropped the attribute with no approval and the row still passed.
			// Coverage is now computed from the comparator's own diff + fingerprint
			// and the same ledger loader the comparator uses, so a route without a
			// fingerprint-bound approval fails here before it fails there.
			const shellDiffs = compare(baseline as Baseline, candidate).filter(
				(d) => d.field === 'shell' && candPages[d.url] !== undefined,
			);
			const ledger = loadLedger(ledgerFile);
			const uncovered = shellDiffs
				.filter(
					(d) =>
						!ledger.some(
							(e) => e.url === d.url && e.field === 'shell' && e.fingerprint === d.fingerprint,
						),
				)
				.map((d) => `${d.url} (fingerprint ${d.fingerprint})`);
			if (uncovered.length) {
				fail(
					'preload-data decision',
					`dropped on ${candCount}/${candCount} candidate pages, but ${uncovered.length} route(s) have no ` +
						`fingerprint-bound approval in ${ledgerFile}: ${uncovered.join('; ')}. ` +
						`Approve that route's shell difference (copy the fingerprint the comparator prints into the ledger) or make its shell match the baseline; this row gates on ANY unapproved shell difference, not only the preload-data attribute.`,
				);
			} else {
				pass(
					'preload-data decision',
					`dropped on ${candCount}/${candCount} candidate pages; present on ${inBaseline}/${baseCount} baseline pages. ` +
						`Recorded decision: native anchors perform no speculative prefetch in this slice. ` +
						`Every candidate route's shell difference (${shellDiffs.length}) is approved at its current ` +
						`fingerprint in ${ledgerFile} (${ledger.length} entries); C13 remains open on full route coverage.`,
				);
			}
		}
	}

	// --- DIAGNOSTIC: the baseline's route-relative asset hrefs --------------
	// Not a C13 row. It is the reason two C13 rows cannot be closed by the
	// comparator, and it is printed every run so it cannot be forgotten.
	{
		const forms = new Map<string, number>();
		let appStylesheetEntries = 0;
		let pagesWithAppStylesheets = 0;
		for (const url of Object.keys(basePages)) {
			const keys = Object.keys(basePages[url].shell);
			for (const key of keys) {
				if (key.startsWith('link:icon:')) {
					const href = key.slice('link:icon:'.length);
					forms.set(href, (forms.get(href) ?? 0) + 1);
				}
			}
			const app = keys.filter((k) => k.startsWith('link:stylesheet:') && k.includes('_app/'));
			if (app.length) {
				pagesWithAppStylesheets += 1;
				appStylesheetEntries += app.length;
			}
		}
		say(
			'\nDIAGNOSTIC — baseline shell hrefs are route-relative, and the comparator records them verbatim:',
		);
		for (const [href, count] of [...forms].sort((a, b) => b[1] - a[1])) {
			say(`  link:icon:${href}  ${count} page(s)`);
		}
		say(
			`  ${pagesWithAppStylesheets}/${baseCount} baseline pages also record ${appStylesheetEntries} SvelteKit bundle ` +
				`stylesheet entries, because extractFields() skips \`/_app/\` but not \`./_app/\`, \`../_app/\` or \`../../_app/\`.`,
		);
		say(
			'  All of these denote the same resources the candidate links absolutely. Closing the favicon and manifest\n' +
				'  rows through the comparator needs the shell href normalized against the page URL; that is a harness\n' +
				'  change with its own negative controls, and it is NOT made by this milestone.',
		);

		// Same class of finding, two more instances, both candidate-side.
		const escaped: string[] = [];
		const nextBundle = new Set<string>();
		for (const url of Object.keys(candPages)) {
			for (const key of Object.keys(candPages[url].shell)) {
				if (key.includes('&amp;')) escaped.push(`${url} ${key}`);
				if (key.startsWith('link:stylesheet:/_next/'))
					nextBundle.add(key.slice('link:stylesheet:'.length));
			}
		}
		say(
			`\n  Two more shell keys the comparator will report as differences, both semantically identical to the baseline:\n` +
				`  1. entity escaping — ${escaped.length}/${candCount} candidate page(s) serialize the font href with \`&amp;\`;\n` +
				`     SvelteKit copied \`app.html\`'s raw \`&\` through. Same URL after parsing.\n` +
				`  2. bundle stylesheet — the candidate links ${nextBundle.size} \`/_next/\` stylesheet(s) ` +
				`(${[...nextBundle].join(', ') || 'none'});\n` +
				`     these are the exact analogue of the \`/_app/\` hrefs extractFields() already skips.`,
		);
	}

	// --- report ------------------------------------------------------------
	const width = Math.max(...rows.map((r) => r.row.length));
	say('\nROW TABLE');
	for (const { row, status, detail } of rows) {
		say(`  ${status.padEnd(7)} ${row.padEnd(width)}  ${detail}`);
	}
	const failed = rows.filter((r) => r.status === 'FAIL');
	const pendingRows = rows.filter((r) => r.status === 'PENDING');
	const missingReason = pendingRows.filter((r) => !r.detail.trim());
	say(
		`\nRESULT: ${rows.filter((r) => r.status === 'PASS').length} pass, ${failed.length} fail, ${pendingRows.length} pending`,
	);
	if (failed.length || missingReason.length) return 1;
	say(
		'C13 is OPEN, not discharged: exit 0 means no shell regression in what the candidate builds today.',
	);
	return 0;
}

if (process.argv[1]?.endsWith('assert-c13-shell.ts')) {
	runAssertions(
		process.argv[2] ?? 'next/build',
		process.argv[3] ?? 'verification/baseline/svelte-e23e808.json',
		false,
		process.argv[4] ?? DEFAULT_LEDGER,
	).then((code) => process.exit(code));
}
