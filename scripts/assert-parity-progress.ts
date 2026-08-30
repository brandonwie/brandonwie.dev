/**
 * Judges `migration:verify:next` instead of ignoring it.
 *
 *   pnpm migration:parity:progress
 *
 * WHY THIS EXISTS
 *
 * The Next comparator exits 1 by design until the surface port closes parity,
 * so CI ran it under `continue-on-error: true`. A reviewer pointed out what that
 * actually buys: `continue-on-error` suppresses the exit code, and the
 * comparator uses ONE code for two unrelated things. Exit 1 means "unapproved
 * differences" — the expected progress state — but ALSO "the exception ledger is
 * malformed" and "a ledger entry is stale", which is a harness that has drifted
 * from reality. Exit 2 means the build directory is missing, i.e. the check
 * never ran at all. Under `continue-on-error` all three are green.
 *
 * That is the same shape as every other defect this lane has found: the check
 * reported success because it stopped looking. So the exit code is not
 * swallowed — it is JUDGED. Expected drift passes and is reported as a number;
 * anything that means the harness itself is broken fails.
 *
 * `judge()` is a pure function of (exit code, output) so the controls can drive
 * every branch without a 60-second build.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** `RESULT: N unapproved difference(s), M stale ledger entry(ies)` */
const RESULT_RE = /^RESULT: (\d+) unapproved difference\(s\), (\d+) stale ledger entry\(ies\)$/m;
/** `PARITY: N pages, M site artifacts, K approved exception(s), 0 unapproved differences` */
const PARITY_RE = /^PARITY: (\d+) pages, /m;
const FATAL_RE = /^FATAL: .*/m;
const STALE_RE = /^STALE LEDGER ENTRY /m;

export interface Judgment {
	ok: boolean;
	reason: string;
	unapproved: number | null;
	stale: number | null;
}

export function judge(exitCode: number, output: string): Judgment {
	const fatal = FATAL_RE.exec(output);
	if (fatal) {
		return {
			ok: false,
			reason: `the comparator reported ${fatal[0]}`,
			unapproved: null,
			stale: null,
		};
	}
	if (exitCode !== 0 && exitCode !== 1) {
		return {
			ok: false,
			reason: `exit ${exitCode} is not a comparison result; the check did not run`,
			unapproved: null,
			stale: null,
		};
	}
	if (exitCode === 0) {
		if (!PARITY_RE.test(output)) {
			return {
				ok: false,
				reason: 'exit 0 with no PARITY line; the comparator did not reach a verdict',
				unapproved: null,
				stale: null,
			};
		}
		return {
			ok: true,
			reason: 'parity reached — 0 unapproved differences',
			unapproved: 0,
			stale: 0,
		};
	}
	const result = RESULT_RE.exec(output);
	if (!result) {
		return {
			ok: false,
			reason: 'exit 1 with no RESULT line; the comparator failed before it could compare',
			unapproved: null,
			stale: null,
		};
	}
	const unapproved = Number(result[1]);
	const stale = Number(result[2]);
	// A stale entry means the ledger approves a difference that no longer
	// exists. That is a ledger drifted from reality, not migration progress, and
	// it is exactly what the report-only step used to hide.
	if (stale > 0 || STALE_RE.test(output)) {
		return {
			ok: false,
			reason: `${stale} stale ledger entry(ies); the ledger has drifted from reality`,
			unapproved,
			stale,
		};
	}
	if (unapproved === 0) {
		return {
			ok: false,
			reason: 'exit 1 with 0 unapproved and 0 stale; the result contradicts the exit code',
			unapproved,
			stale,
		};
	}
	return {
		ok: true,
		reason: `expected progress state — ${unapproved} unapproved difference(s), 0 stale`,
		unapproved,
		stale,
	};
}

export interface Run {
	status: number;
	output: string;
}

function runComparator(): Run {
	const run = spawnSync('corepack', ['pnpm', 'run', 'migration:verify:next'], {
		cwd: REPO_ROOT,
		encoding: 'utf8',
	});
	return { status: run.status ?? 2, output: `${run.stdout ?? ''}${run.stderr ?? ''}` };
}

/**
 * The runner is injectable so a control can prove the EXIT CODE follows the
 * judgment. A correct judge nobody acts on is the same failure as no judge:
 * `continue-on-error` was also technically running the command.
 */
export function main(run: () => Run = runComparator): number {
	const { status, output } = run();
	const verdict = judge(status, output);
	if (!verdict.ok) {
		// The tail carries the terminal lines; the full diff list is noise here.
		for (const line of output.trimEnd().split('\n').slice(-20)) console.error(line);
		console.error(`\nPARITY PROGRESS FAILED: ${verdict.reason}`);
		return 1;
	}
	console.log(`PARITY PROGRESS: ${verdict.reason}`);
	return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	process.exit(main());
}
