/**
 * Negative controls for `assert-slice2-gsap-palette.ts`.
 *
 *   pnpm migration:gsap-palette:controls
 *
 * A row that has never been shown to fail proves nothing. Every row in the
 * assertion suite gets at least one DEFECT control here — an injected fault
 * that must turn exactly that row red — and the properties the suite must NOT
 * care about get INVARIANCE controls that must leave it green.
 *
 * Two rules the runner enforces, both learned in PR 2:
 *
 *   1. A defect must fail its NAMED row, not merely make the run exit 1. A
 *      mutation that trips a different row proves a different thing.
 *   2. The failing set must equal the named row plus any `alsoFails` declared
 *      alongside it, exactly. Some faults legitimately reach two rows — a
 *      dropped post cap changes both the count and which posts survive — and
 *      those are written down with a reason. An undeclared extra failure means
 *      the mutation reached further than the row it is named for, so "the row
 *      failed for its own reason" was not what was shown.
 *
 * Faults are injected three ways, never by editing the repo:
 *
 *   seams       a substituted pure function, for the rows that are arithmetic
 *   sources     a scratch copy of one file with one mutation, for source-shape
 *   build       a dereferenced copy of `next/build` with one rewrite, for the
 *               rows that read the export
 *
 * Every mutation helper proves it changed something before the run starts. A
 * substitution that matched nothing would turn a defect control into a
 * coincidence and an invariance control into a tautology.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
	runAssertions,
	type ChordSeam,
	type ItemSeam,
	type ListSeam,
	type RowResult,
	type Slice2GsapOptions,
	type SlideSeam,
} from './assert-slice2-gsap-palette';

import { FLIP_OPTIONS, initialSets, planStep, revealTweens } from '../next/src/deck/slide-plan';
import {
	buildActionItems,
	buildNavItems,
	buildPaletteItems,
	isKorean,
	localePath,
	postToItem,
} from '../next/src/palette/items';
import { highlightMatches } from '../next/src/palette/fuzzy';
import { defaultResults, groupResults, startsSection } from '../next/src/palette/results';
import {
	isPaletteChord,
	isSearchChord,
	moveSelection,
	planDialogKey,
	planGlobalChord,
	planInputKey,
	searchHref,
	searchSuppressed,
} from '../next/src/palette/shortcuts';

const ROOT = resolve(process.cwd());
const SCRATCH = join(ROOT, 'node_modules', '.cache', 'slice2-gsap-controls');

const REAL_SLIDE: SlideSeam = { planStep, revealTweens, initialSets, flipOptions: FLIP_OPTIONS };
const REAL_CHORD: ChordSeam = {
	planGlobalChord,
	planInputKey,
	planDialogKey,
	moveSelection,
	isPaletteChord,
	isSearchChord,
	searchSuppressed,
	searchHref,
};
const REAL_LIST: ListSeam = { defaultResults, groupResults, startsSection, highlightMatches };
const REAL_ITEMS: ItemSeam = {
	buildNavItems,
	buildActionItems,
	buildPaletteItems,
	postToItem,
	localePath,
	isKorean,
};

interface Control {
	id: string;
	kind: 'defect' | 'invariance';
	/** The row this control is about. A defect must flip this row. */
	row: string;
	/** Other rows this defect is EXPECTED to take down, declared not tolerated. */
	alsoFails?: string[];
	what: string;
	/** Build the mutated inputs. Throwing here fails the control, which is what
	 *  a no-op guard does. */
	setup: (dir: string) => Slice2GsapOptions;
}

// ------------------------------------------------------------- mutation tools

function slideWith(overrides: Partial<SlideSeam>): SlideSeam {
	return { ...REAL_SLIDE, ...overrides };
}
function chordWith(overrides: Partial<ChordSeam>): ChordSeam {
	return { ...REAL_CHORD, ...overrides };
}
function listWith(overrides: Partial<ListSeam>): ListSeam {
	return { ...REAL_LIST, ...overrides };
}
function itemsWith(overrides: Partial<ItemSeam>): ItemSeam {
	return { ...REAL_ITEMS, ...overrides };
}

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
	if (after === before) throw new Error(`no-op mutation: rewriting ${path} changed nothing`);
	writeFileSync(path, after);
}

interface LedgerEntry {
	url: string;
	field: string;
	fingerprint: string | null;
	reason?: string;
	approved_by?: string;
	approved_on?: string;
}

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

/** A scratch copy of a Next source root carrying one injected import, for P3. */
function scanRootWith(dir: string, injection: string): string[] {
	const copy = join(dir, 'scan');
	rmSync(copy, { recursive: true, force: true });
	mkdirSync(copy, { recursive: true });
	cpSync(resolve(ROOT, 'next/src/palette'), join(copy, 'palette'), {
		recursive: true,
		dereference: true,
	});
	if (injection) mutateFile(join(copy, 'palette', 'shortcuts.ts'), (t) => `${injection}\n${t}`);
	return [copy];
}

/** A tsconfig that only extends the real one, so a control can widen exactly
 *  one field without silently inheriting nothing. */
function tsconfigWith(dir: string, patch: Record<string, unknown>): string {
	const target = join(dir, 'tsconfig.control.json');
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		target,
		`${JSON.stringify({ extends: resolve(ROOT, 'next/tsconfig.json'), ...patch }, null, '\t')}\n`,
	);
	// Returning the scratch path rather than the real one is the point: an
	// earlier version of this helper typechecked the REAL project and the
	// control passed for the wrong reason.
	return target;
}

/** A file that does not typecheck, so the `tsc exits 0` half of C1 has a control. */
function brokenProgram(dir: string): string {
	const target = join(dir, 'broken.ts');
	mkdirSync(dir, { recursive: true });
	writeFileSync(target, 'export const broken: number = "not a number";\n');
	return target;
}

/** A single trivially valid file, so a scratch program can be legally empty. */
function emptyProgram(dir: string): string {
	const target = join(dir, 'nothing.ts');
	mkdirSync(dir, { recursive: true });
	writeFileSync(target, 'export {};\n');
	return target;
}

