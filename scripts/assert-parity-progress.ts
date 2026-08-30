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

/** The two terminal verdicts the comparator can print, fully parsed. */
const RESULT_RE = /^RESULT: (\d+) unapproved difference\(s\), (\d+) stale ledger entry\(ies\)$/;
const PARITY_RE =
	/^PARITY: (\d+) pages, (\d+) site artifacts, (\d+) approved exception\(s\), (\d+) unapproved differences$/;
/** Anything that CLAIMS to be a verdict, so a malformed one is caught, not skipped. */
const VERDICT_PREFIX_RE = /^(RESULT|PARITY):/;
const FATAL_RE = /^FATAL: .*/m;
const STALE_RE = /^STALE LEDGER ENTRY /m;
/**
 * Lines allowed AFTER the terminal verdict: blank, an indented continuation
 * (the comparator's own `  NOT CHECKED here:` note), or pnpm's lifecycle
 * epilogue, which only restates the exit code we already read. Anything else
 * means the process kept going after reaching a verdict, which means the
 * verdict was not terminal.
 */
const TRAILER_RE = /^(\s*$|\s{2,}\S|\s*ELIFECYCLE\b)/;

export interface Judgment {
	ok: boolean;
	reason: string;
	unapproved: number | null;
	stale: number | null;
}

const fail = (
	reason: string,
	unapproved: number | null = null,
	stale: number | null = null,
): Judgment => ({
	ok: false,
	reason,
	unapproved,
	stale,
});

/**
 * The contract: ONE terminal verdict, consistent with the exit code, fully
 * parsed, with nothing meaningful after it.
 *
 * The first version checked those properties independently and a reviewer got
 * three transcripts past it: a stale-entry line rode along with an exit-0
 * PARITY because stale detection lived in the exit-1 branch; a PARITY line
 * announcing SEVEN unapproved differences passed because only its prefix was
 * matched; and a valid RESULT followed by an `Error` line passed because the
 * RESULT was found anywhere rather than required to be last. Each is the same
 * failure in a different place — a check that answered the question it happened
 * to ask instead of the question it claimed to answer.
 */
export function judge(exitCode: number, output: string): Judgment {
	const lines = output.split('\n');

	const fatal = FATAL_RE.exec(output);
	if (fatal) return fail(`the comparator reported ${fatal[0]}`);
	// Checked for the WHOLE transcript, not inside one exit branch. A ledger that
	// approves a difference which no longer exists has drifted from reality, and
	// that is true whatever the exit code says.
	if (STALE_RE.test(output))
		return fail('a stale ledger entry; the ledger has drifted from reality');
	if (exitCode !== 0 && exitCode !== 1) {
		return fail(`exit ${exitCode} is not a comparison result; the check did not run`);
	}

	const verdicts = lines
		.map((line, index) => ({ line, index }))
		.filter(({ line }) => VERDICT_PREFIX_RE.test(line));
	if (verdicts.length === 0) {
		return fail(`exit ${exitCode} with no terminal verdict; the comparator never reached one`);
	}
	if (verdicts.length > 1) {
		return fail(`${verdicts.length} terminal verdicts in one transcript; exactly one is a result`);
	}

	const { line, index } = verdicts[0];
	const trailing = lines.slice(index + 1).find((rest) => !TRAILER_RE.test(rest));
	if (trailing !== undefined) {
		return fail(
			`output continues past the terminal verdict: ${JSON.stringify(trailing.slice(0, 60))}`,
		);
	}

	if (exitCode === 0) {
		const parity = PARITY_RE.exec(line);
		if (!parity)
			return fail(`exit 0 with an unparseable verdict: ${JSON.stringify(line.slice(0, 60))}`);
		const unapproved = Number(parity[4]);
		// A PARITY line is allowed to say one thing about differences: zero.
		if (unapproved !== 0) {
			return fail(
				`exit 0 with a PARITY line claiming ${unapproved} unapproved difference(s)`,
				unapproved,
				0,
			);
		}
		return {
			ok: true,
			reason: 'parity reached — 0 unapproved differences',
			unapproved: 0,
			stale: 0,
		};
	}

	const result = RESULT_RE.exec(line);
	if (!result)
		return fail(`exit 1 with an unparseable verdict: ${JSON.stringify(line.slice(0, 60))}`);
	const unapproved = Number(result[1]);
	const stale = Number(result[2]);
	if (stale > 0)
		return fail(
			`${stale} stale ledger entry(ies); the ledger has drifted from reality`,
			unapproved,
			stale,
		);
	if (unapproved === 0) {
		return fail(
			'exit 1 with 0 unapproved and 0 stale; the result contradicts the exit code',
			unapproved,
			stale,
		);
	}
	return {
		ok: true,
		reason: `expected progress state — ${unapproved} unapproved difference(s), 0 stale`,
		unapproved,
		stale,
	};
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
