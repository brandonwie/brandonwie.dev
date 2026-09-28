/**
 * Negative controls for the unsupported-markup detector checks.
 *
 *   pnpm migration:typography:oracle:controls
 *
 * `assert-typography-oracle.ts` asserts that the real detector flags every
 * unsupported shape and no ordinary one. These controls hand it defective
 * detectors and require a failure, so "the checks pass" means the checks can
 * tell a working detector from a broken one:
 *
 *   OR-05  INVARIANCE  the real detector flags NONE of the ordinary fixtures
 *   OR-06  DEFECT      a detector that flags nothing
 *   OR-07  DEFECT      a detector that flags everything
 *   OR-08  DEFECT      a detector that sees only HTML tag names — the shape the
 *                      rule had before `svelte:*` openers and template
 *                      directives were found slipping through it
 *
 * HISTORY. OR-01 to OR-04 mutated the Next pipeline's output and required the
 * mdsvex differential comparison to reject it. That comparison was dropped with
 * the SvelteKit app, and those ids are retired rather than reissued.
 *
 * The import below is deliberately multiline: `scripts/migration-route-controls.ts`
 * pins that the router's import discovery follows a multiline import, and this
 * suite reaches `remark-smart-typography.ts` only through it.
 */
import {
	FIXTURES,
	ORDINARY_BRACE_FIXTURES,
	runDetectorChecks,
	runFalsePositiveCheck,
	type Detector,
} from './assert-typography-oracle';

interface Control {
	id: string;
	what: string;
	detect: Detector;
}

/** An HTML tag opener with no colon in its name: blind to `svelte:*` and directives. */
const HTML_TAG_ONLY = /<\/?[A-Za-z][A-Za-z0-9-]*[\s/>]/;

const CONTROLS: Control[] = [
	{
		id: 'OR-06',
		what: 'a detector that flags nothing',
		detect: () => false,
	},
	{
		id: 'OR-07',
		what: 'a detector that flags everything',
		detect: () => true,
	},
	{
		id: 'OR-08',
		what: 'a detector blind to svelte:* openers and template directives',
		detect: (source) => HTML_TAG_ONLY.test(source),
	},
];

// OR-05 is the detector's discrimination test with the REAL detector, run
// before the defect controls. It requires EVERY ordinary fixture, braces
// included, to stay unflagged.
const discrimination = runFalsePositiveCheck([...FIXTURES, ...ORDINARY_BRACE_FIXTURES], true);
console.log(
	`${discrimination === 0 ? 'PASS' : 'FAIL'}  OR-05  INVARIANCE exit ${discrimination} (expected 0)  the detector must flag NONE of the ordinary fixtures, braces included`,
);
const failures: string[] =
	discrimination === 0 ? [] : ['OR-05 the detector flags ordinary markdown as unsupported'];

const clean = runDetectorChecks(undefined, true);
console.log(`BASELINE  the real detector -> exit ${clean} (expected 0)`);
if (clean !== 0) {
	console.error('FATAL: the real detector does not pass; fix that before trusting any control');
	process.exit(1);
}

for (const control of CONTROLS) {
	const code = runDetectorChecks(control.detect, true);
	const ok = code === 1;
	if (!ok) failures.push(`${control.id} ${control.what}: exit ${code}, expected 1`);
	console.log(
		`${ok ? 'PASS' : 'FAIL'}  ${control.id}  DEFECT     exit ${code} (expected 1)  ${control.what}`,
	);
}

const total = CONTROLS.length + 1;
console.log(
	`\n${total} controls: ${CONTROLS.length} defect (must exit 1), 1 invariance (must exit 0)`,
);
if (failures.length) {
	for (const line of failures) console.error(`CONTROL FAILED ${line}`);
	console.error(`RESULT: ${failures.length}/${total} control(s) failed`);
	process.exit(1);
}
console.log(`RESULT: ${total}/${total} controls behaved as specified`);
