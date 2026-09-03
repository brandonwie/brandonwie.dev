/**
 * Negative controls for the Slice 2 motion harness.
 *
 *   pnpm migration:spike2:controls
 *
 * `assert-slice2-motion.ts` reports 29 green rows on its first run, which is
 * exactly the shape a harness has when it asserts nothing. This asks the only
 * question that makes the number mean anything: would any of them go red?
 *
 * Two kinds of control, paired per `verification/harness-negative-controls.md`:
 *
 *   DEFECT      induce the exact failure a row claims to catch, and require
 *               that THAT row fails -- not merely that the run exits 1, which
 *               any broken input achieves.
 *   INVARIANCE  make a change the row must NOT care about, and require the
 *               whole harness still exits 0. Without these, "goes red" and
 *               "goes red at everything" are the same measurement.
 *
 * Four injection surfaces, matching where each row gets its evidence:
 *
 *   seams       a substituted motion, plan or model implementation. For the
 *               rows that CALL code -- a source edit cannot reach a module the
 *               harness already imported.
 *   sources     a scratch copy of one file with one mutation, handed over
 *               through `sourceOverrides`. For the rows that READ code.
 *   builds      a dereferenced copy of `next/build` with one file rewritten.
 *               For the rows that read the export.
 *   declared    a replaced constant -- the ledger file, the tsconfig, the
 *               scan roots. For the rows that check a claim against reality.
 *
 * EVERY control is no-op guarded. A source mutation that changed no bytes, a
 * build mutation whose sentinel was never in the file, a seam that happens to
 * behave like the real thing: each turns an invariance control into a tautology
 * and a defect control into a coincidence. The guard runs before the harness
 * does and fails the control outright.
 *
 * The defect seams below are deliberately PLAUSIBLE. `flip` without its scale
 * factor, a keyframe sampler that hands the curve to the browser, a load-factor
 * check taken before the insert instead of after: each is a thing a careful
 * person writes on the way to the right answer, and each is invisible in a
 * screenshot.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
	cubicOut,
	fadeConfig,
	flipConfig,
	frameCount,
	linear,
	sampleKeyframes,
	scaleConfig,
	type MotionBox,
	type MotionConfig,
	type FlipMetrics,
	type FlipParams,
	type TransitionMetrics,
} from '../next/src/motion/svelte-motion.ts';
import {
	planEnter,
	planFlip,
	planUpdate,
	type MotionAttributes,
} from '../next/src/motion/KeyedMotion.tsx';
import {
	LOAD_FACTOR_LIMIT,
	RESIZE_CAPACITY,
	insert,
	isExhausted,
	loadFactor,
	reset,
	sizeOf,
	type TableState,
} from '../next/src/study/hash-map-model.ts';
import {
	NEXT_RUNTIME_DEPENDENCIES,
	SPIKE_URL,
	presenceKey,
	runAssertions,
	walk,
	type ModelSeam,
	type MotionSeam,
	type PlanSeam,
	type RowResult,
	type Slice2Options,
} from './assert-slice2-motion.ts';

const ROOT = resolve(process.cwd());
const SCRATCH = resolve(ROOT, 'tmp/slice2-controls');

const REAL_MOTION: MotionSeam = {
	flipConfig,
	fadeConfig,
	scaleConfig,
	sampleKeyframes,
	cubicOut,
	linear,
};
const REAL_PLAN: PlanSeam = { planFlip, planEnter, planUpdate };
const REAL_MODEL: ModelSeam = { insert, reset, sizeOf, isExhausted };

interface Control {
	id: string;
	kind: 'defect' | 'invariance';
	/** The row this control is about. A defect must flip this row. */
	row: string;
	/**
	 * Other rows this defect is EXPECTED to take down with it, declared rather
	 * than tolerated.
	 *
	 * Some defects legitimately reach more than one row: deleting flip's scale
	 * factor changes dx and dy, and the default duration is derived from them,
	 * so O1 and O2 both go red and neither is a surprise. What must not happen
	 * is a mutation that breaks the named row AND something unrelated, because
	 * then "the row failed" no longer means "the row failed for its own
	 * reason". The runner requires the failing set to equal `row` plus this
	 * list exactly, so every extra failure is either written down here with a
	 * reason or is a control that needs narrowing.
	 */
	alsoFails?: string[];
	what: string;
	/** Build the mutated inputs. Throwing here fails the control, which is what
	 *  a no-op guard does. */
	setup: (dir: string) => Slice2Options;
}

// ------------------------------------------------------------- mutation tools

/** Copy one repo file into scratch with a substitution applied, and PROVE the
 *  substitution changed something. */
function mutateSource(
	dir: string,
	rel: string,
	edit: (text: string) => string,
): Record<string, string> {
	const before = readFileSync(resolve(ROOT, rel), 'utf8');
	const after = edit(before);
	if (after === before) {
		throw new Error(
			`no-op mutation: editing ${rel} changed nothing, so any result is a coincidence`,
		);
	}
	const target = join(dir, rel);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, after);
	return { [rel]: target };
}

