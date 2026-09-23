/**
 * migration:browser:study-states:controls — controls for the visualizer
 * state-ink probe (reviewer round 1, gap 3c).
 *
 *   - SSC-01 DEFECT: the old amber-highlight current/new look trips the
 *     reverse-video rows (BST traversal, heap, graph traversal)
 *   - SSC-02 DEFECT: the old removal/hashmap inks trip their rows
 *   - SSC-03 INVARIANCE: the unmutated probe passes
 */
import { runFlagControls, exitWith } from './browser-flag-controls.mjs';
import { EXIT } from './browser-probe.mjs';

exitWith(
	runFlagControls('scripts/assert-browser-study-states.mjs', [
		{
			id: 'SSC-01',
			kind: 'DEFECT',
			what: 'amber-highlight current/new states are caught',
			args: ['--amber-only'],
			expect: EXIT.FAIL,
			expectedFailures: ['SS-T1', 'SS-T4', 'SS-H1', 'SS-H2', 'SS-G1', 'SS-G4'],
		},
		{
			id: 'SSC-02',
			kind: 'DEFECT',
			what: 'old removal and hashmap state inks are caught',
			args: ['--old-states'],
			expect: EXIT.FAIL,
			expectedFailures: ['SS-R1', 'SS-M1'],
		},
		{
			id: 'SSC-03',
			kind: 'INVARIANCE',
			what: 'unmutated study-states probe passes',
			args: [],
			expect: EXIT.PASS,
		},
	]),
);