/** One `find` that must match, so a build rewrite cannot be a no-op. */
function rewriteExport(copy: string, page: string, find: string | RegExp, replace: string): void {
	mutateFile(join(copy, 'migration-fixture', page), (html) => {
		const next = html.replace(find, replace);
		if (next === html) throw new Error(`no-op export rewrite in ${page}: ${String(find)}`);
		return next;
	});
}

// ------------------------------------------------------------------- controls

const CONTROLS: Control[] = [
	// ---- T: the tween arithmetic
	{
		id: 'T1-defect-drifted-multiplier',
		kind: 'defect',
		row: 'T1',
		what: 'the ported delay ladder drifts from the Svelte one',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/deck/slide-plan.ts', (text) =>
				text.replace('DURATION * 1.05 * d', 'DURATION * 1.5 * d'),
			),
		}),
	},
	{
		id: 'T1-defect-selector-dropped',
		kind: 'defect',
		row: 'T1',
		what: 'a whole reveal is missing from the port',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/deck/slide-plan.ts', (text) =>
				text.replace("selector: '.chip'", "selector: '.chips'"),
			),
		}),
	},
	{
		id: 'T2-defect-wrong-stagger',
		kind: 'defect',
		row: 'T2',
		what: 'the chip stagger is an order of magnitude too slow',
		setup: () => ({
			slide: slideWith({
				revealTweens: (want, still) =>
					revealTweens(want, still).map((tween) =>
						tween.selector === '.chip' && !still
							? { ...tween, vars: { ...tween.vars, stagger: 0.6 } }
							: tween,
					),
			}),
		}),
	},
	{
		id: 'T3-defect-delay-on-the-way-out',
		kind: 'defect',
		row: 'T3',
		what: 'hiding waits as long as showing does',
		setup: () => ({
			slide: slideWith({
				revealTweens: (want, still) =>
					revealTweens(want, still).map((tween) =>
						want ? tween : { ...tween, vars: { ...tween.vars, delay: 0.36 } },
					),
			}),
		}),
	},
	{
		id: 'T4-defect-dropped-reduced-motion-factor',
		kind: 'defect',
		row: 'T4',
		what: 'one reveal ignores the OS reduced-motion setting',
		setup: () => ({
			slide: slideWith({
				// The exact silent defect group T exists for: two of the three
				// reveals honor `still`, the third does not.
				revealTweens: (want, still) =>
					revealTweens(want, still).map((tween) =>
						tween.selector === '.note'
							? { ...tween, vars: { ...tween.vars, duration: 0.45 } }
							: tween,
					),
			}),
		}),
	},
	{
		id: 'T4-defect-collapsed-destination',
		kind: 'defect',
		row: 'T4',
		what: 'reduced motion collapses the destination as well as the timing',
		setup: () => ({
			// A still slide must still ARRIVE, in one frame. Collapsing the
			// destination alongside the timing is the opposite failure to
			// dropping `d`, and the row has to catch both directions.
			slide: slideWith({
				revealTweens: (want, still) =>
					revealTweens(want, still).map((tween) =>
						still ? { ...tween, vars: { ...tween.vars, autoAlpha: 0 } } : tween,
					),
			}),
		}),
	},
	{
		id: 'T5-defect-reordered-ladder',
		kind: 'defect',
		row: 'T5',
		alsoFails: ['T2'],
		what: 'the notes arrive before the move they are commenting on',
		setup: () => ({
			slide: slideWith({
				revealTweens: (want, still) => {
					const tweens = revealTweens(want, still);
					const delays = tweens.map((tween) => tween.vars.delay).reverse();
					return tweens.map((tween, index) => ({
						...tween,
						vars: { ...tween.vars, delay: delays[index] },
					}));
				},
			}),
		}),
	},
	{
		id: 'T6-defect-no-initial-offset',
		kind: 'defect',
		row: 'T6',
		what: 'the notes have nowhere to travel from',
		setup: () => ({
			slide: slideWith({
				initialSets: () => initialSets().map((set) => ({ ...set, vars: { autoAlpha: 0 } })),
			}),
		}),
	},
	{
		id: 'T7-defect-svelte-flip-call-changed',
		kind: 'defect',
		row: 'T7',
		what: 'the Svelte side of the Flip options comparison drifted',
		setup: (dir) => ({
			sourceOverrides: mutateSource(
				dir,
				'src/routes/talks/my-career/slides/AccountSeparationSlide.svelte',
				(text) => text.replace('absolute: true', 'absolute: false'),
			),
		}),
	},
	{
		id: 'T8-defect-hardcoded-duration',
		kind: 'defect',
		row: 'T8',
		what: 'the component re-spells the deck duration instead of importing it',
		setup: (dir) => ({
			sourceOverrides: mutateSource(
				dir,
				'next/src/components/deck/AccountSeparationSlide.tsx',
				(text) =>
					text
						.replace('const LAST = 0;', 'const LAST = 0;')
						.replace('const NOTES = [', 'const LOCAL_DURATION = 0.45;\nconst NOTES = ['),
			),
		}),
	},

	{
		id: 'T8-defect-planner-referenced-but-not-called',
		kind: 'defect',
		row: 'T8',
		what: 'the component names the planner in a type position and never calls it',
		setup: (dir) => ({
			// `ReturnType<typeof revealTweens>` satisfies a bare-identifier check
			// while the component computes nothing, which is why the row matches a
			// call form now.
			sourceOverrides: mutateSource(
				dir,
				'next/src/components/deck/AccountSeparationSlide.tsx',
				(text) =>
					text.replace(
						'for (const tween of revealTweens(want, still)) {',
						'for (const tween of [] as ReturnType<typeof revealTweens>) {',
					),
			),
		}),
	},
	{
		id: 'T7-defect-absolute-dropped-in-the-port',
		kind: 'defect',
		row: 'T7',
		what: 'the ported Flip options stop telling Flip the node changes parent',
		setup: () => ({
			// Without `absolute: true` Flip cannot animate a node between two
			// different parents -- the entire move this slide performs. The tween
			// still runs and the node jumps.
			slide: slideWith({ flipOptions: { ...FLIP_OPTIONS, absolute: false } }),
		}),
	},

	// ---- N: step planning
	{
		id: 'N1-defect-runs-before-gsap-loads',
		kind: 'defect',
		row: 'N1',
		what: 'the slide animates before its initial state was applied',
		setup: () => ({
			slide: slideWith({
				planStep: (input) => planStep({ ...input, ready: true }),
			}),
		}),
	},
	{
		id: 'N2-defect-no-applied-guard',
		kind: 'defect',
		row: 'N2',
		what: 'a re-entered effect re-runs the whole sequence',
		setup: () => ({
			// This is what a React 19 StrictMode double-invoke does to a slide
			// with no guard: the second invocation captures a Flip state against
			// a DOM the first invocation already moved.
			slide: slideWith({
				planStep: (input) => planStep({ ...input, applied: -1 }),
			}),
		}),
	},
	{
		id: 'N3-defect-never-captures',
		kind: 'defect',
		row: 'N3',
		alsoFails: ['N4'],
		what: 'no transition ever takes a Flip state',
		setup: () => ({
			// Declared: N3 and N4 are the same property in both directions, so a
			// capture that never happens takes both.
			slide: slideWith({
				planStep: (input) => {
					const plan = planStep(input);
					return plan.kind === 'toggle' ? { ...plan, capture: false } : plan;
				},
			}),
		}),
	},
	{
		id: 'N4-defect-back-crossing-lost',
		kind: 'defect',
		row: 'N4',
		what: 'resetting to step 0 does not plan the move back',
		setup: () => ({
			// N4 was the one row in this suite with no control of its own; it rode
			// on N3's `alsoFails` and so had never been shown to fail for its own
			// reason. Its distinguishing assertion is `want === false` on the back
			// crossing, which N3's capture-only mutation never touches.
			slide: slideWith({
				planStep: (input) => {
					const plan = planStep(input);
					return plan.kind === 'toggle' ? { ...plan, want: true } : plan;
				},
			}),
		}),
	},
	{
		id: 'N5-defect-captures-when-still',
		kind: 'defect',
		row: 'N5',
		what: 'a reduced-motion slide animates the move anyway',
		setup: () => ({
			slide: slideWith({
				planStep: (input) => {
					const plan = planStep(input);
					return plan.kind === 'toggle' ? { ...plan, capture: true } : plan;
				},
			}),
		}),
	},
	{
		id: 'N6-defect-toggles-every-step',
		kind: 'defect',
		row: 'N6',
		what: 'a step that does not cross the boundary moves the DOM anyway',
		setup: () => ({
			slide: slideWith({
				planStep: (input) => {
					const plan = planStep(input);
					return plan.kind === 'reveal'
						? { kind: 'toggle', want: plan.want, still: plan.still, capture: !plan.still }
						: plan;
				},
			}),
		}),
	},

	// ---- L: lifecycle shape
	{
		id: 'L1-defect-capture-after-the-commit',
		kind: 'defect',
		row: 'L1',
		what: 'the Flip state is captured in the post-mutation phase',
		setup: (dir) => ({
			// The defect this whole PR is about: a capture that runs after the
			// browser has already moved the node produces a zero-distance
			// animation that neither throws nor warns.
			sourceOverrides: mutateSource(
				dir,
				'next/src/components/deck/AccountSeparationSlide.tsx',
				(text) =>
					text.replace(
						'const loaded = bundle.current;\n\t\tif (loaded && pending.state) {',
						'const loaded = bundle.current;\n\t\tvoid loaded?.Flip.getState(document.body);\n\t\tif (loaded && pending.state) {',
					),
			),
		}),
	},
	{
		id: 'L1-defect-capture-hoisted-into-render',
		kind: 'defect',
		row: 'L1',
		what: 'the capture is hoisted out of any effect and runs during render',
		setup: (dir) => ({
			// Textually BEFORE the layout effect, and strictly worse than the
			// defect L1 was originally written to catch: a capture during render
			// runs before React has committed anything at all. The old positional
			// test accepted it.
			sourceOverrides: mutateSource(
				dir,
				'next/src/components/deck/AccountSeparationSlide.tsx',
				(text) =>
					text
						.replace(
							'\tconst [separated, setSeparated] = useState(false);',
							'\tconst hoisted = () => bundle.current?.Flip.getState(document.body);\n\tconst [separated, setSeparated] = useState(false);',
						)
						.replace(
							"\t\t\tstate: plan.capture ? loaded.Flip.getState(element.querySelectorAll('[data-flip-id]')) : null,",
							'\t\t\tstate: plan.capture ? (hoisted() ?? null) : null,',
						),
			),
		}),
	},
	{
		id: 'L2-defect-passive-effect',
		kind: 'defect',
		row: 'L2',
		what: 'the Flip plays after paint instead of before it',
		setup: (dir) => ({
			sourceOverrides: mutateSource(
				dir,
				'next/src/components/deck/AccountSeparationSlide.tsx',
				(text) =>
					text.replace("typeof window === 'undefined' ? useEffect : useLayoutEffect", 'useEffect'),
			),
		}),
	},
	{
		id: 'L3-defect-context-never-reverted',
		kind: 'defect',
		row: 'L3',
		what: 'a StrictMode remount leaves the first mount’s tweens behind',
		setup: (dir) => ({
			sourceOverrides: mutateSource(
				dir,
				'next/src/components/deck/AccountSeparationSlide.tsx',
				(text) => text.replace('context.current?.revert();', 'context.current = context.current;'),
			),
		}),
	},
	{
		id: 'L4-defect-double-registration',
		kind: 'defect',
		row: 'L4',
		what: 'plugins are registered per call instead of once',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/deck/gsap.ts', (text) =>
				text.replace(
					'core.gsap.registerPlugin(flip.Flip, draw.DrawSVGPlugin);',
					'core.gsap.registerPlugin(flip.Flip);\n\t\t\tcore.gsap.registerPlugin(draw.DrawSVGPlugin);',
				),
			),
		}),
	},
	{
		id: 'L4-defect-memo-not-module-scoped',
		kind: 'defect',
		row: 'L4',
		what: 'the loader memo moved inside the function it is supposed to guard',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/deck/gsap.ts', (text) =>
				text
					.replace(
						'let pending: Promise<GsapBundle> | null = null;',
						'const registry = { pending: null as Promise<GsapBundle> | null };',
					)
					.replace(/pending/g, 'registry.pending'),
			),
		}),
	},
	{
		id: 'L5-defect-handoff-as-state',
		kind: 'defect',
		row: 'L5',
		what: 'the captured state is stored where writing it schedules a render',
		setup: (dir) => ({
			sourceOverrides: mutateSource(
				dir,
				'next/src/components/deck/AccountSeparationSlide.tsx',
				(text) => text.replace('const handoff = useRef<', 'const handoff = useState<'),
			),
		}),
	},

	// ---- K: keyboard precedence
	{
		id: 'K1-defect-meta-only',
		kind: 'defect',
		row: 'K1',
		what: 'the palette chord stops working for every non-Mac user',
		setup: () => ({
			chord: chordWith({
				planGlobalChord: (event, context) =>
					event.metaKey ? planGlobalChord(event, context) : { kind: 'ignore' },
			}),
		}),
	},
	{
		id: 'K2-defect-overlapping-chords',
		kind: 'defect',
		row: 'K2',
		what: 'the two chord predicates stop being disjoint',
		setup: () => ({
			// With `k` reading as BOTH chords, which one answers becomes a
			// property of statement order again -- exactly the accident the
			// shortcuts module was extracted to remove.
			chord: chordWith({
				isSearchChord: (event) =>
					isSearchChord(event) || ((event.metaKey || event.ctrlKey) && event.key === 'k'),
			}),
		}),
	},
	{
		id: 'K3-defect-locale-dropped',
		kind: 'defect',
		row: 'K3',
		what: 'a Korean reader is sent to the English search page',
		setup: () => ({
			chord: chordWith({
				planGlobalChord: (event, context) => {
					const plan = planGlobalChord(event, context);
					return plan.kind === 'go-search' ? { kind: 'go-search', href: '/search' } : plan;
				},
			}),
		}),
	},
	{
		id: 'K4-defect-no-input-suppression',
		kind: 'defect',
		row: 'K4',
		what: 'Cmd+F fires while the user is typing in a field',
		setup: () => ({
			// K5 gets its own control below rather than riding along here: the
			// seam replaces the predicate K4 calls directly, while K5 goes through
			// planGlobalChord, which closes over the real one. Declaring K5 as a
			// co-failure would have claimed a coupling the seam does not have.
			chord: chordWith({
				searchSuppressed: (context) =>
					context.pathname.includes('/search') || /\/posts\/.+/.test(context.pathname),
			}),
		}),
	},
	{
		id: 'K4-defect-overbroad-post-suppression',
		kind: 'defect',
		row: 'K4',
		what: 'the post-detail suppression swallows the post list too',
		setup: () => ({
			chord: chordWith({
				searchSuppressed: (context) =>
					searchSuppressed(context) || context.pathname.startsWith('/posts'),
			}),
		}),
	},
	{
		id: 'K5-defect-collision-inside-the-palette',
		kind: 'defect',
		row: 'K5',
		alsoFails: ['K4'],
		what: 'Cmd+F fires while the user is typing INTO the palette',
		setup: () => ({
			// Declared: K4 asserts the same suppression through the same planner
			// for its six contexts, so a planner that discards the target takes
			// both. The two rows are the same property from the two sides -- the
			// route's and the palette's -- and this control shows the coupling
			// rather than hiding it behind a narrower seam.
			chord: chordWith({
				planGlobalChord: (event, context) =>
					planGlobalChord(event, { ...context, targetTag: '', targetEditable: false }),
			}),
		}),
	},
	{
		id: 'K6-defect-chord-toggles',
		kind: 'defect',
		row: 'K6',
		what: 'Cmd+K closes a palette the user could not see was open',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/components/palette/PaletteHost.tsx', (text) =>
				text.replace('setOpen(true)', 'setOpen((value) => !value)'),
			),
		}),
	},
	{
		id: 'K7-defect-modifier-free-match',
		kind: 'defect',
		row: 'K7',
		what: 'typing the letter k opens the palette',
		setup: () => ({
			chord: chordWith({
				planGlobalChord: (event, context) =>
					event.key === 'k' ? { kind: 'open-palette' } : planGlobalChord(event, context),
			}),
		}),
	},
	{
		id: 'K8-defect-enter-ignored',
		kind: 'defect',
		row: 'K8',
		what: 'Enter stops selecting the highlighted result',
		setup: () => ({
			chord: chordWith({
				planInputKey: (key) => (key === 'Enter' ? 'ignore' : planInputKey(key)),
			}),
		}),
	},
	{
		id: 'K9-defect-trap-fires-mid-list',
		kind: 'defect',
		row: 'K9',
		what: 'Tab wraps from the middle of the dialog instead of its edges',
		setup: () => ({
			chord: chordWith({
				planDialogKey: (event, position) =>
					event.key === 'Tab' ? 'trap-to-first' : planDialogKey(event, position),
			}),
		}),
	},
	{
		id: 'K10-defect-selection-wraps',
		kind: 'defect',
		row: 'K10',
		what: 'the selection wraps around the ends of the list',
		setup: () => ({
			chord: chordWith({
				moveSelection: (index, key, length) =>
					key === 'move-up'
						? (index - 1 + length) % Math.max(length, 1)
						: (index + 1) % Math.max(length, 1),
			}),
		}),
	},

	// ---- F: the result list
	{
		id: 'F1-defect-no-post-cap',
		kind: 'defect',
		row: 'F1',
		alsoFails: ['F2'],
		what: 'the empty query dumps every post the site has',
		setup: () => ({
			// Declared: without the cap the oldest post survives, so F2 goes with
			// it. F4 does NOT -- the header positions are a property of the group
			// boundaries, which a longer list does not move.
			list: listWith({
				defaultResults: (items) => items.map((item) => ({ item, score: 0 })),
			}),
		}),
	},
	{
		id: 'F2-defect-oldest-first',
		kind: 'defect',
		row: 'F2',
		what: 'the default view shows the oldest posts instead of the newest',
		setup: () => ({
			list: listWith({
				defaultResults: (items) => {
					const rows = defaultResults(items);
					const posts = rows.filter((row) => row.item.group === 'post').reverse();
					return [...rows.filter((row) => row.item.group !== 'post'), ...posts];
				},
			}),
		}),
	},
	{
		id: 'F3-defect-unstable-group-sort',
		kind: 'defect',
		row: 'F3',
		what: 'grouping tie-breaks on score and discards the Fuse ranking',
		setup: () => ({
			list: listWith({
				groupResults: (rows) =>
					[...rows].sort(
						(a, b) =>
							({ nav: 0, action: 1, post: 2 })[a.item.group] -
								{ nav: 0, action: 1, post: 2 }[b.item.group] || b.score - a.score,
					),
			}),
		}),
	},
	{
		id: 'F4-defect-header-on-every-row',
		kind: 'defect',
		row: 'F4',
		what: 'every result gets its own section header',
		setup: () => ({
			list: listWith({ startsSection: () => true }),
		}),
	},
	{
		id: 'F5-defect-threshold-widened',
		kind: 'defect',
		row: 'F5',
		what: 'the fuzzy threshold drifts and the ranking changes with it',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/palette/fuzzy.ts', (text) =>
				text.replace('threshold: 0.4', 'threshold: 0.8'),
			),
		}),
	},
	{
		id: 'F6-defect-highlight-drops-the-tail',
		kind: 'defect',
		row: 'F6',
		what: 'text after the last match is discarded',
		setup: () => ({
			list: listWith({
				highlightMatches: (text, indices) =>
					highlightMatches(text, indices).filter(
						(segment, index, all) => index !== all.length - 1 || segment.highlighted,
					),
			}),
		}),
	},

	// ---- I: the item registry
	{
		id: 'I1-defect-missing-nav-entry',
		kind: 'defect',
		row: 'I1',
		what: 'a navigation destination disappears from the palette',
		setup: () => ({
			items: itemsWith({
				buildNavItems: (pathname, navigate, locale) =>
					buildNavItems(pathname, navigate, locale).filter((item) => item.id !== 'nav:tags'),
			}),
		}),
	},
	{
		id: 'I2-defect-prefix-test-too-loose',
		kind: 'defect',
		row: 'I2',
		what: 'a route that merely starts with ko is treated as Korean',
		setup: () => ({
			items: itemsWith({ isKorean: (pathname) => pathname.startsWith('/ko') }),
		}),
	},
	{
		id: 'I3-defect-language-switch-one-way',
		kind: 'defect',
		row: 'I3',
		what: 'the language switch cannot get back to English',
		setup: () => ({
			items: itemsWith({
				buildActionItems: (pathname, navigate, locale) =>
					buildActionItems(pathname, navigate, locale).map((item) =>
						item.id === 'action:switch-language'
							? { ...item, run: () => navigate(`/ko${pathname}`) }
							: item,
					),
			}),
		}),
	},
	{
		id: 'I4-defect-post-keywords-lost',
		kind: 'defect',
		row: 'I4',
		what: 'a post stops being findable by tag or category',
		setup: () => ({
			items: itemsWith({
				postToItem: (post, pathname, navigate) => ({
					...postToItem(post, pathname, navigate),
					keywords: [post.slug],
				}),
			}),
		}),
	},
	{
		id: 'I5-defect-sections-interleaved',
		kind: 'defect',
		row: 'I5',
		what: 'the item set stops arriving in section order',
		setup: () => ({
			// Measured, not assumed: the F rows survive a scrambled item set,
			// because defaultResults filters by group and groupResults re-sorts.
			// The ordering contract is genuinely I5's alone.
			items: itemsWith({
				buildPaletteItems: (posts, pathname, navigate, locale) =>
					[...buildPaletteItems(posts, pathname, navigate, locale)].reverse(),
			}),
		}),
	},
	{
		id: 'I6-defect-locale-ignored',
		kind: 'defect',
		row: 'I6',
		what: 'both locales render the English label',
		setup: () => ({
			items: itemsWith({
				buildNavItems: (pathname, navigate) => buildNavItems(pathname, navigate, 'en'),
			}),
		}),
	},

	// ---- A: A11Y-1 preserved
	{
		id: 'A1-defect-fixed-under-an-unlisted-name',
		kind: 'defect',
		row: 'A1',
		what: 'A11Y-1 is fixed by a mechanism the row was never taught to name',
		setup: (dir) => ({
			// The control that matters. The previous A1 injected the literal
			// `openerRef`, one of three names the row blacklisted, so it only ever
			// proved the blacklist matched itself. This fix uses a name no list
			// contains; the row has to catch it by asserting the BINDING.
			sourceOverrides: mutateSource(dir, 'next/src/components/palette/FuzzyFinder.tsx', (text) =>
				text.replace(
					'previouslyFocused.current = restoreFocusTarget();',
					'previouslyFocused.current = (window as unknown as { __invokedFrom?: HTMLElement }).__invokedFrom ?? restoreFocusTarget();',
				),
			),
		}),
	},
	{
		id: 'A1-defect-focus-never-restored',
		kind: 'defect',
		row: 'A1',
		what: 'focus is dropped entirely instead of restored',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/components/palette/FuzzyFinder.tsx', (text) =>
				text.replace('return () => restore?.focus?.();', 'return () => {};'),
			),
		}),
	},
	{
		id: 'A2-defect-listbox-role-dropped',
		kind: 'defect',
		row: 'A2',
		what: 'the results stop being announced as a listbox',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/components/palette/FuzzyFinder.tsx', (text) =>
				// Anchored to a line that is ONLY the attribute. The looser
				// `/\srole="option"/` matched the JSX comment above the list first --
				// the one explaining why the wrapper is a Fragment, which quotes the
				// attribute in prose -- so the mutation rewrote a comment, the row
				// (correctly) stripped it, and the control proved nothing. A comment
				// defeating a control is the mirror of a comment satisfying a row.
				text.replace(/^(\s*)role="option"$/m, '$1data-opt="option"'),
			),
		}),
	},

	{
		id: 'A2-defect-attribute-moved-into-a-comment',
		kind: 'defect',
		row: 'A2',
		what: 'an ARIA hook is renamed in the markup and left behind in a comment',
		setup: (dir) => ({
			// The `\\s` anchor closed the `data-role=` hole; this is the same hole
			// through the comment channel, which the anchor alone does not close.
			sourceOverrides: mutateSource(dir, 'next/src/components/palette/FuzzyFinder.tsx', (text) =>
				text
					.replace(/^(\s*)role="option"$/m, '$1data-opt="option"')
					.replace(
						'export function restoreFocusTarget',
						'// role="option" used to be here\nexport function restoreFocusTarget',
					),
			),
		}),
	},

	// ---- P: the port roll-call
	{
		id: 'P1-defect-target-missing',
		kind: 'defect',
		row: 'P1',
		alsoFails: ['K6', 'P2'],
		what: 'a ported module is gone',
		setup: (dir) => ({
			// Declared: K6 reads the same file, so pointing P1 at a path that does
			// not exist takes the row that reads its contents too.
			sourceOverrides: {
				'next/src/components/palette/PaletteHost.tsx': join(dir, 'does-not-exist.tsx'),
			},
		}),
	},
	{
		id: 'P2-defect-directive-missing',
		kind: 'defect',
		row: 'P2',
		what: 'a client component loses its directive',
		setup: (dir) => ({
			// The A rows read the same file and are unaffected: they look for the
			// focus restore and the ARIA hooks, neither of which the directive
			// line touches.
			sourceOverrides: mutateSource(dir, 'next/src/components/palette/FuzzyFinder.tsx', (text) =>
				text.replace("'use client';\n", ''),
			),
		}),
	},
	{
		id: 'P2-defect-directive-commented-out',
		kind: 'defect',
		row: 'P2',
		what: 'the directive is commented out, which Next reads as a server component',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/components/palette/PaletteHost.tsx', (text) =>
				text.replace("'use client';", "// 'use client';"),
			),
		}),
	},
	{
		id: 'P2-defect-directive-added-to-pure-module',
		kind: 'defect',
		row: 'P2',
		what: 'React leaks into a module that had no React in it',
		setup: (dir) => ({
			// The half that matters more: a `'use client'` on the shortcuts module
			// would mean the precedence stopped being reachable from a server
			// component and from this harness.
			sourceOverrides: mutateSource(dir, 'next/src/palette/shortcuts.ts', (text) =>
				text.replace('/**', "'use client';\n\n/**"),
			),
		}),
	},
	{
		id: 'P3-defect-svelte-import',
		kind: 'defect',
		row: 'P3',
		what: 'a Next module imports from svelte',
		setup: (dir) => ({
			// Injected into a scratch COPY, so the row is proven able to fail
			// without a Svelte import ever being written into the real tree.
			scanRoots: scanRootWith(dir, "import { tick } from 'svelte';"),
		}),
	},
	{
		id: 'P3-defect-scans-nothing',
		kind: 'defect',
		row: 'P3',
		what: 'the scan roots match no modules at all and the row still passes',
		setup: () => ({
			// `walk` returns [] for a missing directory, so a renamed next/src
			// silently turned this row into a check of zero files.
			scanRoots: ['next/this-directory-does-not-exist'],
		}),
	},
	{
		id: 'P3-noop-guard',
		kind: 'invariance',
		row: 'P3',
		what: 'the P3 scanner over a clean scratch copy stays green',
		setup: (dir) => ({ scanRoots: scanRootWith(dir, '') }),
	},
	{
		id: 'P4-defect-caret-pin',
		kind: 'defect',
		row: 'P4',
		what: 'a dependency is allowed to float to a new minor',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/package.json', (text) =>
				text.replace('"gsap": "3.15.0"', '"gsap": "^3.15.0"'),
			),
		}),
	},
	{
		id: 'P4-defect-not-a-svelte-side-dependency',
		kind: 'defect',
		row: 'P4',
		what: 'a library the Svelte side never carried is counted as ported cost',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'package.json', (text) =>
				text.replace('"gsap": "^3.15.0",', ''),
			),
		}),
	},

	// ---- S: the exports
	{
		id: 'S1-defect-noindex-stripped',
		kind: 'defect',
		row: 'S1',
		what: 'a scaffolding route becomes indexable',
		setup: (dir) => {
			const copy = copyBuild(dir);
			rewriteExport(copy, 'deck.html', /name="robots"[^>]*>/, '<meta name="nothing"/>');
			return { buildDir: copy };
		},
	},
	{
		id: 'S2-defect-shipped-the-separated-state',
		kind: 'defect',
		row: 'S2',
		what: 'the export holds step 1 rather than step 0',
		setup: (dir) => {
			const copy = copyBuild(dir);
			// Two flip ids is the separated state. A build that shipped it would
			// look perfectly fine to a person opening the page.
			rewriteExport(
				copy,
				'deck.html',
				'data-flip-id="calendar-account"',
				'data-flip-id="calendar-account"><span data-flip-id="calendar-account"',
			);
			return { buildDir: copy };
		},
	},
	{
		id: 'S3-defect-dialog-in-the-export',
		kind: 'defect',
		row: 'S3',
		what: 'the palette renders into static HTML instead of opening on a chord',
		setup: (dir) => {
			const copy = copyBuild(dir);
			rewriteExport(copy, 'palette.html', '<main>', '<main><div class="cmdk-overlay"></div>');
			return { buildDir: copy };
		},
	},
	{
		id: 'S4-defect-approval-missing',
		kind: 'defect',
		row: 'S4',
		what: 'a spike route ships with no ledger approval',
		setup: (dir) => ({
			ledgerFile: ledgerWith(dir, (entries) =>
				entries.filter((entry) => entry.url !== '/migration-fixture/deck'),
			),
		}),
	},
	{
		id: 'S4-defect-null-fingerprint-approval',
		kind: 'defect',
		row: 'S4',
		what: 'an approval is written without the fingerprint that binds it',
		setup: (dir) => ({
			// The asymmetry PR 1 built into compare(): a null fingerprint is the
			// unapprovable direction, and an entry carrying one must not read as
			// an approval here either.
			ledgerFile: ledgerWith(dir, (entries) =>
				entries.map((entry) =>
					entry.url === '/migration-fixture/palette' ? { ...entry, fingerprint: null } : entry,
				),
			),
		}),
	},
	{
		id: 'S4-defect-duplicate-approval',
		kind: 'defect',
		row: 'S4',
		what: 'a second approval quietly widens what was approved',
		setup: (dir) => ({
			ledgerFile: ledgerWith(dir, (entries) => [
				...entries,
				{
					url: '/migration-fixture/deck',
					field: 'shell',
					fingerprint: '0'.repeat(32),
					reason: 'control',
				},
			]),
		}),
	},
	{
		id: 'S5-defect-gsap-in-an-eager-chunk',
		kind: 'defect',
		row: 'S5',
		what: 'the dynamic import boundary is defeated and GSAP ships eagerly',
		setup: (dir) => {
			const copy = copyBuild(dir);
			const html = readFileSync(join(copy, 'migration-fixture', 'deck.html'), 'utf8');
			const first = /(?:src|href)="(\/_next\/[^"]+\.js)"/.exec(html);
			if (!first) throw new Error('no eager chunk to poison');
			const target = join(copy, first[1].replace('/_next/', '_next/'));
			mutateFile(target, (text) => `${text}\n// Missing plugin? gsap.registerPlugin()\n`);
			return { buildDir: copy };
		},
	},
	{
		id: 'S5-noop-guard',
		kind: 'defect',
		row: 'S5',
		what: 'the sentinel matching nothing at all is a failure, not a pass',
		setup: (dir) => {
			// Without this control S5 would pass on a build containing no GSAP
			// whatsoever -- the classic shape of a green row that checks nothing.
			const copy = copyBuild(dir);
			let stripped = 0;
			for (const rel of ['_next']) {
				const walkDir = join(copy, rel);
				const stack = [walkDir];
				while (stack.length > 0) {
					const current = stack.pop()!;
					for (const entry of readdirSync(current, { withFileTypes: true })) {
						const full = join(current, entry.name);
						if (entry.isDirectory()) stack.push(full);
						else if (full.endsWith('.js')) {
							const body = readFileSync(full, 'utf8');
							if (
								!body.includes('Missing plugin? gsap.registerPlugin()') &&
								!body.includes('_gsap')
							)
								continue;
							writeFileSync(
								full,
								body
									.split('Missing plugin? gsap.registerPlugin()')
									.join('X')
									.split('_gsap')
									.join('X'),
							);
							stripped += 1;
						}
					}
				}
			}
			if (stripped === 0) throw new Error('no-op mutation: no chunk carried the sentinel');
			return { buildDir: copy };
		},
	},

	// ---- C: typecheck
	{
		id: 'C1-defect-widened-exclude',
		kind: 'defect',
		row: 'C1',
		what: 'tsc stays green by checking none of the ported files',
		setup: (dir) => ({
			// `--noEmit` exiting 0 is not evidence on its own, which is why C1
			// reads --listFiles. This control is what proves that half runs.
			// A narrowed `include`, not a widened `exclude`: a relative exclude in
			// a scratch tsconfig resolves against the SCRATCH directory and
			// matches nothing, and an absolute one is filtered against an include
			// list that has already resolved -- both leave the real program
			// intact and the control passes for the wrong reason. Pointing the
			// program at one empty file is unambiguous: tsc still exits 0, and
			// none of the ported modules are in it.
			tsconfigProject: tsconfigWith(dir, { include: [emptyProgram(dir)] }),
		}),
	},

	{
		id: 'C1-defect-type-error',
		kind: 'defect',
		row: 'C1',
		what: 'tsc reports an error and the row still passes',
		setup: (dir) => ({
			// C1 is a conjunction -- tsc exits 0 AND the ported files are in the
			// program -- and only the second half had a control. This is the first.
			tsconfigProject: tsconfigWith(dir, { include: [brokenProgram(dir)] }),
		}),
	},

	// ---- invariance: things the suite must NOT care about
	{
		id: 'I-comment-reflow',
		kind: 'invariance',
		row: 'T1',
		what: 'reflowing a comment in the planner changes nothing',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/deck/slide-plan.ts', (text) =>
				text.replace('/**\n * The AccountSeparation', '/**\n *\n * The AccountSeparation'),
			),
		}),
	},
	{
		id: 'I-svelte-whitespace',
		kind: 'invariance',
		row: 'T1',
		what: 'reindenting the Svelte tween body does not break the text comparison',
		setup: (dir) => ({
			// T1 compares expressions, not formatting. A row that failed on a
			// prettier run would be unusable.
			sourceOverrides: mutateSource(
				dir,
				'src/routes/talks/my-career/slides/AccountSeparationSlide.svelte',
				(text) => text.replace('duration: DURATION * d,', 'duration:   DURATION  *  d,'),
			),
		}),
	},
	{
		id: 'I-unrelated-ledger-entry',
		kind: 'invariance',
		row: 'S4',
		what: 'an approval for some other route is none of this suite’s business',
		setup: (dir) => ({
			ledgerFile: ledgerWith(dir, (entries) => [
				...entries,
				{ url: '/somewhere/else', field: 'page', fingerprint: '1'.repeat(32), reason: 'control' },
			]),
		}),
	},
	{
		id: 'I-ledger-reordered',
		kind: 'invariance',
		row: 'S4',
		what: 'ledger order is not part of the contract',
		setup: (dir) => ({
			ledgerFile: ledgerWith(dir, (entries) => [...entries].reverse()),
		}),
	},
	{
		id: 'I-unrelated-page-rewritten',
		kind: 'invariance',
		row: 'S2',
		what: 'a change to a page this suite does not own is ignored',
		setup: (dir) => {
			const copy = copyBuild(dir);
			rewriteExport(copy, 'study.html', '<main', '<main data-control="1"');
			return { buildDir: copy };
		},
	},
	{
		id: 'I-unrelated-dependency-added',
		kind: 'invariance',
		row: 'P4',
		what: 'a dependency neither surface uses does not move the pin row',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/package.json', (text) =>
				text.replace('"gsap": "3.15.0",', '"gsap": "3.15.0",\n\t\t"zod": "3.0.0",'),
			),
		}),
	},
	{
		id: 'I-component-comment-added',
		kind: 'invariance',
		row: 'L1',
		what: 'a comment mentioning the capture does not count as a capture',
		setup: (dir) => ({
			// The L rows read stripped source for exactly this reason: a comment
			// saying `Flip.getState` in the layout effect must not fail L1.
			sourceOverrides: mutateSource(
				dir,
				'next/src/components/deck/AccountSeparationSlide.tsx',
				(text) =>
					text.replace(
						'\t\tconst pending = handoff.current;',
						'\t\t// Not a Flip.getState( call, just a mention of one.\n\t\tconst pending = handoff.current;',
					),
			),
		}),
	},
	{
		id: 'I-results-comment-reflowed',
		kind: 'invariance',
		row: 'P2',
		what: 'a comment inside results.ts moves nothing',
		setup: (dir) => ({
			// Named for P2, which is the only row that reads this file at all -- and
			// only its first non-blank line. Naming it for F1 claimed a coupling
			// that does not exist: the F rows drive the `list` seam and never
			// read results.ts, so the control could not have demonstrated anything
			// about them.
			sourceOverrides: mutateSource(dir, 'next/src/palette/results.ts', (text) =>
				text.replace('// UX-3: cap', '// UX-3 (control comment): cap'),
			),
		}),
	},
	{
		id: 'I-noindex-on-the-other-fixture',
		kind: 'invariance',
		row: 'S1',
		what: 'the mermaid fixture is not one of this suite’s routes',
		setup: (dir) => {
			const copy = copyBuild(dir);
			rewriteExport(copy, 'mermaid.html', '<main', '<main data-control="1"');
			return { buildDir: copy };
		},
	},
];

