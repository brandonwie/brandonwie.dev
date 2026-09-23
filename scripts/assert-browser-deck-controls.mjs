/**
 * migration:browser:deck:controls — controls for the talk-deck probe
 * (reviewer round 1, gaps 1-2: presenting default, keys scoped to the deck).
 *
 *   - DKC-01 DEFECT: frame borders restored while presenting trip DK-01
 *   - DKC-02 DEFECT: a key on the status line that moves the slide trips DK-02
 *   - DKC-03 DEFECT: a dead key handler trips DK-03
 *   - DKC-04 DEFECT: Escape that cannot leave presenting trips DK-04
 *   - DKC-05 INVARIANCE: the unmutated probe passes
 */
import { runFlagControls, exitWith } from './browser-flag-controls.mjs';
import { EXIT } from './browser-probe.mjs';

exitWith(
	runFlagControls('scripts/assert-browser-deck.mjs', [
		{
			id: 'DKC-01',
			kind: 'DEFECT',
			what: 'frames while presenting are caught by DK-01',
			args: ['--control=frames'],
			expect: EXIT.FAIL,
			expectedFailures: ['DK-01'],
		},
		{
			id: 'DKC-02',
			kind: 'DEFECT',
			what: 'a slide change from a chrome key is caught by DK-02',
			args: ['--control=leak'],
			expect: EXIT.FAIL,
			expectedFailures: ['DK-02'],
		},
		{
			id: 'DKC-03',
			kind: 'DEFECT',
			what: 'a key handler that does nothing is caught by DK-03',
			args: ['--control=dead'],
			expect: EXIT.FAIL,
			expectedFailures: ['DK-03'],
		},
		{
			id: 'DKC-04',
			kind: 'DEFECT',
			what: 'presenting that Escape cannot leave is caught by DK-04',
			args: ['--control=sticky'],
			expect: EXIT.FAIL,
			expectedFailures: ['DK-04'],
		},
		{
			id: 'DKC-05',
			kind: 'INVARIANCE',
			what: 'unmutated deck probe passes',
			args: [],
			expect: EXIT.PASS,
		},
	]),
);