/** Dereferenced copy of the export, so a rewrite cannot reach the real build. */
function copyBuild(dir: string): string {
	const copy = join(dir, 'build');
	rmSync(copy, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	cpSync(resolve(ROOT, 'next/build'), copy, { recursive: true, dereference: true });
	return copy;
}

function mutateFile(path: string, edit: (text: string) => string): void {
	const before = readFileSync(path, 'utf8');
	const after = edit(before);
	if (after === before) {
		throw new Error(`no-op mutation: rewriting ${path} changed nothing`);
	}
	writeFileSync(path, after);
}

function motionWith(overrides: Partial<MotionSeam>): MotionSeam {
	return { ...REAL_MOTION, ...overrides };
}

function planWith(overrides: Partial<PlanSeam>): PlanSeam {
	return { ...REAL_PLAN, ...overrides };
}

function modelWith(overrides: Partial<ModelSeam>): ModelSeam {
	return { ...REAL_MODEL, ...overrides };
}

/** Write a scratch ledger with the spike entries replaced. */
function ledgerWith(dir: string, edit: (entries: LedgerEntry[]) => LedgerEntry[]): string {
	const real = JSON.parse(
		readFileSync(resolve(ROOT, 'verification/exception-ledger.json'), 'utf8'),
	) as LedgerEntry[];
	const next = edit(real.map((entry) => ({ ...entry })));
	if (JSON.stringify(next) === JSON.stringify(real)) {
		throw new Error('no-op mutation: the scratch ledger is identical to the real one');
	}
	const target = join(dir, 'ledger.json');
	mkdirSync(dir, { recursive: true });
	writeFileSync(target, `${JSON.stringify(next, null, '\t')}\n`);
	return target;
}

interface LedgerEntry {
	url: string;
	field: string;
	fingerprint: string | null;
	reason?: string;
	approved_by?: string;
	approved_on?: string;
}

/** A scratch copy of next/src carrying one injected import, for P3. */
function scanRootWith(dir: string, injection: string): string[] {
	const copy = join(dir, 'scan');
	rmSync(copy, { recursive: true, force: true });
	mkdirSync(copy, { recursive: true });
	cpSync(resolve(ROOT, 'next/src/motion'), join(copy, 'motion'), {
		recursive: true,
		dereference: true,
	});
	const target = join(copy, 'motion', 'svelte-motion.ts');
	if (injection) mutateFile(target, (text) => `${injection}\n${text}`);
	return [copy];
}

// ------------------------------------------------------------------- controls

const CONTROLS: Control[] = [
	// ------------------------------------------------------------- O group
	{
		id: 'O1-defect-scale-factor',
		kind: 'defect',
		row: 'O1',
		// dx and dy are what the DEFAULT duration is derived from, so a defect in
		// them necessarily reaches O2 as well. Declared rather than tolerated.
		alsoFails: ['O2'],
		what: 'flip drops the client/target scale factor from dx and dy',
		setup: () => ({
			skipTypecheck: true,
			motion: motionWith({
				flipConfig: (metrics, from, to, params) => dropScaleFactor(metrics, from, to, params),
			}),
		}),
	},
	{
		id: 'O1-defect-inverted-dsx',
		kind: 'defect',
		row: 'O1',
		what: 'flip inverts the relative scale, to/from instead of from/to',
		setup: () => ({
			skipTypecheck: true,
			motion: motionWith({
				flipConfig: (metrics, from, to, params) => invertedScale(metrics, from, to, params),
			}),
		}),
	},
	{
		id: 'O2-defect-fixed-default',
		kind: 'defect',
		row: 'O2',
		what: 'flip uses a constant default duration instead of a distance-derived one',
		setup: () => ({
			skipTypecheck: true,
			motion: motionWith({
				flipConfig: (metrics, from, to, params = {}) =>
					flipConfig(metrics, from, to, { ...params, duration: params.duration ?? 400 }),
			}),
		}),
	},
	{
		id: 'O3-defect-assumed-opacity',
		kind: 'defect',
		row: 'O3',
		what: 'fade assumes a target opacity of 1 instead of reading the element',
		setup: () => ({
			skipTypecheck: true,
			motion: motionWith({
				fadeConfig: (_metrics, params) => fadeConfig({ opacity: 1, transform: 'none' }, params),
			}),
		}),
	},
	{
		id: 'O4-defect-normalized-whitespace',
		kind: 'defect',
		row: 'O4',
		what: "scale emits a tidy one-line declaration instead of Svelte's own",
		setup: () => ({
			skipTypecheck: true,
			motion: motionWith({
				scaleConfig: (metrics, params) => {
					const real = scaleConfig(metrics, params);
					return {
						...real,
						css: (t, u) => real.css(t, u).replace(/\s+/g, ' ').trim(),
					};
				},
			}),
		}),
	},
	{
		id: 'O5-defect-cubic-in',
		kind: 'defect',
		row: 'O5',
		what: 'the easing is cubicIn rather than cubicOut',
		setup: () => ({
			skipTypecheck: true,
			motion: motionWith({ cubicOut: (t: number) => t * t * t }),
		}),
	},
	{
		id: 'O6-defect-style-drift',
		kind: 'defect',
		row: 'O6',
		what: 'style() rounds its numbers while css() does not',
		setup: () => ({
			skipTypecheck: true,
			motion: motionWith({
				flipConfig: (metrics, from, to, params) => {
					const real = flipConfig(metrics, from, to, params);
					return {
						...real,
						style: (t, u) => {
							const style = real.style(t, u);
							return {
								transform: style.transform?.replace(/-?\d+\.\d+/g, (n) => Number(n).toFixed(1)),
							};
						},
					};
				},
			}),
		}),
	},
	{
		id: 'O7-defect-deferred-easing',
		kind: 'defect',
		row: 'O7',
		what: 'the keyframes are sampled linearly, leaving the curve to the browser',
		setup: () => ({
			skipTypecheck: true,
			motion: motionWith({
				// The CORRECT frame count, so the row's frame-count assertion is
				// satisfied and this control reaches the one it is named for. With
				// the old fixed 20 it died on the count instead, and the two O7
				// controls were proving the same thing.
				sampleKeyframes: (config: MotionConfig, steps = frameCount(config.duration)) => {
					const frames: Keyframe[] = [];
					for (let i = 0; i <= steps; i += 1) {
						const p = i / steps;
						frames.push({ ...config.style(p, 1 - p), offset: p });
					}
					return frames;
				},
			}),
		}),
	},

	{
		id: 'O1-defect-zoom-ignored',
		kind: 'defect',
		row: 'O1',
		// Same reason as the scale factor: dx and dy feed the default duration.
		alsoFails: ['O2'],
		what: 'flip divides by nothing where Svelte divides by the effective zoom',
		setup: () => ({
			skipTypecheck: true,
			motion: motionWith({
				flipConfig: (metrics, from, to, params) =>
					flipConfig({ ...metrics, zoom: 1 }, from, to, params),
			}),
		}),
	},
	{
		id: 'O1-defect-origin-copy-paste',
		kind: 'defect',
		row: 'O1',
		// Not O2: that row pins the origin at the top-left corner, where ox and
		// oy are both 0 and the slip is invisible.
		what: 'the y origin fraction is computed from the x offset and the width',
		// The classic copy-paste slip. Invisible while every test origin was
		// symmetric, which every one of them was.
		setup: () => ({
			skipTypecheck: true,
			motion: motionWith({
				flipConfig: (metrics, from, to, params) => {
					const [ox] = metrics.transformOrigin.split(' ').map(parseFloat);
					const oy = (ox / metrics.clientWidth) * metrics.clientHeight;
					return flipConfig({ ...metrics, transformOrigin: `${ox}px ${oy}px` }, from, to, params);
				},
			}),
		}),
	},
	{
		id: 'O1-defect-wrong-easing-default',
		kind: 'defect',
		row: 'O1',
		what: "flip defaults to linear where Svelte's flip defaults to cubicOut",
		setup: () => ({
			skipTypecheck: true,
			motion: motionWith({
				flipConfig: (metrics, from, to, params) => ({
					...flipConfig(metrics, from, to, params),
					easing: linear,
				}),
			}),
		}),
	},
	{
		id: 'O3-defect-wrong-easing-default',
		kind: 'defect',
		row: 'O3',
		what: "fade defaults to cubicOut where Svelte's fade defaults to linear",
		setup: () => ({
			skipTypecheck: true,
			motion: motionWith({
				fadeConfig: (metrics, params) => ({ ...fadeConfig(metrics, params), easing: cubicOut }),
			}),
		}),
	},
	{
		id: 'O7-defect-fixed-sample-count',
		kind: 'defect',
		row: 'O7',
		what: 'the keyframes are sampled a fixed 21 times regardless of duration',
		// The port's own earlier behavior, which made its curve a CLOSER
		// approximation of cubicOut than the oracle's -- better, and therefore
		// a divergence.
		setup: () => ({
			skipTypecheck: true,
			motion: motionWith({ sampleKeyframes: (config) => sampleKeyframes(config, 20) }),
		}),
	},
	// ------------------------------------------------------------- P group
	{
		id: 'P1-defect-missing-port',
		kind: 'defect',
		row: 'P1',
		// P2 reads this file for its 'use client' directive, R1 reads it to check
		// the boundary has no reduced-motion branch, and S5 reads it for the
		// attribute names. A missing file cannot be read, so all three go down
		// with it; narrowing the mutation is not possible without stopping it
		// being "the module is missing".
		alsoFails: ['P2', 'R1', 'S5'],
		what: 'a ported module is missing',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: { 'next/src/motion/KeyedMotion.tsx': join(dir, 'gone.ts') },
		}),
	},
	{
		id: 'P2-defect-missing-directive',
		kind: 'defect',
		row: 'P2',
		what: "Stepper loses its 'use client' directive",
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'next/src/components/study/Stepper.tsx', (text) =>
				text.replace("'use client';\n\n", ''),
			),
		}),
	},
	{
		id: 'P2-defect-pure-module-marked',
		kind: 'defect',
		row: 'P2',
		what: 'the pure motion math is marked as a client module',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(
				dir,
				'next/src/motion/svelte-motion.ts',
				(text) => `'use client';\n\n${text}`,
			),
		}),
	},
	{
		id: 'P3-defect-svelte-import',
		kind: 'defect',
		row: 'P3',
		what: 'a Next module reaches back into svelte/easing',
		setup: (dir) => ({
			skipTypecheck: true,
			scanRoots: scanRootWith(dir, "import { cubicOut } from 'svelte/easing';"),
		}),
	},
	{
		id: 'P3-defect-double-quoted-import',
		kind: 'defect',
		row: 'P3',
		what: 'the Svelte import is written with double quotes',
		// The exact shape the original single-quote-only matcher let through.
		setup: (dir) => ({
			skipTypecheck: true,
			scanRoots: scanRootWith(dir, 'import { cubicOut } from "svelte/easing";'),
		}),
	},
	{
		id: 'P3-defect-dynamic-import',
		kind: 'defect',
		row: 'P3',
		what: 'the Svelte import is dynamic rather than static',
		setup: (dir) => ({
			skipTypecheck: true,
			scanRoots: scanRootWith(dir, 'const easings = () => import("svelte/easing");'),
		}),
	},
	{
		id: 'P4-defect-new-dependency',
		kind: 'defect',
		row: 'P4',
		what: 'a layout-animation library is added to the Next dependencies',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'next/package.json', (text) =>
				text.replace('"mermaid":', '"framer-motion": "^12.0.0",\n\t\t"mermaid":'),
			),
		}),
	},

	// ------------------------------------------------------------- R group
	{
		id: 'R1-defect-hook-knows',
		kind: 'defect',
		row: 'R1',
		what: 'the hook grows its own reduced-motion branch',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'next/src/motion/KeyedMotion.tsx', (text) =>
				text.replace(
					"\t\t\tif (plan.kind === 'none') continue;",
					'\t\t\tif (plan.kind === \'none\') continue;\n\t\t\tconst reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;\n\t\t\tif (reduced) continue;',
				),
			),
		}),
	},
	{
		id: 'R1-defect-component-forgets',
		kind: 'defect',
		row: 'R1',
		what: 'a component stops resolving its duration to zero',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(
				dir,
				'next/src/components/study/HashMapVisualizer.tsx',
				(text) =>
					text
						.replace('const flipDuration = reduced ? 0 : 220;', 'const flipDuration = 220;')
						.replace('const enterDuration = reduced ? 0 : 160;', 'const enterDuration = 160;'),
			),
		}),
	},
	{
		id: 'R2-defect-zero-plays',
		kind: 'defect',
		row: 'R2',
		what: 'a zero flip duration still plans an animation',
		setup: () => ({
			skipTypecheck: true,
			plan: planWith({
				// The identity skip is KEPT. Dropping it as well would take R3
				// down too, and a control that trips two rows has not shown
				// either failing for its own reason.
				planFlip: (attributes, metrics, from, to) => {
					const config = flipConfig(metrics, from, to, {
						duration: Number(attributes.flip ?? 0),
					});
					if (config.css(0, 1) === config.css(1, 0)) return { kind: 'none', why: 'identity' };
					return { kind: 'flip', config };
				},
			}),
		}),
	},
	{
		id: 'R3-defect-identity-plays',
		kind: 'defect',
		row: 'R3',
		what: 'a survivor that did not move is animated anyway',
		setup: () => ({
			skipTypecheck: true,
			plan: planWith({
				planFlip: (attributes: MotionAttributes, metrics, from, to) => {
					const duration = Number(attributes.flip ?? 0);
					if (!Number.isFinite(duration) || duration <= 0)
						return { kind: 'none', why: 'no duration' };
					return { kind: 'flip', config: flipConfig(metrics, from, to, { duration }) };
				},
			}),
		}),
	},
	{
		id: 'R4-defect-unknown-intro',
		kind: 'defect',
		row: 'R4',
		what: 'an intro nobody implemented silently becomes a fade',
		setup: () => ({
			skipTypecheck: true,
			plan: planWith({
				planEnter: (attributes: MotionAttributes, metrics: TransitionMetrics) => {
					const spec = attributes.enter;
					if (!spec) return { kind: 'none', why: 'no intro declared' };
					const [, rawDuration] = spec.split(':');
					const duration = Number(rawDuration);
					if (!Number.isFinite(duration) || duration <= 0)
						return { kind: 'none', why: 'no duration' };
					return { kind: 'enter', config: fadeConfig(metrics, { duration }) };
				},
			}),
		}),
	},

	{
		id: 'R4-defect-always-fade',
		kind: 'defect',
		row: 'R4',
		what: 'every recognised intro resolves to a fade',
		// Distinct from R4-defect-unknown-intro: this one PARSES correctly and
		// still plays the wrong transition, which is what the row had not been
		// checking.
		setup: () => ({
			skipTypecheck: true,
			plan: planWith({
				planEnter: (attributes: MotionAttributes, metrics: TransitionMetrics) => {
					const plan = planEnter(attributes, metrics);
					if (plan.kind !== 'enter') return plan;
					return { kind: 'enter', config: fadeConfig(metrics, { duration: plan.config.duration }) };
				},
			}),
		}),
	},
	{
		id: 'R1-defect-ternary-in-a-string',
		kind: 'defect',
		row: 'R1',
		what: 'the reduced-motion ternary is deleted and documented in a string instead',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(
				dir,
				'next/src/components/study/HashMapVisualizer.tsx',
				(text) =>
					text
						.replace('const flipDuration = reduced ? 0 : 220;', 'const flipDuration = 220;')
						.replace(
							'const enterDuration = reduced ? 0 : 160;',
							"const enterDuration = 160;\n\tconst NOTE = 'useReducedMotion() and reduced ? 0 : 220 are documented here';\n\tvoid NOTE;",
						),
			),
		}),
	},
	{
		id: 'P3-defect-oracle-only-in-prose',
		kind: 'defect',
		row: 'P3',
		what: 'the harness stops importing svelte and only mentions it in a comment',
		// The realistic path is someone repointing the oracle at a local stub.
		// The guard passed this until it started reading through stripComments.
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'scripts/assert-slice2-motion.ts', (text) =>
				text
					.replace("import { flip } from 'svelte/animate';\n", '')
					.replace(
						"import { cubicOut as svelteCubicOut, linear as svelteLinear } from 'svelte/easing';\n",
						'',
					)
					.replace("import { fade, scale } from 'svelte/transition';\n", ''),
			),
		}),
	},
	{
		id: 'P2-defect-declared-boundary-unmet',
		kind: 'defect',
		row: 'P2',
		what: 'the declared client-boundary map disagrees with the source',
		// Exercises the `clientBoundary` injection point, which the option's own
		// comment claimed a control proved and none did.
		setup: () => ({
			skipTypecheck: true,
			clientBoundary: { 'next/src/motion/svelte-motion.ts': true },
		}),
	},
	{
		id: 'R1-defect-dead-constant',
		kind: 'defect',
		row: 'R1',
		what: 'the reduced-motion constant is declared and then not used in the attribute',
		// The declaration alone passed once codeOnly started emptying template
		// literals; nothing tied it to the attribute that consumes it, and no
		// tsconfig setting objects to a dead constant.
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(
				dir,
				'next/src/components/study/BstTraversalVisualizer.tsx',
				(text) =>
					text.replace(
						'data-motion-enter={`fade:${enterDuration}`}',
						"data-motion-enter={'fade:120'}",
					),
			),
		}),
	},
	{
		id: 'R5-defect-newcomer-flips',
		kind: 'defect',
		row: 'R5',
		what: 'a key with no previous box is flipped from nowhere instead of entering',
		setup: () => ({
			skipTypecheck: true,
			plan: planWith({
				planUpdate: (before, readings) =>
					readings.map((reading) => ({
						key: reading.key,
						plan: planFlip(
							reading.attributes,
							reading.flipMetrics,
							before.get(reading.key) ?? { left: 0, top: 0, width: 1, height: 1 },
							reading.to,
						),
					})),
			}),
		}),
	},
	{
		id: 'R5-defect-survivor-enters',
		kind: 'defect',
		row: 'R5',
		what: 'the previous boxes are ignored, so every child replays its intro',
		// Exactly what a broken pre-mutation snapshot would look like from the
		// classification's side.
		setup: () => ({
			skipTypecheck: true,
			plan: planWith({
				planUpdate: (_before, readings) =>
					readings.map((reading) => ({
						key: reading.key,
						plan: planEnter(reading.attributes, reading.transitionMetrics),
					})),
			}),
		}),
	},
	// ------------------------------------------------------------- M group
	{
		id: 'M1-defect-wrong-modulus',
		kind: 'defect',
		row: 'M1',
		what: 'the bucket is computed against the post-resize capacity',
		setup: () => ({
			skipTypecheck: true,
			model: modelWith({
				insert: (state) => {
					const next = insert(state);
					if (next.message.kind === 'place' || next.message.kind === 'collide') {
						return {
							...next,
							message: { ...next.message, index: next.message.key % RESIZE_CAPACITY },
						};
					}
					return next;
				},
			}),
		}),
	},
	{
		id: 'M2-defect-no-wraparound',
		kind: 'defect',
		row: 'M2',
		what: 'the linear probe reports its landing without wrapping',
		setup: () => ({
			skipTypecheck: true,
			model: modelWith({
				insert: (state) => {
					const next = insert(state);
					if (next.message.kind === 'probe') {
						return {
							...next,
							message: { ...next.message, to: next.message.from + 1 },
						};
					}
					return next;
				},
			}),
		}),
	},
	{
		id: 'M3-defect-resize-one-late',
		kind: 'defect',
		row: 'M3',
		what: 'the load factor is read before the insert, the literal transcription',
		setup: () => ({
			skipTypecheck: true,
			model: modelWith({ insert: insertResizingLate }),
		}),
	},
	{
		id: 'M4-defect-counter-survives',
		kind: 'defect',
		row: 'M4',
		what: 'a reset keeps the id counter, so ids never repeat',
		setup: () => ({
			skipTypecheck: true,
			model: modelWith({
				reset: (strategy) => ({ ...reset(strategy), nodeId: 99 }),
			}),
		}),
	},

	{
		id: 'M5-defect-ids-survive-rehash',
		kind: 'defect',
		row: 'M5',
		what: 'the rehash carries chain-node ids across, so React keys survive it',
		// This is the change a review suggested as a FIX: keep the ids so the
		// nodes flip instead of re-entering. It is induced here as a defect
		// because the Svelte original mints new ids, so preserving them would
		// animate a transition the Svelte version has never animated.
		setup: () => ({
			skipTypecheck: true,
			model: modelWith({
				insert: (state) => {
					const before = state.chains.flat();
					const next = insert(state);
					if (next.capacity === state.capacity) return next;
					let cursor = 0;
					return {
						...next,
						chains: next.chains.map((chain) =>
							chain.map((chainNode) => {
								const carried = before[cursor];
								cursor += 1;
								return carried ? { ...chainNode, id: carried.id } : chainNode;
							}),
						),
					};
				},
			}),
		}),
	},

	{
		id: 'M6-defect-flat-status',
		kind: 'defect',
		row: 'M6',
		what: 'every node reports as placed, so collisions and probes are never shown',
		setup: () => ({
			skipTypecheck: true,
			model: modelWith({
				insert: (state) => {
					const next = insert(state);
					return {
						...next,
						chains: next.chains.map((chain) =>
							chain.map((chainNode) => ({ ...chainNode, status: 'placed' as const })),
						),
						slots: next.slots.map((slot) =>
							slot === null ? null : { ...slot, status: 'placed' as const },
						),
					};
				},
			}),
		}),
	},
	{
		id: 'M7-defect-inserts-past-the-end',
		kind: 'defect',
		row: 'M7',
		what: 'an insert past the end of the queue reports a placement',
		setup: () => ({
			skipTypecheck: true,
			model: modelWith({
				insert: (state) =>
					isExhausted(state)
						? { ...state, message: { kind: 'place', key: 0, index: 0 } }
						: insert(state),
			}),
		}),
	},
	{
		id: 'M6-defect-status-never-cleared',
		kind: 'defect',
		row: 'M6',
		what: 'a previous collision stays highlighted after the next insert',
		// The "cleared on the next insert" half of the row, which the flat-status
		// control does not reach.
		setup: () => ({
			skipTypecheck: true,
			model: modelWith({
				insert: (state) => {
					const next = insert(state);
					const previous = new Map(
						state.chains.flat().map((chainNode) => [chainNode.id, chainNode.status]),
					);
					return {
						...next,
						chains: next.chains.map((chain) =>
							chain.map((chainNode) => ({
								...chainNode,
								status: previous.get(chainNode.id) ?? chainNode.status,
							})),
						),
					};
				},
			}),
		}),
	},
	{
		id: 'M7-defect-ninth-insert-mutates',
		kind: 'defect',
		row: 'M7',
		what: 'an insert past the end reports full but still advances the table',
		// The "changes nothing" half of the row.
		setup: () => ({
			skipTypecheck: true,
			model: modelWith({
				insert: (state) =>
					isExhausted(state)
						? { ...state, nodeId: state.nodeId + 1, message: { kind: 'full' } }
						: insert(state),
			}),
		}),
	},
	// ------------------------------------------------------------- S group
	{
		id: 'S1-defect-indexable',
		kind: 'defect',
		row: 'S1',
		what: 'the scaffolding route loses its noindex and enters the index',
		setup: (dir) => {
			const build = copyBuild(dir);
			mutateFile(join(build, 'migration-fixture', 'study.html'), (html) =>
				html.replace(/<meta name="robots" content="[^"]*"\/?>/, ''),
			);
			return { skipTypecheck: true, buildDir: build };
		},
	},
	{
		id: 'S2-defect-extra-state',
		kind: 'defect',
		row: 'S2',
		what: "the export prerenders more than the components' initial state",
		setup: (dir) => {
			const build = copyBuild(dir);
			mutateFile(join(build, 'migration-fixture', 'study.html'), (html) =>
				html.replace('data-motion-key=', 'data-motion-key="extra" data-motion-key='),
			);
			return { skipTypecheck: true, buildDir: build };
		},
	},
	{
		id: 'S3-defect-hand-built-fingerprint',
		kind: 'defect',
		row: 'S3',
		what: 'the ledger approves the spike route at a fingerprint nobody computed',
		setup: (dir) => ({
			skipTypecheck: true,
			ledgerFile: ledgerWith(dir, (entries) =>
				entries.map((entry) =>
					entry.url === SPIKE_URL ? { ...entry, fingerprint: 'f'.repeat(32) } : entry,
				),
			),
		}),
	},
	{
		id: 'S3-defect-duplicate-approval',
		kind: 'defect',
		row: 'S3',
		what: 'a second approval for the same route is added',
		setup: (dir) => ({
			skipTypecheck: true,
			ledgerFile: ledgerWith(dir, (entries) => [
				...entries,
				{
					url: SPIKE_URL,
					field: 'text',
					fingerprint: presenceKey(SPIKE_URL, false, true),
					reason: 'a second approval that nothing in the comparator asked for',
				},
			]),
		}),
	},
	{
		id: 'S4-defect-tree-shaken',
		kind: 'defect',
		row: 'S4',
		what: 'the motion code never reaches a chunk the page loads',
		setup: (dir) => {
			const build = copyBuild(dir);
			let rewritten = 0;
			for (const file of walk(join(build, '_next', 'static', 'chunks')).filter((f) =>
				f.endsWith('.js'),
			)) {
				const before = readFileSync(file, 'utf8');
				const after = before
					.split('[data-motion-key]')
					.join('[data-mutated-key]')
					.split('currentCSSZoom')
					.join('mutatedZoom');
				if (after !== before) {
					writeFileSync(file, after);
					rewritten += 1;
				}
			}
			if (rewritten === 0) {
				throw new Error(
					'no-op mutation: no chunk contained the hook sentinels, so S4 was never asserting anything',
				);
			}
			return { skipTypecheck: true, buildDir: build };
		},
	},

	{
		id: 'S5-defect-renamed-attribute',
		kind: 'defect',
		row: 'S5',
		// R1 goes with it, and correctly: renaming the attribute also means the
		// reduced-motion constant no longer reaches a motion attribute, which is
		// the link R1 now checks.
		alsoFails: ['R1'],
		what: 'a component renames data-motion-flip, so the flip silently never runs',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(
				dir,
				'next/src/components/study/HashMapVisualizer.tsx',
				(text) => text.replace('data-motion-flip=', 'data-flip='),
			),
		}),
	},
	{
		id: 'S2-defect-declared-counts-unmet',
		kind: 'defect',
		row: 'S2',
		what: 'the declared initial-export counts disagree with the export',
		// Exercises the `initialCounts` injection point, which the option's own
		// comment claimed a control proved and none did.
		setup: () => ({
			skipTypecheck: true,
			initialCounts: { motionKeys: 4, flipAttributes: 0, studyCards: 2 },
		}),
	},
	// ------------------------------------------------------------- C group
	{
		id: 'C1-defect-widened-exclude',
		kind: 'defect',
		row: 'C1',
		what: 'the tsconfig excludes the ported modules and stays green',
		setup: (dir) => {
			const target = join(dir, 'tsconfig.json');
			mkdirSync(dir, { recursive: true });
			const real = JSON.parse(readFileSync(resolve(ROOT, 'next/tsconfig.json'), 'utf8')) as Record<
				string,
				unknown
			>;
			const widened = {
				...real,
				include: ['next-env.d.ts', 'src/shell/**/*.ts', 'src/shell/**/*.tsx'],
				exclude: ['node_modules', 'build', 'src/motion', 'src/study', 'src/components/study'],
			};
			writeFileSync(target, `${JSON.stringify(widened, null, '\t')}\n`);
			return { tsconfigProject: target };
		},
	},

	// ------------------------------------------------------- invariance rows
	{
		id: 'I1-baseline',
		kind: 'invariance',
		row: '-',
		what: 'the unmutated harness passes every row',
		setup: () => ({ skipTypecheck: true }),
	},
	{
		id: 'I2-comment-only',
		kind: 'invariance',
		row: '-',
		what: 'a comment mentioning reduced motion does not satisfy or break R1',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'next/src/motion/KeyedMotion.tsx', (text) =>
				text.replace(
					"'use client';",
					"'use client';\n\n// A note about reduced motion that is prose, not behavior.",
				),
			),
		}),
	},
	{
		id: 'I3-untouched-build-copy',
		kind: 'invariance',
		row: '-',
		what: 'reading a copy of the export rather than the export changes nothing',
		setup: (dir) => ({ skipTypecheck: true, buildDir: copyBuild(dir) }),
	},
	{
		id: 'I4-dependency-order',
		kind: 'invariance',
		row: '-',
		what: 'the dependency list is compared as a set, not in file order',
		setup: () => ({
			skipTypecheck: true,
			dependencies: [...NEXT_RUNTIME_DEPENDENCIES].reverse(),
		}),
	},
	{
		id: 'I5-rewritten-seams',
		kind: 'invariance',
		row: '-',
		what: 'equivalent implementations behind the seams change nothing',
		// `motionWith({})` returns the same function objects the harness builds
		// by default, so it was I1 with extra spreads. These are wrappers with
		// different identities and, for the model, a different object graph --
		// which is what "the seam is not itself the defect" has to mean.
		setup: () => ({
			skipTypecheck: true,
			motion: motionWith({
				flipConfig: (metrics, from, to, params) => flipConfig(metrics, from, to, params),
				fadeConfig: (metrics, params) => fadeConfig(metrics, params),
				scaleConfig: (metrics, params) => scaleConfig(metrics, params),
				sampleKeyframes: (config, steps) =>
					steps === undefined ? sampleKeyframes(config) : sampleKeyframes(config, steps),
				cubicOut: (t) => cubicOut(t),
				linear: (t) => linear(t),
			}),
			plan: planWith({
				planFlip: (attributes, metrics, from, to) => planFlip(attributes, metrics, from, to),
				planEnter: (attributes, metrics) => planEnter(attributes, metrics),
			}),
			model: modelWith({
				insert: (state) => JSON.parse(JSON.stringify(insert(state))) as TableState,
				reset: (strategy) => JSON.parse(JSON.stringify(reset(strategy))) as TableState,
			}),
		}),
	},
	{
		id: 'I6-directive-in-a-comment',
		kind: 'invariance',
		row: '-',
		what: "a 'use client' string inside a comment is not read as a directive",
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(
				dir,
				'next/src/study/hash-map-model.ts',
				(text) => `// This module is deliberately not a 'use client' module.\n${text}`,
			),
		}),
	},
	{
		id: 'I7-clean-scan-copy',
		kind: 'invariance',
		row: '-',
		what: 'scanning a copy with no injected import still passes P3',
		setup: (dir) => ({ skipTypecheck: true, scanRoots: scanRootWith(dir, '') }),
	},
	{
		id: 'I8-unrelated-ledger-entry',
		kind: 'invariance',
		row: '-',
		what: 'an approval for a different route does not disturb S3',
		setup: (dir) => ({
			skipTypecheck: true,
			ledgerFile: ledgerWith(dir, (entries) => [
				...entries,
				{
					url: '/some/other/route',
					field: 'page',
					fingerprint: presenceKey('/some/other/route', false, true),
					reason: 'an approval about a route this harness has no opinion on',
				},
			]),
		}),
	},
	{
		id: 'I10-attribute-named-in-a-comment',
		kind: 'invariance',
		row: '-',
		what: 'a comment mentioning a data-motion attribute does not disturb S5',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(
				dir,
				'next/src/components/study/BstTraversalVisualizer.tsx',
				(text) =>
					text.replace(
						"'use client';",
						"'use client';\n\n// An earlier draft used data-motion-ghost= here.",
					),
			),
		}),
	},
	{
		id: 'I9-unwidened-tsconfig-copy',
		kind: 'invariance',
		row: '-',
		what: 'typechecking through a copied tsconfig is green when nothing is widened',
		setup: (dir) => {
			const target = join(dir, 'tsconfig.json');
			mkdirSync(dir, { recursive: true });
			const real = JSON.parse(readFileSync(resolve(ROOT, 'next/tsconfig.json'), 'utf8')) as Record<
				string,
				unknown
			>;
			// `include` and `exclude` are resolved against the config that
			// DECLARES them, so a scratch config that only extends the real one
			// inherits next/'s file set at next/'s paths. Copying those arrays
			// into the scratch file would re-root them here and check nothing --
			// which is the failure C1-defect-widened-exclude induces on purpose.
			//
			// An earlier revision wrote this scratch file and then returned the
			// REAL config path, so I9 typechecked the original and could not have
			// noticed if the copy were broken. It was a tautology dressed as an
			// invariance control.
			void real;
			writeFileSync(
				target,
				`${JSON.stringify({ extends: resolve(ROOT, 'next/tsconfig.json') }, null, '\t')}\n`,
			);
			return { tsconfigProject: target };
		},
	},
];