// --------------------------------------------------------------- the runner

export function runControls(filter?: string): number {
	rmSync(SCRATCH, { recursive: true, force: true });
	const selected = filter ? CONTROLS.filter((c) => c.id.includes(filter)) : CONTROLS;
	const failures: string[] = [];
	let passed = 0;

	// COVERAGE, before anything runs. `N4` reached review with no defect control
	// of its own -- it appeared only inside another control's `alsoFails`, so it
	// had never been shown to fail for its own reason, and nothing in this file
	// could notice. Riding on a co-failure is exactly the thing the header
	// forbids, so the roll-call is now computed rather than asserted in prose.
	if (!filter) {
		let baselineRows: RowResult[] = [];
		runAssertions({
			quiet: true,
			skipTypecheck: true,
			onRows: (rows) => {
				baselineRows = rows;
			},
		});
		const named = new Set(CONTROLS.filter((c) => c.kind === 'defect').map((c) => c.row));
		const uncovered = baselineRows.map((row) => row.id).filter((id) => !named.has(id));
		if (uncovered.length > 0) {
			console.error(
				`FAIL coverage   rows with no defect control of their own: ${uncovered.join(', ')}`,
			);
			console.error(
				"       A row named only in another control's alsoFails has never been shown to fail for its own reason.",
			);
			return 1;
		}
		console.log(
			`PASS coverage   all ${baselineRows.length} rows are named by at least one defect control`,
		);
	}

	for (const control of selected) {
		const dir = join(SCRATCH, control.id);
		let verdict: string;
		try {
			mkdirSync(dir, { recursive: true });
			let rows: RowResult[] = [];
			const options = control.setup(dir);
			const code = runAssertions({
				// The C row drives tsc, which is slow and which most controls do not
				// touch; the one control that IS about it opts back in.
				skipTypecheck: control.row !== 'C1',
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
			console.log(`PASS ${control.kind.padEnd(10)} ${control.id.padEnd(38)} ${control.what}`);
		} else {
			failures.push(`${control.id}: ${verdict}`);
			console.error(`FAIL ${control.kind.padEnd(10)} ${control.id.padEnd(38)} ${control.what}`);
			console.error(`       ${verdict}`);
		}
		rmSync(dir, { recursive: true, force: true });
	}

	rmSync(SCRATCH, { recursive: true, force: true });
	const defects = selected.filter((c) => c.kind === 'defect').length;
	console.log('');
	console.log(
		`SLICE 2 GSAP + PALETTE CONTROLS: ${passed}/${selected.length} (${defects} defect, ${selected.length - defects} invariance)`,
	);
	if (failures.length) {
		console.error(`${failures.length} control(s) failed:`);
		for (const line of failures) console.error(`  ${line}`);
		return 1;
	}
	console.log('  every row above has now been shown to fail for its own reason, and only for it.');
	return 0;
}

if (process.argv[1] && process.argv[1].endsWith('assert-slice2-gsap-palette-controls.ts')) {
	try {
		process.exit(runControls(process.argv[2]));
	} catch (error) {
		console.error(`FATAL: ${(error as Error).stack ?? String(error)}`);
		process.exit(2);
	}
}
