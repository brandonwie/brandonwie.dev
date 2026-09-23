/**
 * migration:browser:landmarks:controls — controls for the navigation-landmark
 * probe (reviewer round 3: the status-line scroller must not be a navigation
 * landmark).
 *
 *   - LMC-01 DEFECT: the status line back as `<nav role="none">` trips LM-01 and
 *            LM-04 (Chrome exposes the overflowing scroller as an unnamed nav)
 *   - LMC-02 DEFECT: another nav carrying the primary label trips LM-02 and LM-03
 *   - LMC-03 INVARIANCE: the unmutated probe passes
 */
import { runFlagControls, exitWith } from './browser-flag-controls.mjs';
import { EXIT } from './browser-probe.mjs';

exitWith(
	runFlagControls('scripts/assert-browser-landmarks.mjs', [
		{
			id: 'LMC-01',
			kind: 'DEFECT',
			what: 'a <nav role="none"> status line is caught',
			args: ['--nav-none'],
			expect: EXIT.FAIL,
			expectedFailures: ['LM-01', 'LM-04'],
		},
		{
			id: 'LMC-02',
			kind: 'DEFECT',
			what: 'a second nav named as the primary navigation is caught',
			args: ['--dup-label'],
			expect: EXIT.FAIL,
			expectedFailures: ['LM-02', 'LM-03'],
		},
		{
			id: 'LMC-03',
			kind: 'INVARIANCE',
			what: 'unmutated landmark probe passes',
			args: [],
			expect: EXIT.PASS,
		},
	]),
);
