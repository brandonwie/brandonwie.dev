/**
 * Slice 2 — the study-visualizer spike: executable evidence.
 *
 *   pnpm migration:spike2
 *
 * Slice 2 exists to buy a measured per-component cost before Slice 4 commits
 * hundreds of hours to 11,140 lines of interactive Svelte. Two samples were
 * ported, one from each disjoint behavior class in the seventeen-visualizer
 * cohort, and the expensive half of that port is arithmetic that used to be a
 * language feature: `animate:flip`, `in:scale` and `in:fade` are Svelte
 * directives, and React has nothing for any of them.
 *
 * A port of a formula is the kind of work that looks finished and is wrong by
 * a factor nobody notices — a dropped scale term, a transform origin read in
 * the wrong units, an easing curve handed to the browser instead of baked into
 * the samples. So the O rows do not check that the port "animates". They
 * compare the port against Svelte's OWN `flip`, `fade`, `scale` and easings on
 * the same inputs, CSS character for character. That is the strongest oracle
 * available for this work and it needs no browser: both sides are pure
 * functions of a pair of rectangles.
 *
 * SVELTE RETIREMENT. The `svelte` package is gone, so the oracle no longer runs
 * live. Its outputs on this file's exact inputs were generated once from
 * svelte@5.56.4 at commit 770bc30 and are FROZEN below (SVELTE_* tables); the
 * O rows pin the port to them. Changing an input (a flip case, an origin, a
 * sample point) without a frozen answer for it fails the row rather than
 * comparing against nothing.
 *
 * The rows are grouped by what they hold onto:
 *
 *   O  oracle parity       ported primitives vs. svelte@5.56.4's own (frozen),
 *                          byte for byte, including the whitespace in `scale`
 *   P  port roll-call      every retired Svelte role has its Next port, the
 *                          client boundaries land where they should, and no
 *                          new runtime dependency was taken
 *   R  reduced motion      resolved at the call site, as in the Svelte
 *                          template; the hook has no opinion about it
 *   M  model               the hash-map state machine, checked against an
 *                          independently written bucket and probe calculation
 *   S  spike route         what the export actually contains, and that the
 *                          ledger approves exactly one page row for it
 *   C  typecheck           tsc exits 0 AND the new modules are in the program
 *
 * WHY M EXISTS AS ITS OWN GROUP. The HashMap port could not be a transcription:
 * the Svelte insert step reads `size` right after assigning `chains` and gets
 * the post-insert value, because a `$derived` recomputes on read, and React
 * state cannot be read that way inside the handler that just set it. A literal
 * port would resize one insert late — in a component whose entire subject is
 * when the table resizes. M3 is that off-by-one, written down as a row.
 *
 * Importing this module is safe — its CLI is guarded on `process.argv[1]` — so
 * `assert-slice2-motion-controls.ts` can drive `runAssertions()` against
 * substituted seams, mutated source copies and mutated build copies.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import {
	cubicOut,
	fadeConfig,
	flipConfig,
	linear,
	sampleKeyframes,
	scaleConfig,
	type MotionBox,
	type MotionConfig,
} from '../next/src/motion/svelte-motion';
import {
	planEnter,
	planFlip,
	planUpdate,
	type MotionReading,
} from '../next/src/motion/KeyedMotion';
import {
	INITIAL_CAPACITY,
	INSERT_QUEUE,
	LOAD_FACTOR_LIMIT,
	RESIZE_CAPACITY,
	insert,
	isExhausted,
	reset,
	sizeOf,
	type ProbeSlot,
	type TableState,
} from '../next/src/study/hash-map-model';

// ------------------------------------------------------------------ constants

/** The four ports this slice paid for, by role.
 *
 *  History: the Svelte sources were src/lib/useReducedMotion.svelte.ts and
 *  src/lib/components/study/{Stepper,BstTraversalVisualizer,HashMapVisualizer}.svelte.
 *  They are retired, so P1 checks only the Next side. */
export const PORT_ROLES = [
	{
		next: 'next/src/motion/useReducedMotion.ts',
		role: 'reduced-motion choke point (12 consumers)',
	},
	{
		next: 'next/src/components/study/Stepper.tsx',
		role: 'stepper choke point (12 call sites)',
	},
	{
		next: 'next/src/components/study/BstTraversalVisualizer.tsx',
		role: 'Stepper-driven sample (12 of 17 visualizers)',
	},
	{
		next: 'next/src/components/study/HashMapVisualizer.tsx',
		role: 'keyed-list FLIP sample (4 of 17 visualizers)',
	},
] as const;

/**
 * Modules with no Svelte counterpart, and the reason each one has to exist.
 * These are the lines the framework used to supply, which is exactly the number
 * gate G2 is asking for.
 */
export const PORT_ADDITIONS = [
	{
		path: 'next/src/motion/svelte-motion.ts',
		why: 'flip, fade and scale have no React equivalent',
	},
	{
		path: 'next/src/motion/KeyedMotion.tsx',
		why: 'React does not report keyed-list survivors, or where they were',
	},
	{ path: 'next/src/study/hash-map-model.ts', why: 'no $derived, so the insert step becomes pure' },
	{
		path: 'next/src/components/study/StudySpike.tsx',
		why: 'copy holds functions; they cannot cross the RSC boundary',
	},
	{ path: 'next/src/data/study.ts', why: 'reaches the Svelte copy module rather than forking it' },
] as const;

/** `'use client'` belongs on the modules that touch React, and nowhere else. */
export const CLIENT_BOUNDARY: Record<string, boolean> = {
	'next/src/motion/useReducedMotion.ts': true,
	'next/src/motion/KeyedMotion.tsx': true,
	'next/src/components/study/Stepper.tsx': true,
	'next/src/components/study/BstTraversalVisualizer.tsx': true,
	'next/src/components/study/HashMapVisualizer.tsx': true,
	'next/src/components/study/StudySpike.tsx': true,
	// Pure, and therefore usable from a Server Component. If either of these
	// ever needs the directive, something React-shaped leaked into the math.
	'next/src/motion/svelte-motion.ts': false,
	'next/src/study/hash-map-model.ts': false,
	'next/src/data/study.ts': false,
};

/**
 * The Next candidate's runtime dependencies, as of this PR.
 *
 * The row this feeds is the one that would have caught the easy answer to
 * `animate:flip`: adding a layout-animation library. Taking one is a decision
 * with a weight budget and a parity argument attached, so it fails a row here
 * until the list is deliberately changed.
 *
 * `gsap` and `fuse.js` were added by Slice 2 PR 3, and adding them here is the
 * deliberate change the paragraph above describes rather than a weakening of
 * the row. Neither is an answer to `animate:flip`: both are dependencies the
 * SVELTE side already carries for the same two surfaces (`gsap` for the talk
 * deck, `fuse.js` for the command palette), so they are ported cost, not new
 * cost. `d3-shape` joined by the same rule in Slice 4: the Svelte side carries
 * it for `BigOExplorer`, and the Next port draws the same monotone curves with
 * the same library rather than a second implementation. The row still fails
 * the moment a FOURTH library appears, which is the property it exists for.
 */
export const NEXT_RUNTIME_DEPENDENCIES = [
	'@shikijs/rehype',
	'@xyflow/react',
	'd3-shape',
	'fuse.js',
	'github-slugger',
	'gray-matter',
	'gsap',
	'hast-util-to-jsx-runtime',
	'mdast-util-to-hast',
	'mdast-util-to-string',
	'mermaid',
	'next',
	'react',
	'rehype-slug',
	'remark-gfm',
	'remark-parse',
	'remark-rehype',
	'retext',
	'shiki',
	'unified',
	'unist-util-visit',
	'vfile',
];

export const SPIKE_URL = '/migration-fixture/study';
export const SPIKE_PAGE = ['migration-fixture', 'study.html'];

/**
 * The export holds the two components' INITIAL render and nothing further.
 * One motion key: the BST output starts at step 0, which is one visited chip.
 * Zero flip attributes: the hash table starts empty, so there is no chain node
 * to animate. Both numbers are properties of the Svelte originals' initial
 * state, not of the port.
 */
export const INITIAL_EXPORT_COUNTS = { motionKeys: 1, flipAttributes: 0, studyCards: 2 };

/**
 * Any way a module can reach the `svelte` package.
 *
 * Quote-agnostic on purpose: an earlier revision matched single quotes only, so
 * `from "svelte/easing"` would have produced a green run while the port reached
 * back into the framework it replaced. Covers `from`, a bare side-effect
 * `import`, a dynamic `import(...)`, and `require(...)`.
 *
 * The subpath group demands a `/` or a closing quote immediately after
 * `svelte`, so a local module named `./svelte-motion` — which this port has —
 * is not a match.
 */