// -------------------------------------------------------- defect seam bodies

/**
 * `flip` without the `sx`/`sy` factors.
 *
 * They only bite when the element's own client box differs from the box it is
 * animating to — a shrinking or growing node — so a run over stationary,
 * same-size rects would never notice. That is precisely why O1's case list has
 * a growing and a shrinking pair in it.
 */
function dropScaleFactor(
	metrics: FlipMetrics,
	from: MotionBox,
	to: MotionBox,
	params: FlipParams = {},
): MotionConfig {
	const { delay = 0, duration = (d: number) => Math.sqrt(d) * 120, easing = cubicOut } = params;
	const transform = metrics.transform === 'none' ? '' : metrics.transform;
	const origin = metrics.transformOrigin.split(' ').map(parseFloat);
	const ox = origin[0] / metrics.clientWidth;
	const oy = origin[1] / metrics.clientHeight;
	const dx = from.left + from.width * ox - (to.left + to.width * ox);
	const dy = from.top + from.height * oy - (to.top + to.height * oy);
	const dsx = from.width / to.width;
	const dsy = from.height / to.height;
	return {
		delay,
		duration: typeof duration === 'function' ? duration(Math.sqrt(dx * dx + dy * dy)) : duration,
		easing,
		css: (t, u) =>
			`transform: ${transform} translate(${u * dx}px, ${u * dy}px) scale(${t + u * dsx}, ${t + u * dsy});`,
		style: (t, u) => ({
			transform: `${transform} translate(${u * dx}px, ${u * dy}px) scale(${t + u * dsx}, ${t + u * dsy})`,
		}),
	};
}

