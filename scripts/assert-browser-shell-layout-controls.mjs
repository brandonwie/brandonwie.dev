/**
 * migration:browser:shell-layout:controls — controls for the full-bleed shell
 * probe (user instruction 2026-09-23: full-bleed enclosure, all nav links in
 * the header).
 *
 *   - SLC-01 DEFECT: the old boxed layout (960px card, 24px page padding) trips SL-01
 *   - SLC-02 DEFECT: a hidden header nav trips SL-03
 *   - SLC-03 DEFECT: an enclosure without min-height trips SL-01 on short pages
 *   - SLC-04 DEFECT: an enclosure without the flex column trips SL-04 on short pages
 *   - SLC-05 INVARIANCE: the unmutated probe passes
 */
import { runFlagControls, exitWith } from './browser-flag-controls.mjs';
import { EXIT } from './browser-probe.mjs';

exitWith(
	runFlagControls('scripts/assert-browser-shell-layout.mjs', [
		{
			id: 'SLC-01',
			kind: 'DEFECT',
			what: 'the boxed enclosure is caught',
			args: ['--boxed'],
			expect: EXIT.FAIL,
			expectedFailures: ['SL-01'],
		},
		{
			id: 'SLC-02',
			kind: 'DEFECT',
			what: 'a hidden header nav is caught',
			args: ['--no-nav'],
			expect: EXIT.FAIL,
			expectedFailures: ['SL-03'],
		},
		{
			id: 'SLC-03',
			kind: 'DEFECT',
			what: 'a short page ending mid-viewport is caught',
			args: ['--no-grow'],
			expect: EXIT.FAIL,
			expectedFailures: ['SL-01'],
		},
		{
			id: 'SLC-04',
			kind: 'DEFECT',
			what: 'a status line floating above the bottom is caught',
			args: ['--no-flex'],
			expect: EXIT.FAIL,
			expectedFailures: ['SL-04'],
		},
		{
			id: 'SLC-05',
			kind: 'INVARIANCE',
			what: 'unmutated shell-layout probe passes',
			args: [],
			expect: EXIT.PASS,
		},
	]),
);
