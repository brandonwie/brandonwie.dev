/**
 * migration:browser:post-code:controls — controls for the post code-frame
 * probe (last-line clip fix; reviewer round 1 gap 3a language label).
 *
 *   - PCC-01 DEFECT: removing the code::after spacer trips PC-01
 *   - PCC-02 DEFECT: dropping data-language trips PC-02
 *   - PCC-03 INVARIANCE: the unmutated probe passes
 */
import { runFlagControls, exitWith } from './browser-flag-controls.mjs';
import { EXIT } from './browser-probe.mjs';

exitWith(
	runFlagControls('scripts/assert-browser-post-code.mjs', [
		{
			id: 'PCC-01',
			kind: 'DEFECT',
			what: 'a clipped last line is caught',
			args: ['--clip'],
			expect: EXIT.FAIL,
			expectedFailures: ['PC-01'],
		},
		{
			id: 'PCC-02',
			kind: 'DEFECT',
			what: 'a missing fence language is caught',
			args: ['--no-lang'],
			expect: EXIT.FAIL,
			expectedFailures: ['PC-02'],
		},
		{
			id: 'PCC-03',
			kind: 'INVARIANCE',
			what: 'unmutated post-code probe passes',
			args: [],
			expect: EXIT.PASS,
		},
	]),
);