/** `flip` with the relative scale the wrong way round. */
function invertedScale(
	metrics: FlipMetrics,
	from: MotionBox,
	to: MotionBox,
	params: FlipParams = {},
): MotionConfig {
	const real = flipConfig(metrics, from, to, params);
	const swapped = flipConfig(metrics, to, from, params);
	const swapScale = (text: string, t: number, u: number): string =>
		text.replace(/scale\([^)]*\)/, swapped.css(t, u).match(/scale\([^)]*\)/)![0]);
	// `style` is patched the same way as `css` on purpose. Patching only `css`
	// would ALSO fail O6 -- the row that asserts the two agree -- and a control
	// that trips two rows has not shown either of them failing for its own
	// reason. This defect is the oracle mismatch and nothing else.
	return {
		...real,
		css: (t, u) => swapScale(real.css(t, u), t, u),
		style: (t, u) => {
			const style = real.style(t, u);
			return style.transform === undefined
				? style
				: { ...style, transform: swapScale(style.transform, t, u) };
		},
	};
}

/**
 * The literal React transcription of the Svelte insert step: read the load
 * factor from the state as it was BEFORE the insert.
 *
 * In Svelte this is what the code LOOKS like, and it is correct there, because
 * `size` is a `$derived` and recomputes on read. Written the same way over
 * React state it resizes one insert late.
 */