export const SVELTE_IMPORT =
	/(?:from|import)\s*\(?\s*["']svelte(?:\/[^"']*)?["']|require\(\s*["']svelte(?:\/[^"']*)?["']/;

/** Sentinels that must survive minification if the hook actually shipped. */
export const HOOK_SENTINELS = ['[data-motion-key]', 'currentCSSZoom'];

// -------------------------------------------------------------------- options

export interface MotionSeam {
	flipConfig: typeof flipConfig;
	fadeConfig: typeof fadeConfig;
	scaleConfig: typeof scaleConfig;
	sampleKeyframes: typeof sampleKeyframes;
	cubicOut: typeof cubicOut;
	linear: typeof linear;
}

export interface PlanSeam {
	planFlip: typeof planFlip;
	planEnter: typeof planEnter;
	planUpdate: typeof planUpdate;
}

export interface ModelSeam {
	insert: typeof insert;
	reset: typeof reset;
	sizeOf: typeof sizeOf;
	isExhausted: typeof isExhausted;
}

export interface Slice2Options {
	root?: string;
	buildDir?: string;
	ledgerFile?: string;
	/** Replace a repo file's CONTENT for one run: real path to scratch path. */
	sourceOverrides?: Record<string, string>;
	/** Directory roots P3 scans for Svelte imports; controls point them at a
	 *  scratch copy carrying one, so the row is proven able to fail without a
	 *  Svelte import ever being written into the real tree. */
	scanRoots?: string[];
	/** Replace the declared client-boundary map (P2-defect-declared-boundary-unmet). */
	clientBoundary?: Record<string, boolean>;
	/** Replace the declared dependency list (controls prove P4 can fail). */
	dependencies?: string[];
	/** Replace the declared initial-export counts (S2-defect-declared-counts-unmet). */
	initialCounts?: typeof INITIAL_EXPORT_COUNTS;
	/** Seam for the O rows. */
	motion?: MotionSeam;
	/** Seam for the R rows. */
	plan?: PlanSeam;
	/** Seam for the M rows. */
	model?: ModelSeam;
	/** tsconfig the C row typechecks; controls point it at a widened copy. */
	tsconfigProject?: string;
	/** Skip the C row: controls that already drive tsc do not pay for it twice. */
	skipTypecheck?: boolean;
	quiet?: boolean;
	onRows?: (rows: RowResult[]) => void;
}

export interface RowResult {
	id: string;
	ok: boolean;
	detail: string;
}

interface Row extends RowResult {
	what: string;
}

class Runner {
	rows: Row[] = [];
	constructor(private quiet: boolean) {}

	record(id: string, what: string, ok: boolean, detail: string): void {
		this.rows.push({ id, what, ok, detail });
		if (this.quiet) return;
		console.log(`${ok ? 'PASS' : 'FAIL'} ${id.padEnd(4)} ${what}`);
		if (detail) console.log(`       ${detail}`);
	}

	/** A thrown row body is a FAIL, never a crash: a harness that dies on row 3
	 *  has not run rows 4 through 21. */
	row(id: string, what: string, body: () => string): void {
		try {
			this.record(id, what, true, body());
		} catch (error) {
			this.record(id, what, false, (error as Error).message);
		}
	}
}

function must(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
}

function eq(actual: unknown, expected: unknown, label: string): void {
	const a = JSON.stringify(actual);
	const b = JSON.stringify(expected);
	must(a === b, `${label}: expected ${b}, got ${a}`);
}

// ------------------------------------------------------ frozen svelte oracles

/*
 * svelte@5.56.4's `flip` (svelte/animate), `fade` and `scale`
 * (svelte/transition), `cubicOut` and `linear` (svelte/easing), run ONCE on
 * the exact inputs this file declares (FLIP_CASES x ORIGINS x SAMPLES, the
 * fade opacities and delays, the scale transforms) and FROZEN here.
 *
 * Origin: the live oracle calls this file made at commit 770bc30
 * (scripts/assert-slice2-motion.ts:53-55 imports, :536-542 flip, :595-615 flip
 * durations, :630-632 fade, :654 scale, :681-684 easings), with the same
 * getComputedStyle stub and client-box node. Generated by
 * tmp/rsm-gen/gen-spike2-oracle.ts against node_modules/svelte at that commit.
 *
 * The package is retired, so these cannot be regenerated. Adding an input
 * without a frozen answer fails the row through frozen(); it never compares
 * against nothing.
 */

type FrozenEasing = 'cubicOut' | 'linear';

/** An oracle config's delay, and the easing it returned: identified by === on
 *  every t = i / 20 sample, which covers the i / 10 points sameCurve reads. */
interface FrozenCurve {
	delay: number;
	easing: FrozenEasing;
}

/** cubicOut and linear sampled at t = i / 20, i = 0..20. */
export const SVELTE_EASING: Record<FrozenEasing, number[]> = {
	cubicOut: [
		0, 0.1426250000000001, 0.2709999999999999, 0.3858750000000001, 0.4879999999999999, 0.578125,
		0.657, 0.7253749999999999, 0.784, 0.833625, 0.875, 0.908875, 0.9359999999999999, 0.957125,
		0.973, 0.984375, 0.992, 0.996625, 0.999, 0.999875, 1,
	],
	linear: [
		0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85,
		0.9, 0.95, 1,
	],
};

/** flip() with { duration: 220 }: delay and easing, identical for every case. */
const SVELTE_FLIP_CURVE: FrozenCurve = { delay: 0, easing: 'cubicOut' };

/** flip()'s duration when handed { duration: 220 }: passed through. */
const SVELTE_FLIP_EXPLICIT_DURATION = 220;

/** flip()'s DEFAULT duration, `Math.sqrt(distance) * 120`, per flip case. */
const SVELTE_FLIP_DEFAULT_DURATION: Record<string, number> = {
	'moves left and down': 996.5330520434534,
	'bordered node moves': 1493.9879517586478,
	'bordered node shrinks as it moves': 1493.9879517586478,
	grows: 0,
	shrinks: 682.1130693194649,
	'moves on y only': 1934.9418595916518,
	'does not move': 0,
	'moves under CSS zoom': 1249.3631473877886,
};

/** flip().css(t, u) per flip case, per origin, at each of SAMPLES in order. */
const SVELTE_FLIP_CSS: Record<string, Record<string, string[]>> = {
	'moves left and down': {
		'top-left': [
			'transform:  translate(60px, -34px) scale(1.1458333333333333, 1);',
			'transform:  translate(45px, -25.5px) scale(1.109375, 1);',
			'transform:  translate(30px, -17px) scale(1.0729166666666665, 1);',
			'transform:  translate(15px, -8.5px) scale(1.0364583333333333, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		centre: [
			'transform:  translate(67px, -34px) scale(1.1458333333333333, 1);',
			'transform:  translate(50.25px, -25.5px) scale(1.109375, 1);',
			'transform:  translate(33.5px, -17px) scale(1.0729166666666665, 1);',
			'transform:  translate(16.75px, -8.5px) scale(1.0364583333333333, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		asymmetric: [
			'transform:  translate(63.5px, -34px) scale(1.1458333333333333, 1);',
			'transform:  translate(47.625px, -25.5px) scale(1.109375, 1);',
			'transform:  translate(31.75px, -17px) scale(1.0729166666666665, 1);',
			'transform:  translate(15.875px, -8.5px) scale(1.0364583333333333, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
	},
	'bordered node moves': {
		'top-left': [
			'transform:  translate(155px, 0px) scale(1, 1);',
			'transform:  translate(116.25px, 0px) scale(1, 1);',
			'transform:  translate(77.5px, 0px) scale(1, 1);',
			'transform:  translate(38.75px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		centre: [
			'transform:  translate(155px, 0px) scale(1, 1);',
			'transform:  translate(116.25px, 0px) scale(1, 1);',
			'transform:  translate(77.5px, 0px) scale(1, 1);',
			'transform:  translate(38.75px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		asymmetric: [
			'transform:  translate(155px, 0px) scale(1, 1);',
			'transform:  translate(116.25px, 0px) scale(1, 1);',
			'transform:  translate(77.5px, 0px) scale(1, 1);',
			'transform:  translate(38.75px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
	},
	'bordered node shrinks as it moves': {
		'top-left': [
			'transform:  translate(155px, 0px) scale(1.375, 1);',
			'transform:  translate(116.25px, 0px) scale(1.28125, 1);',
			'transform:  translate(77.5px, 0px) scale(1.1875, 1);',
			'transform:  translate(38.75px, 0px) scale(1.09375, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		centre: [
			'transform:  translate(166.625px, 0px) scale(1.375, 1);',
			'transform:  translate(124.96875px, 0px) scale(1.28125, 1);',
			'transform:  translate(83.3125px, 0px) scale(1.1875, 1);',
			'transform:  translate(41.65625px, 0px) scale(1.09375, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		asymmetric: [
			'transform:  translate(160.8125px, 0px) scale(1.375, 1);',
			'transform:  translate(120.609375px, 0px) scale(1.28125, 1);',
			'transform:  translate(80.40625px, 0px) scale(1.1875, 1);',
			'transform:  translate(40.203125px, 0px) scale(1.09375, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
	},
	grows: {
		'top-left': [
			'transform:  translate(0px, 0px) scale(0.5, 0.5);',
			'transform:  translate(0px, 0px) scale(0.625, 0.625);',
			'transform:  translate(0px, 0px) scale(0.75, 0.75);',
			'transform:  translate(0px, 0px) scale(0.875, 0.875);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		centre: [
			'transform:  translate(-20px, -10px) scale(0.5, 0.5);',
			'transform:  translate(-15px, -7.5px) scale(0.625, 0.625);',
			'transform:  translate(-10px, -5px) scale(0.75, 0.75);',
			'transform:  translate(-5px, -2.5px) scale(0.875, 0.875);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		asymmetric: [
			'transform:  translate(-10px, -15px) scale(0.5, 0.5);',
			'transform:  translate(-7.5px, -11.25px) scale(0.625, 0.625);',
			'transform:  translate(-5px, -7.5px) scale(0.75, 0.75);',
			'transform:  translate(-2.5px, -3.75px) scale(0.875, 0.875);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
	},
	shrinks: {
		'top-left': [
			'transform:  translate(-30px, -12px) scale(2, 2);',
			'transform:  translate(-22.5px, -9px) scale(1.75, 1.75);',
			'transform:  translate(-15px, -6px) scale(1.5, 1.5);',
			'transform:  translate(-7.5px, -3px) scale(1.25, 1.25);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		centre: [
			'transform:  translate(0px, 3px) scale(2, 2);',
			'transform:  translate(0px, 2.25px) scale(1.75, 1.75);',
			'transform:  translate(0px, 1.5px) scale(1.5, 1.5);',
			'transform:  translate(0px, 0.75px) scale(1.25, 1.25);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		asymmetric: [
			'transform:  translate(-15px, 10.5px) scale(2, 2);',
			'transform:  translate(-11.25px, 7.875px) scale(1.75, 1.75);',
			'transform:  translate(-7.5px, 5.25px) scale(1.5, 1.5);',
			'transform:  translate(-3.75px, 2.625px) scale(1.25, 1.25);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
	},
	'moves on y only': {
		'top-left': [
			'transform:  translate(0px, 260px) scale(1, 1);',
			'transform:  translate(0px, 195px) scale(1, 1);',
			'transform:  translate(0px, 130px) scale(1, 1);',
			'transform:  translate(0px, 65px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		centre: [
			'transform:  translate(0px, 260px) scale(1, 1);',
			'transform:  translate(0px, 195px) scale(1, 1);',
			'transform:  translate(0px, 130px) scale(1, 1);',
			'transform:  translate(0px, 65px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		asymmetric: [
			'transform:  translate(0px, 260px) scale(1, 1);',
			'transform:  translate(0px, 195px) scale(1, 1);',
			'transform:  translate(0px, 130px) scale(1, 1);',
			'transform:  translate(0px, 65px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
	},
	'does not move': {
		'top-left': [
			'transform:  translate(0px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		centre: [
			'transform:  translate(0px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		asymmetric: [
			'transform:  translate(0px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
	},
	'moves under CSS zoom': {
		'top-left': [
			'transform:  translate(102.375px, 35.625px) scale(1, 1);',
			'transform:  translate(76.78125px, 26.71875px) scale(1, 1);',
			'transform:  translate(51.1875px, 17.8125px) scale(1, 1);',
			'transform:  translate(25.59375px, 8.90625px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		centre: [
			'transform:  translate(102.375px, 35.625px) scale(1, 1);',
			'transform:  translate(76.78125px, 26.71875px) scale(1, 1);',
			'transform:  translate(51.1875px, 17.8125px) scale(1, 1);',
			'transform:  translate(25.59375px, 8.90625px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
		asymmetric: [
			'transform:  translate(102.375px, 35.625px) scale(1, 1);',
			'transform:  translate(76.78125px, 26.71875px) scale(1, 1);',
			'transform:  translate(51.1875px, 17.8125px) scale(1, 1);',
			'transform:  translate(25.59375px, 8.90625px) scale(1, 1);',
			'transform:  translate(0px, 0px) scale(1, 1);',
		],
	},
};

/** fade() with { duration: 120, delay }: duration passed through. */
const SVELTE_FADE_DURATION = 120;

/** fade() delay and easing, per starting opacity (delay 0 at '1', 40 at '0.6'). */
const SVELTE_FADE_CURVE: Record<string, FrozenCurve> = {
	'1': { delay: 0, easing: 'linear' },
	'0.6': { delay: 40, easing: 'linear' },
};

/** fade().css(t, u) per starting opacity, at each of SAMPLES in order. */
const SVELTE_FADE_CSS: Record<string, string[]> = {
	'1': ['opacity: 0', 'opacity: 0.25', 'opacity: 0.5', 'opacity: 0.75', 'opacity: 1'],
	'0.6': [
		'opacity: 0',
		'opacity: 0.15',
		'opacity: 0.3',
		'opacity: 0.44999999999999996',
		'opacity: 0.6',
	],
};

/** scale() with { duration: 160 }: delay and easing, identical for both transforms. */
const SVELTE_SCALE_CURVE: FrozenCurve = { delay: 0, easing: 'cubicOut' };

/** scale().css(t, u) per existing transform, at each of SAMPLES in order.
 *  The embedded newlines and tabs are svelte's own template indentation. */
const SVELTE_SCALE_CSS: Record<string, string[]> = {
	none: [
		'\n\t\t\ttransform:  scale(0);\n\t\t\topacity: 0\n\t\t',
		'\n\t\t\ttransform:  scale(0.25);\n\t\t\topacity: 0.25\n\t\t',
		'\n\t\t\ttransform:  scale(0.5);\n\t\t\topacity: 0.5\n\t\t',
		'\n\t\t\ttransform:  scale(0.75);\n\t\t\topacity: 0.75\n\t\t',
		'\n\t\t\ttransform:  scale(1);\n\t\t\topacity: 1\n\t\t',
	],
	'rotate(3deg)': [
		'\n\t\t\ttransform: rotate(3deg) scale(0);\n\t\t\topacity: 0\n\t\t',
		'\n\t\t\ttransform: rotate(3deg) scale(0.25);\n\t\t\topacity: 0.25\n\t\t',
		'\n\t\t\ttransform: rotate(3deg) scale(0.5);\n\t\t\topacity: 0.5\n\t\t',
		'\n\t\t\ttransform: rotate(3deg) scale(0.75);\n\t\t\topacity: 0.75\n\t\t',
		'\n\t\t\ttransform: rotate(3deg) scale(1);\n\t\t\topacity: 1\n\t\t',
	],
};

function box(left: number, top: number, width: number, height: number): MotionBox {
	return { left, top, width, height };
}

/**
 * Rectangle pairs covering movement, growth, shrink, pure-y, and no movement —
 * and, in the last two, an element whose CLIENT box is smaller than its border
 * box.
 *
 * That distinction is not decorative. Svelte's `flip` multiplies dx and dy by
 * `clientWidth / to.width`, and every case whose client box equals its target
 * box makes that factor 1, so the whole term can be deleted from the port with
 * no visible effect. It is exactly the mutation `O1-defect-scale-factor`
 * induces, and an earlier version of this list did not catch it. The chain
 * nodes this port animates carry a 1px border, so `clientWidth` really is
 * `width - 2` for them: the un-exercised term was one the real components use.
 */
const FLIP_CASES: {
	name: string;
	from: MotionBox;
	to: MotionBox;
	client: [number, number];
	/** Effective CSS zoom. Svelte divides dx and dy by it; at 1 the term vanishes. */
	zoom?: number;
}[] = [
	{
		name: 'moves left and down',
		from: box(120, 40, 110, 40),
		to: box(60, 74, 96, 40),
		client: [96, 40],
	},
	{
		name: 'bordered node moves',
		from: box(200, 10, 64, 28),
		to: box(40, 10, 64, 28),
		client: [62, 26],
	},
	{
		name: 'bordered node shrinks as it moves',
		from: box(200, 10, 88, 28),
		to: box(40, 10, 64, 28),
		client: [62, 26],
	},
	{ name: 'grows', from: box(10, 10, 40, 20), to: box(10, 10, 80, 40), client: [80, 40] },
	{ name: 'shrinks', from: box(0, 0, 120, 60), to: box(30, 12, 60, 30), client: [60, 30] },
	{
		name: 'moves on y only',
		from: box(24, 300, 64, 24),
		to: box(24, 40, 64, 24),
		client: [64, 24],
	},
	{ name: 'does not move', from: box(8, 8, 50, 25), to: box(8, 8, 50, 25), client: [50, 25] },
	{
		// The zoom divisor is the second term that disappears when every input
		// leaves it at 1 -- the same shape as the scale factor O1 missed once
		// already. Without this case, `/ metrics.zoom` can be deleted from the
		// port and every row stays green; `O1-defect-zoom-ignored` proved it.
		name: 'moves under CSS zoom',
		from: box(300, 120, 80, 32),
		to: box(90, 44, 80, 32),
		client: [78, 30],
		zoom: 2,
	},
];

/** Look a case up by name: an index would silently move when a case is added,
 *  which is how R3 came to assert something other than the stationary pair. */
function flipCase(name: string): {
	from: MotionBox;
	to: MotionBox;
	client: [number, number];
	zoom?: number;
} {
	const found = FLIP_CASES.find((testCase) => testCase.name === name);
	if (!found) throw new Error(`no flip case named "${name}"`);
	return found;
}

const SAMPLES: [number, number][] = [
	[0, 1],
	[0.25, 0.75],
	[0.5, 0.5],
	[0.75, 0.25],
	[1, 0],
];

/**
 * Transform origins, as the pair of FRACTIONS Svelte reduces them to.
 *
 * The computed `transform-origin` string is rebuilt from these at each call
 * site because it depends on that case's client box; carrying a literal string
 * here as well would be a second copy of the same fact, free to disagree with
 * the one actually used.
 *
 * `x` and `y` are separate for a reason. While every origin was symmetric, the
 * classic copy-paste defect — `oy` computed from `origin[0]` and the WIDTH —
 * produced identical output on every case, so the port's y origin was
 * unexercised. The asymmetric entry closes that.
 */
const ORIGINS: { label: string; x: number; y: number }[] = [
	{ label: 'top-left', x: 0, y: 0 },
	{ label: 'centre', x: 0.5, y: 0.5 },
	{ label: 'asymmetric', x: 0.25, y: 0.75 },
];

/**
 * Compare the two halves of a config that are NOT the CSS string: which easing
 * it defaults to, and its delay.
 *
 * Both were uncompared until a review probe returned `easing: linear` from
 * `flipConfig` (Svelte's flip defaults to `cubicOut`) and `easing: cubicOut`
 * from `fadeConfig` (Svelte's fade defaults to `linear`) with every row still
 * green. That is not cosmetic: `KeyedMotion` hands the browser `easing:
 * 'linear'` and relies on `sampleKeyframes` baking `config.easing` in, so the
 * config's easing IS the curve the user sees.
 */
function sameCurve(oracle: FrozenCurve, ported: MotionConfig, label: string): void {
	eq(ported.delay, oracle.delay, `${label} delay`);
	const samples = SVELTE_EASING[oracle.easing];
	must(samples.length === 21, `${label}: the frozen ${oracle.easing} table is not 21 samples`);
	for (let i = 0; i <= 10; i += 1) {
		// i/10 and 2i/20 are the same correctly rounded double, so the tenths
		// read straight out of the twentieths table.
		const t = i / 10;
		const expected = samples[i * 2];
		must(
			ported.easing(t) === expected,
			`${label} easing at t=${t}: svelte ${expected} != port ${ported.easing(t)}`,
		);
	}
}

/** Look up a frozen oracle answer, failing loudly when the input set has moved
 *  past what was frozen -- a missing answer must not compare as "no difference". */
function frozen<T>(table: Record<string, T>, key: string, label: string): T {
	const value = table[key];
	must(
		value !== undefined,
		`no frozen svelte output for ${label} "${key}" -- the input changed after the oracle was frozen at 770bc30`,
	);
	return value;
}

// ------------------------------------------------------------------ the rows

export function runAssertions(options: Slice2Options = {}): number {
	const root = resolve(options.root ?? process.cwd());
	const buildDir = resolve(root, options.buildDir ?? 'next/build');
	const ledgerFile = resolve(root, options.ledgerFile ?? 'verification/exception-ledger.json');
	const overrides = options.sourceOverrides ?? {};
	const clientBoundary = options.clientBoundary ?? CLIENT_BOUNDARY;
	const dependencies = options.dependencies ?? NEXT_RUNTIME_DEPENDENCIES;
	const initialCounts = options.initialCounts ?? INITIAL_EXPORT_COUNTS;
	const motion: MotionSeam = options.motion ?? {
		flipConfig,
		fadeConfig,
		scaleConfig,
		sampleKeyframes,
		cubicOut,
		linear,
	};
	const plan: PlanSeam = options.plan ?? { planFlip, planEnter, planUpdate };
	const model: ModelSeam = options.model ?? { insert, reset, sizeOf, isExhausted };
	const r = new Runner(options.quiet ?? false);

	const read = (rel: string): string => {
		const override = overrides[rel];
		return readFileSync(override ? resolve(root, override) : resolve(root, rel), 'utf8');
	};
	const exists = (rel: string): boolean =>
		existsSync(overrides[rel] ? resolve(root, overrides[rel]) : resolve(root, rel));

	const pageFile = join(buildDir, ...SPIKE_PAGE);
	if (!existsSync(pageFile)) {
		console.error(`FATAL: ${relative(root, pageFile)} is missing. Run pnpm build:next first.`);
		return 2;
	}
	const pageHtml = readFileSync(pageFile, 'utf8');

	// -- O: the ported primitives against Svelte's own -----------------------

	r.row('O1', 'flip CSS matches frozen svelte/animate output byte for byte', () => {
		let compared = 0;
		for (const testCase of FLIP_CASES) {
			for (const origin of ORIGINS) {
				const [clientWidth, clientHeight] = testCase.client;
				const zoom = testCase.zoom ?? 1;
				const originPx = `${origin.x * clientWidth}px ${origin.y * clientHeight}px`;
				const oracle = frozen(
					frozen(SVELTE_FLIP_CSS, testCase.name, 'flip case'),
					origin.label,
					'flip origin',
				);
				must(
					oracle.length === SAMPLES.length,
					`${testCase.name} / ${origin.label}: ${oracle.length} frozen samples for ${SAMPLES.length} sample points`,
				);
				const ported = motion.flipConfig(
					{
						clientWidth,
						clientHeight,
						transform: 'none',
						transformOrigin: originPx,
						zoom,
					},
					testCase.from,
					testCase.to,
					{ duration: 220 },
				);
				SAMPLES.forEach(([t, u], index) => {
					const expected = oracle[index];
					const actual = ported.css(t, u);
					must(
						expected === actual,
						`${testCase.name} / ${origin.label} at t=${t}: svelte ${JSON.stringify(expected)} != port ${JSON.stringify(actual)}`,
					);
					compared += 1;
				});
				sameCurve(SVELTE_FLIP_CURVE, ported, `flip ${testCase.name} / ${origin.label}`);
			}
		}
		return `${compared} CSS strings identical across ${FLIP_CASES.length} rect pairs x ${ORIGINS.length} origins x ${SAMPLES.length} samples, easing and delay compared with each`;
	});

	r.row('O2', 'flip duration matches, explicit and distance-derived', () => {
		const results: string[] = [];
		for (const testCase of FLIP_CASES) {
			const [clientWidth, clientHeight] = testCase.client;
			// The case's own zoom, not a hardcoded 1: the default duration is
			// derived from dx and dy, and dx and dy are divided by the zoom, so
			// pinning it here would leave that divisor unexercised on this row.
			const zoom = testCase.zoom ?? 1;
			const metrics = {
				clientWidth,
				clientHeight,
				transform: 'none',
				transformOrigin: '0px 0px',
				zoom,
			};
			eq(
				motion.flipConfig(metrics, testCase.from, testCase.to, { duration: 220 }).duration,
				SVELTE_FLIP_EXPLICIT_DURATION,
				`${testCase.name} explicit duration`,
			);
			// The DEFAULT is the interesting half: it is a function of the
			// distance the formula computed, so a wrong dx/dy shows up here even
			// when both sides are handed the same number for the explicit case.
			const defaultOracle = frozen(SVELTE_FLIP_DEFAULT_DURATION, testCase.name, 'flip case');
			const defaultPorted = motion.flipConfig(metrics, testCase.from, testCase.to);
			eq(defaultPorted.duration, defaultOracle, `${testCase.name} default duration`);
			results.push(`${testCase.name}=${defaultPorted.duration.toFixed(2)}ms`);
		}
		return results.join(', ');
	});

	r.row('O3', 'fade CSS matches frozen svelte/transition output', () => {
		let compared = 0;
		for (const opacity of ['1', '0.6']) {
			// A non-zero delay on one pass, so sameCurve's delay comparison is not
			// 0 === 0 on every call it ever makes.
			const delay = opacity === '1' ? 0 : 40;
			const oracle = frozen(SVELTE_FADE_CSS, opacity, 'fade opacity');
			const ported = motion.fadeConfig(
				{ opacity: Number(opacity), transform: 'none' },
				{ duration: 120, delay },
			);
			SAMPLES.forEach(([t, u], index) => {
				must(
					oracle[index] === ported.css(t, u),
					`fade at opacity ${opacity}, t=${t}: svelte ${JSON.stringify(oracle[index])} != port ${JSON.stringify(ported.css(t, u))}`,
				);
				compared += 1;
			});
			eq(ported.duration, SVELTE_FADE_DURATION, 'fade duration');
			sameCurve(
				frozen(SVELTE_FADE_CURVE, opacity, 'fade opacity'),
				ported,
				`fade at opacity ${opacity}`,
			);
		}
		return `${compared} CSS strings identical, durations equal`;
	});

	r.row('O4', 'scale CSS matches frozen svelte/transition output, whitespace included', () => {
		let compared = 0;
		for (const transform of ['none', 'rotate(3deg)']) {
			const oracle = frozen(SVELTE_SCALE_CSS, transform, 'scale transform');
			const ported = motion.scaleConfig({ opacity: 1, transform }, { duration: 160 });
			SAMPLES.forEach(([t, u], index) => {
				const expected = oracle[index];
				const actual = ported.css(t, u);
				must(
					expected === actual,
					`scale with transform ${transform} at t=${t}: svelte ${JSON.stringify(expected)} != port ${JSON.stringify(actual)}`,
				);
				// Whitespace is part of the comparison on purpose: a normalizing
				// compare is a weaker compare for no gain, and this is the only
				// primitive whose template literal spans lines.
				must(
					expected.includes('\n\t\t\t'),
					'the frozen scale oracle lost its own indentation -- the byte-exact claim would silently become a trivial one',
				);
				compared += 1;
			});
			sameCurve(SVELTE_SCALE_CURVE, ported, `scale with transform ${transform}`);
		}
		return `${compared} CSS strings identical, indentation included, easing and delay compared`;
	});

	r.row('O5', 'easings match frozen svelte/easing samples', () => {
		must(
			SVELTE_EASING.cubicOut.length === 21 && SVELTE_EASING.linear.length === 21,
			'the frozen easing tables are not 21 samples each',
		);
		for (let i = 0; i <= 20; i += 1) {
			const t = i / 20;
			must(
				motion.cubicOut(t) === SVELTE_EASING.cubicOut[i],
				`cubicOut(${t}): svelte ${SVELTE_EASING.cubicOut[i]} != port ${motion.cubicOut(t)}`,
			);
			must(motion.linear(t) === SVELTE_EASING.linear[i], `linear(${t}) differs`);
		}
		return '21 samples each of cubicOut and linear';
	});

	r.row('O6', 'style() declares exactly what the checked css() declares', () => {
		const configs: { label: string; config: MotionConfig }[] = [
			{
				label: 'flip',
				config: motion.flipConfig(
					{
						clientWidth: 96,
						clientHeight: 40,
						transform: 'none',
						transformOrigin: '48px 20px',
						zoom: 1,
					},
					flipCase('moves left and down').from,
					flipCase('moves left and down').to,
					{ duration: 220 },
				),
			},
			{
				label: 'fade',
				config: motion.fadeConfig({ opacity: 1, transform: 'none' }, { duration: 120 }),
			},
			{
				label: 'scale',
				config: motion.scaleConfig({ opacity: 1, transform: 'none' }, { duration: 160 }),
			},
		];
		for (const { label, config } of configs) {
			for (const [t, u] of SAMPLES) {
				const declared = declarations(config.css(t, u));
				const style = config.style(t, u) as Record<string, string | undefined>;
				const projected = Object.fromEntries(
					Object.entries(style)
						.filter(([, value]) => value !== undefined)
						.map(([property, value]) => [hyphenate(property), (value as string).trim()]),
				);
				eq(projected, declared, `${label} at t=${t}: style() vs css()`);
			}
		}
		return 'flip, fade and scale project their checked CSS exactly';
	});

	r.row('O7', "keyframes bake the easing and are sampled at Svelte's rate", () => {
		const details: string[] = [];
		for (const duration of [120, 160, 220]) {
			const config = motion.scaleConfig({ opacity: 1, transform: 'none' }, { duration });
			const frames = motion.sampleKeyframes(config) as Record<string, unknown>[];
			// Svelte's own line, with its own reason: `n` must be an integer or
			// the final value is missed. A fixed sample count would make the
			// port's curve a CLOSER approximation of cubicOut than the oracle's,
			// which is a divergence like any other and invisible in every other
			// row here.
			const expected = Math.max(1, Math.ceil(duration / (1000 / 60))) + 1;
			eq(frames.length, expected, `frame count at ${duration}ms`);
			eq(frames[0].offset, 0, 'first offset');
			eq(frames[frames.length - 1].offset, 1, 'last offset');
			eq(
				frames[0].opacity,
				config.style(config.easing(0), 1 - config.easing(0)).opacity,
				'first frame',
			);
			eq(
				frames[frames.length - 1].opacity,
				config.style(config.easing(1), 1 - config.easing(1)).opacity,
				'last frame',
			);
			// If the curve were handed to the browser instead of sampled, the
			// middle frame would sit at the linear midpoint. cubicOut does not.
			const middle = Number(frames[Math.floor((frames.length - 1) / 2)].opacity);
			must(
				Math.abs(middle - 0.5) > 0.05,
				`the midpoint frame is ${middle}, which is the LINEAR midpoint -- the easing is not baked into the samples`,
			);
			details.push(`${duration}ms=${frames.length} frames`);
		}
		return details.join(', ');
	});

	// -- P: the port roll-call ------------------------------------------------

	r.row('P1', 'every retired Svelte role has its Next port', () => {
		for (const role of PORT_ROLES) {
			must(exists(role.next), `${role.next} is missing (${role.role})`);
		}
		for (const addition of PORT_ADDITIONS) {
			must(exists(addition.path), `${addition.path} is missing (${addition.why})`);
		}
		return `${PORT_ROLES.length} ported roles, ${PORT_ADDITIONS.length} modules with no Svelte counterpart`;
	});

	r.row('P2', "'use client' sits on the React modules and nowhere else", () => {
		for (const [path, expected] of Object.entries(clientBoundary)) {
			const source = read(path);
			const directive = /^\s*(['"])use client\1/.test(source);
			must(
				directive === expected,
				expected
					? `${path} has no 'use client' directive, but it uses React`
					: `${path} carries 'use client', which means something React-shaped reached a module that is supposed to be pure`,
			);
		}
		const pure = Object.entries(clientBoundary).filter(([, value]) => !value);
		return `${Object.keys(clientBoundary).length} modules checked, ${pure.length} of them pure`;
	});

	r.row('P3', 'no Next module imports Svelte', () => {
		const roots = options.scanRoots ?? ['next/src', 'next/app'];
		const offenders: string[] = [];
		let scanned = 0;
		for (const dir of roots) {
			for (const file of walk(resolve(root, dir))) {
				if (file.includes(`${'paraglide'}/`)) continue;
				scanned += 1;
				const source = readFileSync(file, 'utf8');
				if (SVELTE_IMPORT.test(source)) {
					offenders.push(relative(root, file));
				}
			}
		}
		must(
			offenders.length === 0,
			`the ported motion math reaches back into the framework it replaced: ${offenders.join(', ')}`,
		);
		// This row used to also assert that THIS harness imports svelte, as the
		// live oracle. The oracle is frozen now (SVELTE_* tables above) and the
		// package is gone, so only the Next half remains.
		return `${scanned} Next modules scanned, 0 svelte imports`;
	});

	r.row('P4', 'no new runtime dependency was taken for the animation', () => {
		const manifest = JSON.parse(read('next/package.json')) as {
			dependencies: Record<string, string>;
		};
		const actual = Object.keys(manifest.dependencies).sort();
		eq(actual, [...dependencies].sort(), 'next/package.json dependencies');
		return `${actual.length} runtime dependencies, unchanged`;
	});

	// -- R: reduced motion ----------------------------------------------------

	r.row('R1', 'reduced motion is resolved at the call site, not in the hook', () => {
		// codeOnly, not stripComments: string CONTENTS are emptied as well as
		// comments removed. A probe satisfied the positive half below by deleting
		// both ternaries and adding `const NOTE = 'useReducedMotion() and reduced
		// ? 0 : 220 are documented here';` -- prose in quotes reading as
		// behavior, the same self-blindness the C11 A4 row had.
		const code = codeOnly(read('next/src/motion/KeyedMotion.tsx'));
		must(
			!/reduced|prefers-reduced-motion|useReducedMotion/.test(code),
			'KeyedMotion has an opinion about reduced motion; the Svelte template resolves it at the call site and so must the port, or the two places can disagree',
		);
		for (const component of [
			'next/src/components/study/BstTraversalVisualizer.tsx',
			'next/src/components/study/HashMapVisualizer.tsx',
		]) {
			const source = codeOnly(read(component));
			must(/useReducedMotion\(\)/.test(source), `${component} does not read useReducedMotion()`);
			const resolved = [...source.matchAll(/const\s+(\w+)\s*=\s*reduced\s*\?\s*0\s*:/g)].map(
				(match) => match[1],
			);
			must(
				resolved.length > 0,
				`${component} does not resolve a duration to 0 under reduced motion`,
			);
			// And the resolved value actually reaches an attribute. codeOnly
			// empties template literals, so the declaration alone proves nothing:
			// a component could keep `const enterDuration = reduced ? 0 : 120;`
			// and emit `data-motion-enter={'fade:120'}` beside it with every row
			// still green, and nothing in the tsconfig objects to a dead
			// constant. stripComments keeps the interpolation, and a JSX
			// attribute is code either way. Both spellings count: interpolated
			// into a template, as the BST intro is, or passed straight through,
			// as the hash-map flip duration is.
			const withStrings = stripComments(read(component));
			for (const name of resolved) {
				must(
					new RegExp(`data-motion-[a-z-]+=\\{[^}]*\\b${name}\\b`).test(withStrings),
					`${component} declares ${name} from the reduced-motion ternary and never puts it in a motion attribute`,
				);
			}
		}
		return 'both components resolve their own durations; the boundary reads them as data';
	});

	r.row('R2', 'a zero or missing flip duration plans nothing', () => {
		const metrics = {
			clientWidth: 96,
			clientHeight: 40,
			transform: 'none',
			transformOrigin: '48px 20px',
			zoom: 1,
		};
		const from = flipCase('moves left and down').from;
		const to = flipCase('moves left and down').to;
		for (const flipAttribute of ['0', undefined, '', 'not-a-number']) {
			const planned = plan.planFlip({ flip: flipAttribute }, metrics, from, to);
			eq(planned.kind, 'none', `flip attribute ${JSON.stringify(flipAttribute)}`);
		}
		// The positive half. Without it "plans nothing" is satisfied by a
		// function that always plans nothing.
		const real = plan.planFlip({ flip: '220' }, metrics, from, to);
		eq(real.kind, 'flip', 'a real duration with real displacement');
		return 'four falsy durations plan nothing; 220ms with displacement plans a flip';
	});

	r.row('R3', 'an identity flip is skipped, decided from the formula', () => {
		const stationary = flipCase('does not move');
		const metrics = {
			clientWidth: stationary.client[0],
			clientHeight: stationary.client[1],
			transform: 'none',
			transformOrigin: '0px 0px',
			zoom: 1,
		};
		const planned = plan.planFlip({ flip: '220' }, metrics, stationary.from, stationary.to);
		eq(planned.kind, 'none', 'a survivor whose box did not move');
		// Proving the skip is decided from the CSS the formula produced, not
		// from a rect comparison that a formula change could drift away from.
		const config = motion.flipConfig(metrics, stationary.from, stationary.to, { duration: 220 });
		must(
			config.css(0, 1) === config.css(1, 0),
			'the stationary case no longer produces an identical first and last frame, so R3 is asserting something other than identity',
		);
		return `skipped, and every frame is ${JSON.stringify(config.css(0, 1))}`;
	});

	r.row('R4', 'intro specs are parsed, and an unknown one plans nothing', () => {
		const metrics = { opacity: 1, transform: 'none' };
		eq(plan.planEnter({ enter: 'fade:120' }, metrics).kind, 'enter', 'fade:120');
		eq(plan.planEnter({ enter: 'scale:160' }, metrics).kind, 'enter', 'scale:160');
		eq(plan.planEnter({ enter: 'fade:0' }, metrics).kind, 'none', 'fade:0');
		eq(plan.planEnter({ enter: 'fly:200' }, metrics).kind, 'none', 'an intro nobody implemented');
		eq(plan.planEnter({}, metrics).kind, 'none', 'no intro declared');
		// WHICH transition, not merely that there is one. A planEnter returning a
		// fade for every known spec passed this row with only the `fly:200` line
		// doing any work -- and `R4-defect-unknown-intro` IS that substitution,
		// so the control and the row were resting on the same one assertion.
		for (const [spec, duration, expected] of [
			// The REAL configs, not the seam's: planEnter calls the real ones, so
			// comparing against a substituted seam would make an unrelated O-group
			// mutation fail this row too.
			['fade:120', 120, fadeConfig(metrics, { duration: 120 })],
			['scale:160', 160, scaleConfig(metrics, { duration: 160 })],
		] as const) {
			const planned = plan.planEnter({ enter: spec }, metrics);
			must(planned.kind === 'enter', `${spec} did not plan an entry`);
			const config = (planned as { config: MotionConfig }).config;
			eq(config.duration, duration, `${spec}: the parsed duration reaches the config`);
			for (const [t, u] of SAMPLES) {
				eq(config.css(t, u), expected.css(t, u), `${spec} at t=${t}: wrong transition selected`);
			}
		}
		// And the two are distinguishable, so the loop above is not comparing a
		// thing to itself.
		must(
			fadeConfig(metrics, { duration: 120 }).css(0.5, 0.5) !==
				scaleConfig(metrics, { duration: 120 }).css(0.5, 0.5),
			'fade and scale produce the same CSS, so nothing above distinguishes them',
		);
		return 'fade and scale each produce their own transition; fly, zero and absent plan nothing';
	});

	r.row('R5', 'survivors flip and newcomers enter, decided from the two box maps', () => {
		const to = box(40, 10, 64, 28);
		const flipMetrics = {
			clientWidth: 62,
			clientHeight: 26,
			transform: 'none',
			transformOrigin: '0px 0px',
			zoom: 1,
		};
		const transitionMetrics = { opacity: 1, transform: 'none' };
		const reading = (key: string): MotionReading => ({
			key,
			attributes: { flip: '220', enter: 'scale:160' },
			to,
			flipMetrics,
			transitionMetrics,
		});
		const before = new Map([['survivor', box(300, 10, 64, 28)]]);
		const plans = plan.planUpdate(before, [reading('survivor'), reading('newcomer')]);
		eq(
			plans.map((entry) => [entry.key, entry.plan.kind]),
			[
				['survivor', 'flip'],
				['newcomer', 'enter'],
			],
			'classification',
		);
		// The empty map is the mount case: everything is new, nothing flips. It
		// is also the shape a broken snapshot would produce, which is why the
		// row states it rather than assuming it.
		const onMount = plan.planUpdate(new Map(), [reading('survivor'), reading('newcomer')]);
		eq(
			onMount.map((entry) => entry.plan.kind),
			['enter', 'enter'],
			'with no previous boxes, nothing is a survivor',
		);
		return 'a key in both maps flips; a key only in the new one enters';
	});

	// -- M: the hash-map model ------------------------------------------------

	r.row('M1', 'chaining buckets match an independent modulo calculation', () => {
		let state = model.reset('chaining');
		const seen: string[] = [];
		let capacity = INITIAL_CAPACITY;
		const occupied = new Set<number>();
		for (let i = 0; i < INSERT_QUEUE.length; i += 1) {
			const key = INSERT_QUEUE[i];
			// Independently computed, on this side of the harness, from the
			// capacity BEFORE the insert -- which is the capacity the component
			// hashes with.
			const expectedIndex = key % capacity;
			const expectedKind = occupied.has(expectedIndex) ? 'collide' : 'place';
			state = model.insert(state);
			const message = state.message;
			if (message.kind === 'resize') {
				// The insert crossed the load factor and the table rehashed; the
				// place/collide message is overwritten, which M3 checks. Reset
				// the independent model to the new capacity.
				capacity = message.capacity;
				occupied.clear();
				state.chains.forEach((chain, index) => {
					if (chain.length > 0) occupied.add(index);
				});
				seen.push(`resize:${message.capacity}`);
				continue;
			}
			eq(message.kind, expectedKind, `insert ${i} (key ${key}) message kind`);
			must(
				'index' in message && message.index === expectedIndex,
				`insert ${i} (key ${key}) landed at ${JSON.stringify(message)}, not bucket ${expectedIndex}`,
			);
			occupied.add(expectedIndex);
			seen.push(`${expectedKind}:${key}@${expectedIndex}`);
		}
		return seen.join(' ');
	});

	r.row('M2', 'probing landings match an independent linear probe', () => {
		let state = model.reset('probing');
		const table = new Map<number, number>();
		let capacity = INITIAL_CAPACITY;
		const seen: string[] = [];
		for (let i = 0; i < INSERT_QUEUE.length; i += 1) {
			const key = INSERT_QUEUE[i];
			const home = key % capacity;
			let landing = home;
			while (table.has(landing)) landing = (landing + 1) % capacity;
			state = model.insert(state);
			const message = state.message;
			if (message.kind === 'resize') {
				capacity = message.capacity;
				table.clear();
				state.slots.forEach((slot, index) => {
					if (slot !== null) table.set(index, slot.key);
				});
				seen.push(`resize:${message.capacity}`);
				continue;
			}
			if (landing === home) {
				eq(message.kind, 'place', `insert ${i} (key ${key})`);
				must('index' in message && message.index === home, `key ${key} home bucket`);
			} else {
				eq(message.kind, 'probe', `insert ${i} (key ${key})`);
				must(
					message.kind === 'probe' && message.from === home && message.to === landing,
					`key ${key}: expected a probe ${home} -> ${landing}, got ${JSON.stringify(message)}`,
				);
			}
			table.set(landing, key);
			seen.push(`${key}@${landing}`);
		}
		return seen.join(' ');
	});

	r.row('M3', 'the resize fires on the insert that crossed the load factor', () => {
		for (const strategy of ['chaining', 'probing'] as const) {
			let state: TableState = model.reset(strategy);
			let resizedAt = -1;
			let sizeAtResize = -1;
			for (let i = 0; i < INSERT_QUEUE.length; i += 1) {
				const before = state;
				state = model.insert(state);
				if (state.capacity !== before.capacity) {
					resizedAt = i;
					sizeAtResize = model.sizeOf(state);
					break;
				}
			}
			must(resizedAt >= 0, `${strategy}: the table never resized across the whole queue`);
			// The property the shape change was made for: the crossing insert
			// and the resize are the SAME step. A literal React transcription of
			// the Svelte source reads the pre-insert size and resizes one step
			// late, which this catches.
			eq(
				sizeAtResize / INITIAL_CAPACITY > LOAD_FACTOR_LIMIT,
				true,
				`${strategy}: the size at the resize does not exceed the load factor against the pre-resize capacity`,
			);
			eq(
				(sizeAtResize - 1) / INITIAL_CAPACITY > LOAD_FACTOR_LIMIT,
				false,
				`${strategy}: the PREVIOUS insert already exceeded the load factor, so the resize is one step late`,
			);
			eq(state.capacity, RESIZE_CAPACITY, `${strategy}: capacity after the resize`);
			eq(state.cursor, resizedAt + 1, `${strategy}: cursor at the resize`);
		}
		return `both strategies resize on insert 6 of ${INSERT_QUEUE.length}, at size 6 against capacity ${INITIAL_CAPACITY}`;
	});

	r.row('M4', 'a reset restarts the id counter, which the ref placement relies on', () => {
		let state = model.reset('chaining');
		state = model.insert(state);
		const firstIds = state.chains.flat().map((node) => node.id);
		eq(firstIds, ['n0'], 'ids after the first insert');
		state = model.reset('chaining');
		eq(state.capacity, INITIAL_CAPACITY, 'capacity after reset');
		eq(state.cursor, 0, 'cursor after reset');
		eq(state.nodeId, 0, 'id counter after reset');
		eq(model.sizeOf(state), 0, 'size after reset');
		eq(model.isExhausted(state), false, 'exhausted after reset');
		state = model.insert(state);
		eq(
			state.chains.flat().map((node) => node.id),
			['n0'],
			'ids after the first insert following a reset',
		);
		return 'n0 is reused after a reset -- which is why KeyedMotion wraps the outer box, not the grid';
	});

	r.row('M5', 'a rehash mints new chain-node ids, as the Svelte original does', () => {
		let state = model.reset('chaining');
		let before: string[] = [];
		for (let i = 0; i < INSERT_QUEUE.length; i += 1) {
			const previous = state;
			state = model.insert(state);
			if (state.capacity !== previous.capacity) {
				before = previous.chains.flat().map((chainNode) => chainNode.id);
				break;
			}
		}
		must(before.length > 0, 'the table never resized, so this row asserted nothing');
		const after = state.chains.flat().map((chainNode) => chainNode.id);
		// `before` is the state one step earlier, so the rehashed table also
		// holds the key whose insert crossed the load factor.
		eq(after.length, before.length + 1, 'node count across the rehash');
		const survivors = after.filter((id) => before.includes(id));
		eq(survivors, [], 'ids carried across the rehash');
		// WHY THIS IS THE CORRECT BEHAVIOR AND NOT A BUG. Reviewers read this as
		// one: the ids are the React keys and `data-motion-key`, so minting new
		// ones remounts every node and `KeyedMotion` plays the intro rather
		// than a flip. That is exactly what the Svelte original does --
		// `rehash()` in HashMapVisualizer.svelte pushes `{ id: `n${nodeId++}` }`
		// for every rehashed key, so its keyed `{#each}` sees new keys and runs
		// `in:scale`, not `animate:flip`. Preserving ids would make the React
		// version animate a transition the Svelte version has never animated.
		// The row exists so the match is asserted rather than accidental.
		// Frozen fact: `rehash()` at src/lib/components/study/HashMapVisualizer.svelte:88-94
		// (commit 770bc30) pushes `{ id: `n${nodeId++}`, ... }` per rehashed key.
		// The source is retired, so the row no longer re-reads it.
		return `${before.length} ids replaced wholesale, matching the Svelte rehash`;
	});

	r.row('M6', 'collision and probe statuses are set, and cleared on the next insert', () => {
		// The status is what the table actually SHOWS -- a dashed gold box for a
		// collision, a foam one for a probe -- and it is cleared on the next
		// insert so only the newest event is highlighted. A model that reported
		// every node as 'placed' kept M1 and M2 green, because those read the
		// message, not the cell.
		let state = model.reset('chaining');
		let sawCollision = false;
		for (let i = 0; i < INSERT_QUEUE.length; i += 1) {
			const previous = state;
			state = model.insert(state);
			const statuses = state.chains.flat().map((chainNode) => chainNode.status);
			const highlighted = statuses.filter((status) => status !== 'placed');
			must(
				highlighted.length <= 1,
				`insert ${i}: ${highlighted.length} nodes highlighted at once; only the newest event is`,
			);
			if (state.message.kind === 'collide') {
				eq(highlighted, ['collision'], `insert ${i}: a collision is shown as one`);
				sawCollision = true;
			}
			if (state.message.kind === 'place' && previous.chains.flat().length > 0) {
				eq(highlighted, [], `insert ${i}: a plain placement highlights nothing`);
			}
		}
		must(sawCollision, 'no insert in the queue collided, so the chaining half asserted nothing');

		let probing = model.reset('probing');
		let sawProbe = false;
		for (let i = 0; i < INSERT_QUEUE.length; i += 1) {
			probing = model.insert(probing);
			const statuses = probing.slots
				.filter((slot): slot is ProbeSlot => slot !== null)
				.map((slot) => slot.status);
			const highlighted = statuses.filter((status) => status !== 'placed');
			must(
				highlighted.length <= 1,
				`probing insert ${i}: ${highlighted.length} slots highlighted at once`,
			);
			if (probing.message.kind === 'probe') {
				eq(highlighted, ['probed'], `probing insert ${i}: a probe is shown as one`);
				sawProbe = true;
			}
		}
		must(sawProbe, 'no insert in the queue probed, so the probing half asserted nothing');
		return 'collisions and probes are each shown once and cleared by the next insert';
	});

	r.row('M7', 'an insert past the end of the queue reports full and changes nothing', () => {
		for (const strategy of ['chaining', 'probing'] as const) {
			let state = model.reset(strategy);
			for (let i = 0; i < INSERT_QUEUE.length; i += 1) state = model.insert(state);
			eq(model.isExhausted(state), true, `${strategy}: the queue is spent`);
			const before = JSON.stringify(state);
			const after = model.insert(state);
			eq(after.message.kind, 'full', `${strategy}: the message past the end`);
			eq(
				JSON.stringify({ ...after, message: state.message }),
				before,
				`${strategy}: a ninth insert changed the table`,
			);
			// The button is disabled at this point, so this branch is only
			// reachable through the model -- which is exactly why no row reached
			// it until one was written for it.
		}
		return `insert ${INSERT_QUEUE.length + 1} reports full and is a no-op in both strategies`;
	});

	// -- S: the spike route ---------------------------------------------------

	r.row('S1', 'the spike route exports both samples and is not indexable', () => {
		must(
			/name="robots"[^>]*content="[^"]*noindex/.test(pageHtml),
			'the spike route is missing its noindex directive -- scaffolding must not enter the index',
		);
		for (const marker of ['bst-traversal-order', 'hashmap-strategy']) {
			must(pageHtml.includes(marker), `the export does not contain ${marker}`);
		}
		eq(count(pageHtml, 'study-card'), initialCounts.studyCards, 'study cards in the export');
		return `noindex, both selects, ${initialCounts.studyCards} study cards`;
	});

	r.row('S2', 'the export holds the initial state and only the initial state', () => {
		eq(count(pageHtml, 'data-motion-key'), initialCounts.motionKeys, 'motion keys in the export');
		eq(
			count(pageHtml, 'data-motion-flip'),
			initialCounts.flipAttributes,
			'flip attributes in the export',
		);
		// The two numbers are properties of the SVELTE originals' initial state:
		// the BST output starts at step 0, which is one chip, and the hash table
		// starts empty, so no chain node exists to animate. A prerender that
		// showed more would mean the port started somewhere else.
		return `${initialCounts.motionKeys} motion key, ${initialCounts.flipAttributes} flip attributes`;
	});

	r.row('S3', 'the ledger approves exactly one page row for the spike URL', () => {
		const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8')) as {
			url: string;
			field: string;
			fingerprint: string | null;
		}[];
		const entries = ledger.filter((entry) => entry.url === SPIKE_URL);
		eq(entries.length, 1, `ledger entries for ${SPIKE_URL}`);
		eq(entries[0].field, 'page', 'the approved field');
		// Recomputed here rather than read from the comparator: an approval that
		// carries whatever fingerprint the comparator last printed proves only
		// that someone copied a string.
		eq(entries[0].fingerprint, presenceKey(SPIKE_URL, false, true), 'the approved fingerprint');
		return `one page approval at ${entries[0].fingerprint}`;
	});

	r.row('S4', 'the motion hook actually shipped in a chunk the page loads', () => {
		const referenced = referencedAssets(pageHtml);
		const chunkDir = join(buildDir, '_next', 'static', 'chunks');
		must(existsSync(chunkDir), `${relative(root, chunkDir)} is missing`);
		const found = new Map<string, string>();
		for (const file of walk(chunkDir)) {
			const relPath = `/${relative(buildDir, file).split('\\').join('/')}`;
			if (!referenced.has(relPath)) continue;
			const source = readFileSync(file, 'utf8');
			for (const sentinel of HOOK_SENTINELS) {
				if (source.includes(sentinel)) found.set(sentinel, relPath);
			}
		}
		for (const sentinel of HOOK_SENTINELS) {
			must(
				found.has(sentinel),
				`no chunk referenced by the exported page contains ${JSON.stringify(sentinel)} -- the animation code was tree-shaken away, or never reached the bundle, and every other row here would still pass`,
			);
		}
		return [...found].map(([sentinel, file]) => `${sentinel} in ${file}`).join(', ');
	});

	r.row('S5', 'the motion attributes the components emit are the ones the boundary reads', () => {
		// The whole channel between the visualizers and KeyedMotion is three
		// attribute names. Rename `data-motion-flip` to `data-flip` in one place
		// and the flip silently never runs: S2 still counts zero of them, S4's
		// sentinel is still in the bundle, R1's regexes still match, and tsc is
		// happy, because nothing typed the string. So it is checked both ways.
		const boundary = codeOnly(read('next/src/motion/KeyedMotion.tsx'));
		const readNames = [...boundary.matchAll(/dataset\.(motion[A-Za-z]+)/g)].map((match) =>
			match[1].replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
		);
		const readAttributes = new Set(readNames.map((name) => `data-${name}`));
		must(
			readAttributes.size >= 3,
			`the boundary reads only ${readAttributes.size} motion attributes; the contract is key, flip and enter`,
		);

		const components = [
			'next/src/components/study/BstTraversalVisualizer.tsx',
			'next/src/components/study/HashMapVisualizer.tsx',
		];
		const emitted = new Set<string>();
		for (const component of components) {
			// codeOnly on this side too. Reading raw text let a comment mentioning
			// a `data-motion-*` name fail the row -- the same self-blindness R1
			// was changed to close, applied to one side of this row and not the
			// other.
			for (const match of codeOnly(read(component)).matchAll(/(data-motion-[a-z-]+)=/g)) {
				emitted.add(match[1]);
			}
		}
		for (const attribute of readAttributes) {
			must(
				emitted.has(attribute),
				`the boundary reads ${attribute} and no ported component emits it -- the channel is broken in the direction nothing else checks`,
			);
		}
		for (const attribute of emitted) {
			must(
				readAttributes.has(attribute),
				`a component emits ${attribute} and the boundary never reads it, so it does nothing`,
			);
		}
		return `${[...readAttributes].sort().join(', ')} read and emitted on both sides`;
	});

	/*
	 * WHAT NO ROW ABOVE ASSERTS, stated here rather than left to be discovered.
	 *
	 * `KeyedMotion` measures `before` in `getSnapshotBeforeUpdate` and cancels
	 * the previous flips before reading `to` and the computed transform. Both
	 * were defects once and both are lifecycle ORDERING, so deleting either
	 * leaves every row here green -- a text-matching row would only assert that
	 * the file still contains the words. Proving it needs a document: jsdom does
	 * not implement the Web Animations API or layout, so it means a real browser
	 * and a probe that scrolls, updates, and reads the applied transform.
	 *
	 * That is priced work and is named as such in the contract's "not proven"
	 * list. R5 covers what CAN be proven purely: the classification the ordering
	 * feeds.
	 */

	// -- C: typecheck ---------------------------------------------------------

	if (!options.skipTypecheck) {
		r.row('C1', 'tsc passes and the new modules are in the program', () => {
			const project = resolve(root, options.tsconfigProject ?? 'next/tsconfig.json');
			const result = typecheckWithFileList(root, project);
			must(
				result.code === 0,
				`tsc exited ${result.code}:\n${result.output.split('\n').slice(0, 12).join('\n')}`,
			);
			// Exit 0 with the files excluded is the failure this guards: a
			// widened `exclude` keeps tsc green while checking nothing.
			const members = new Set(result.files.map((file) => relative(root, resolve(root, file))));
			const required = [
				...PORT_ROLES.map((role) => role.next),
				...PORT_ADDITIONS.map((addition) => addition.path),
			];
			for (const file of required) {
				must(
					members.has(file),
					`${file} is not in the typecheck program -- tsc is green because it never looked`,
				);
			}
			return `tsc exit 0, ${required.length} ported modules in a program of ${members.size} files`;
		});
	}

	options.onRows?.(r.rows.map((row) => ({ id: row.id, ok: row.ok, detail: row.detail })));
	const failed = r.rows.filter((row) => !row.ok);
	if (!options.quiet) {
		console.log('');
		console.log(
			`Slice 2 motion: ${r.rows.length - failed.length}/${r.rows.length} rows pass across ` +
				'O (oracle parity), P (port roll-call), R (reduced motion), M (model), S (spike route), C (typecheck)',
		);
		if (failed.length > 0) {
			console.log(`FAILED: ${failed.map((row) => row.id).join(', ')}`);
		}
	}
	return failed.length === 0 ? 0 : 1;
}

// ------------------------------------------------------------------- helpers

function count(haystack: string, needle: string): number {
	return haystack.split(needle).length - 1;
}

function hyphenate(property: string): string {
	return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Parse a CSS declaration string into a property map. */
function declarations(css: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const part of css.split(';')) {
		const index = part.indexOf(':');
		if (index === -1) continue;
		const property = part.slice(0, index).trim();
		const value = part.slice(index + 1).trim();
		if (property) out[property] = value;
	}
	return out;
}

/** Strip comments, keeping string contents, so a row cannot match its own prose. */
export function stripComments(source: string): string {
	let out = '';
	let index = 0;
	while (index < source.length) {
		const two = source.slice(index, index + 2);
		if (two === '//') {
			const end = source.indexOf('\n', index);
			index = end === -1 ? source.length : end;
			continue;
		}
		if (two === '/*') {
			const end = source.indexOf('*/', index + 2);
			index = end === -1 ? source.length : end + 2;
			continue;
		}
		const char = source[index];
		if (char === "'" || char === '"' || char === '`') {
			const quote = char;
			out += char;
			index += 1;
			while (index < source.length) {
				out += source[index];
				if (source[index] === '\\') {
					index += 2;
					if (index <= source.length) out += source[index - 1] ?? '';
					continue;
				}
				if (source[index] === quote) {
					index += 1;
					break;
				}
				index += 1;
			}
			continue;
		}
		out += char;
		index += 1;
	}
	return out;
}

/**
 * Comments removed AND string contents emptied.
 *
 * `stripComments` keeps string contents on purpose -- an import scan has to see
 * the real specifier, which is a string literal. Rows that check for BEHAVIOR
 * need the opposite, or a sentence in quotes satisfies them.
 */
export function codeOnly(source: string): string {
	return stripComments(source).replace(
		/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g,
		(match) => `${match[0]}${match[0]}`,
	);
}

export function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else out.push(full);
	}
	return out;
}

/** Assets the exported document actually references. */
export function referencedAssets(html: string): Set<string> {
	const found = new Set<string>();
	for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) found.add(match[1]);
	for (const match of html.matchAll(/"(\/_next\/static\/[^"\\]+)"/g)) found.add(match[1]);
	for (const match of html.matchAll(/\\"(\/_next\/static\/[^"\\]+)\\"/g)) found.add(match[1]);
	return found;
}

/** The comparator's page-presence fingerprint, written independently. */
export function presenceKey(url: string, inBaseline: boolean, inCandidate: boolean): string {
	return createHash('sha256')
		.update([url, 'page', JSON.stringify(inBaseline), JSON.stringify(inCandidate)].join('\u0000'))
		.digest('hex')
		.slice(0, 32);
}

export interface TypecheckResult {
	code: number;
	output: string;
	files: string[];
}

export function typecheckWithFileList(root: string, project: string): TypecheckResult {
	try {
		const output = execFileSync(
			'node',
			[
				join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
				'--noEmit',
				'--listFiles',
				'-p',
				project,
			],
			{ cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
		);
		return { code: 0, output, files: fileList(root, output) };
	} catch (error) {
		const e = error as { status?: number; stdout?: string; stderr?: string };
		const output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
		return { code: e.status ?? 1, output, files: fileList(root, output) };
	}
}

function fileList(root: string, output: string): string[] {
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.startsWith(root) && /\.(ts|tsx|json)$/.test(line));
}

// -------------------------------------------------------------------- the CLI

if (process.argv[1] && process.argv[1].endsWith('assert-slice2-motion.ts')) {
	try {
		process.exit(runAssertions());
	} catch (error) {
		console.error(`FATAL: ${(error as Error).stack ?? String(error)}`);
		process.exit(2);
	}
}
