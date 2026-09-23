/**
 * migration:browser:mermaid:controls — controls for the Mermaid ink probe
 * (reviewer round 1, gap 3b).
 *
 *   - MMC-01 DEFECT: the old grey edge-label background trips MM-02 and MM-03
 *   - MMC-02 INVARIANCE: the unmutated probe passes
 */
import { runFlagControls, exitWith } from './browser-flag-controls.mjs';
import { EXIT } from './browser-probe.mjs';

exitWith(
	runFlagControls('scripts/assert-browser-mermaid.mjs', [
		{
			id: 'MMC-01',
			kind: 'DEFECT',
			what: 'grey edge-label backgrounds are caught',
			args: ['--grey'],
			expect: EXIT.FAIL,
			expectedFailures: ['MM-02', 'MM-03'],
		},
		{
			id: 'MMC-02',
			kind: 'INVARIANCE',
			what: 'unmutated mermaid probe passes',
			args: [],
			expect: EXIT.PASS,
		},
	]),
);