function insertResizingLate(state: TableState): TableState {
	if (isExhausted(state)) return { ...state, message: { kind: 'full' } };
	const wouldResize = loadFactor(state) > LOAD_FACTOR_LIMIT;
	const inserted = insert({ ...state, capacity: state.capacity });
	if (!wouldResize && inserted.capacity !== state.capacity) {
		// Undo the timely resize, leaving the table at its old capacity: the
		// defect this control exists to induce.
		const keys = inserted.chains.flat().map((node) => node.key);
		const chains = Array.from({ length: state.capacity }, () => [] as (typeof inserted.chains)[0]);
		let nodeId = 0;
		for (const key of keys) {
			chains[key % state.capacity].push({ id: `n${nodeId++}`, key, status: 'placed' });
		}
		const slots: TableState['slots'] = Array.from({ length: state.capacity }, () => null);
		for (const slot of inserted.slots) {
			if (slot === null) continue;
			let probe = slot.key % state.capacity;
			while (slots[probe] !== null) probe = (probe + 1) % state.capacity;
			slots[probe] = { key: slot.key, status: 'placed' };
		}
		return { ...inserted, capacity: state.capacity, nodeId, chains, slots };
	}
	return inserted;
}

// --------------------------------------------------------------- the runner

export function runControls(filter?: string): number {
	rmSync(SCRATCH, { recursive: true, force: true });
	const selected = filter ? CONTROLS.filter((c) => c.id.includes(filter)) : CONTROLS;
	const failures: string[] = [];
	let passed = 0;

	for (const control of selected) {
		const dir = join(SCRATCH, control.id);
		let verdict: string;
		try {
			mkdirSync(dir, { recursive: true });
			let rows: RowResult[] = [];
			const options = control.setup(dir);
			const code = runAssertions({
				...options,
				quiet: true,
				onRows: (r) => {
					rows = r;
				},
			});

			if (control.kind === 'defect') {
				const target = rows.find((r) => r.id === control.row);
				const failedRows = rows
					.filter((r) => !r.ok)
					.map((r) => r.id)
					.sort();
				const declared = [control.row, ...(control.alsoFails ?? [])].sort();
				if (code === 0)
					verdict = `the harness still exited 0: ${control.what} was not caught by ANY row`;
				else if (!target) verdict = `row ${control.row} did not run at all`;
				else if (target.ok) {
					verdict = `the run exited ${code}, but row ${control.row} PASSED; the rows that failed were [${failedRows.join(', ')}]. A control that trips a different row proves a different thing.`;
				} else if (JSON.stringify(failedRows) !== JSON.stringify(declared)) {
					verdict = `row ${control.row} failed, but the failing set was [${failedRows.join(', ')}] against a declared [${declared.join(', ')}]. An undeclared extra failure means the mutation reached further than the row it is named for, so "this row fails for its own reason" is not what was shown.`;
				} else verdict = 'ok';
			} else {
				const broken = rows.filter((r) => !r.ok);
				verdict =
					code === 0
						? 'ok'
						: `the harness exited ${code} on a change it must not care about; rows [${broken.map((r) => `${r.id}: ${r.detail}`).join(' | ')}]`;
			}
		} catch (error) {
			verdict = `control setup or run threw: ${(error as Error).message}`;
		}

		if (verdict === 'ok') {
			passed += 1;
			console.log(`PASS ${control.kind.padEnd(10)} ${control.id.padEnd(32)} ${control.what}`);
		} else {
			failures.push(`${control.id}: ${verdict}`);
			console.error(`FAIL ${control.kind.padEnd(10)} ${control.id.padEnd(32)} ${control.what}`);
			console.error(`       ${verdict}`);
		}
		rmSync(dir, { recursive: true, force: true });
	}

	rmSync(SCRATCH, { recursive: true, force: true });
	const defects = selected.filter((c) => c.kind === 'defect').length;
	console.log('');
	console.log(
		`SLICE 2 CONTROLS: ${passed}/${selected.length} (${defects} defect, ${selected.length - defects} invariance)`,
	);
	if (failures.length) {
		console.error(`${failures.length} control(s) failed:`);
		for (const line of failures) console.error(`  ${line}`);
		return 1;
	}
	console.log(
		'  every Slice 2 row above has now been shown to fail for its own reason, and only for it.',
	);
	return 0;
}

if (process.argv[1] && process.argv[1].endsWith('assert-slice2-motion-controls.ts')) {
	try {
		process.exit(runControls(process.argv[2]));
	} catch (error) {
		console.error(`FATAL: ${(error as Error).stack ?? String(error)}`);
		process.exit(2);
	}
}
