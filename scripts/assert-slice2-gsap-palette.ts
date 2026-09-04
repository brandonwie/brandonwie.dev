/**
 * Slice 2 — the GSAP slide and the command palette: executable evidence.
 *
 *   pnpm migration:gsap-palette
 *
 * PR 2 measured the study cohort. This one measures the other two the Slice 4
 * estimate has no calibrated rate for: the twenty GSAP slides (`impl.slides`,
 * 6,709 lines, still priced at an uncalibrated 30-60 lines/h) and the palette
 * that `impl.lib-ts` and the shell split between them.
 *
 * WHAT IS ACTUALLY AT RISK HERE, and what each group holds onto:
 *
 *   T  tween arithmetic   Eleven durations, staggers and delays are multiplied
 *                         by a reduced-motion factor `d`. Dropping it from one
 *                         leaves a slide that still animates and ignores the
 *                         OS setting on exactly one of its three reveals. The
 *                         rows recompute every number independently.
 *   N  step planning      Which step transitions capture a Flip state and
 *                         which only re-run the reveals, including the guard
 *                         that makes React's double-invoked effects harmless.
 *   L  lifecycle shape    Where the capture and the play LIVE. These are
 *                         source-shape rows and the weakest thing here; see
 *                         "What these rows cannot prove" below.
 *   K  keyboard           The chord precedence that was implicit across three
 *                         Svelte files, now a pure function, asserted rule by
 *                         rule and suppression by suppression.
 *   F  result lists       The empty-query cap, the newest-first ordering and
 *                         the stable group sort that preserves Fuse rank.
 *   I  item registry      Nine nav entries, six actions, the locale-aware path
 *                         rewriting, and the injected navigation the Svelte
 *                         original could not have.
 *   A  A11Y-1 preserved   The focus-return defect is assigned to Slice 3. A
 *                         port that quietly fixed it would be an unrecorded
 *                         behavior change, so a row fails if it was fixed.
 *   P  port roll-call     Every Svelte source has a counterpart, the client
 *                         boundaries land where they should, no Next module
 *                         imports Svelte, and the two new dependencies are
 *                         pinned exactly.
 *   S  spike routes       What the export contains, that the palette is CLOSED
 *                         in static HTML, that GSAP is not in the eager chunk
 *                         set, and that the ledger approves exactly one page
 *                         row per route.
 *   C  typecheck          tsc exits 0 AND the new modules are in the program.
 *
 * WHAT THESE ROWS CANNOT PROVE. The one defect this port is most likely to
 * have is ordering: `Flip.getState()` running after the browser already moved
 * the node. That is not a value, it is which React lifecycle phase a call sits
 * in, and no assertion here executes a React commit. The L rows read the
 * source for the shape and would pass a component that had the right shape and
 * the wrong behavior. This is the same unproven property PR 2 recorded for
 * `KeyedMotion`'s lifecycle, and it is carried into Slice 4 as a browser-probe
 * cost rather than implied to be covered.
 *
 * Importing this module is safe — its CLI is guarded on `process.argv[1]` — so
 * the controls file can drive `runAssertions()` against substituted seams and
 * mutated copies.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import {
	SVELTE_IMPORT,
	codeOnly,
	stripComments,
	typecheckWithFileList,
	walk,
} from './assert-slice2-motion';

import { DURATION, EASE } from '../next/src/deck/gsap';
import {
	FLIP_OPTIONS,
	initialSets,
	planStep,
	revealTweens,
	type SlidePlan,
	type SlideStepInput,
	type TweenSpec,
} from '../next/src/deck/slide-plan';
import {
	buildActionItems,
	buildNavItems,
	buildPaletteItems,
	isKorean,
	localePath,
	postToItem,
	type PaletteItem,
	type PalettePost,
} from '../next/src/palette/items';
import { createPaletteFuse, fuzzySearch, highlightMatches } from '../next/src/palette/fuzzy';
import { orderPostsForPalette, paletteOrderKey } from '../next/src/palette/post-order';
import matter from 'gray-matter';
import {
	DEFAULT_POST_LIMIT,
	defaultResults,
	groupResults,
	startsSection,
} from '../next/src/palette/results';
import {
	isPaletteChord,
	isSearchChord,
	moveSelection,
	planDialogKey,
	planGlobalChord,
	planInputKey,
	searchHref,
	searchSuppressed,
	type ChordContext,
} from '../next/src/palette/shortcuts';

// ------------------------------------------------------------------ declared

/** Svelte source to React counterpart. A missing target is a missing port. */
export const PORT_ROLES = [
	{
		svelte: 'src/lib/components/deck/gsap.ts',
		next: 'next/src/deck/gsap.ts',
		role: 'memoized GSAP loader + deck easing constants',
	},
	{
		svelte: 'src/routes/talks/my-career/slides/AccountSeparationSlide.svelte',
		next: 'next/src/components/deck/AccountSeparationSlide.tsx',
		role: 'the Flip slide',
	},
	{
		svelte: 'src/lib/fuzzy.ts',
		next: 'next/src/palette/fuzzy.ts',
		role: 'Fuse wrapper + match highlighting',
	},
	{
		svelte: 'src/lib/palette/items.ts',
		next: 'next/src/palette/items.ts',
		role: 'nav / action / post registry',
	},
	{
		svelte: 'src/lib/components/palette/FuzzyFinder.svelte',
		next: 'next/src/components/palette/FuzzyFinder.tsx',
		role: 'the palette dialog',
	},
	{
		svelte: 'src/lib/stores/palette.ts',
		next: 'next/src/components/palette/PaletteHost.tsx',
		role: 'open state + the window chord handler',
	},
];

/** Files with no Svelte counterpart that the React port required anyway. */
export const PORT_ADDITIONS = [
	{
		next: 'next/src/deck/slide-plan.ts',
		why: 'the tween arithmetic, extracted so the reduced-motion factor is checkable without a browser',
	},
	{
		next: 'next/src/palette/shortcuts.ts',
		why: 'the chord precedence that was implicit across two window handlers and a store',
	},
	{
		next: 'next/src/palette/results.ts',
		why: 'the empty-query cap and the stable group sort, extracted for the same reason',
	},
];

/**
 * Which modules carry `'use client'` and which must NOT.
 *
 * `false` is the load-bearing half. `slide-plan.ts`, `shortcuts.ts`,
 * `results.ts` and `fuzzy.ts` are pure and must stay reachable from a server
 * component and from this harness; if one ever needs the directive, something
 * React-shaped leaked into logic that had none.
 */
export const CLIENT_BOUNDARY: Record<string, boolean> = {
	'next/src/components/deck/AccountSeparationSlide.tsx': true,
	'next/src/components/deck/DeckSpike.tsx': true,
	'next/src/components/palette/FuzzyFinder.tsx': true,
	'next/src/components/palette/PaletteHost.tsx': true,
	'next/src/components/palette/PaletteSpike.tsx': true,
	'next/src/deck/slide-plan.ts': false,
	'next/src/palette/shortcuts.ts': false,
	'next/src/palette/results.ts': false,
	'next/src/palette/fuzzy.ts': false,
	'next/src/palette/items.ts': false,
};

/** Exact pins, no caret — the same rule `@xyflow/react` follows. */
export const NEW_DEPENDENCY_PINS: Record<string, string> = {
	gsap: '3.15.0',
	'fuse.js': '7.4.2',
};

export const DECK_URL = '/migration-fixture/deck';
export const DECK_PAGE = ['migration-fixture', 'deck.html'];
export const PALETTE_URL = '/migration-fixture/palette';
export const PALETTE_PAGE = ['migration-fixture', 'palette.html'];

/**
 * What the deck export holds: the slide's step-0 render and nothing further.
 *
 * `flipIds: 1` is the whole nested/separated contract in one number. At step 0
 * the calendar account is INSIDE the user box, which is one `data-flip-id`
 * node; the separated state renders two account cards and would put a second
 * one in the export. A build that shipped step 1 would still look fine.
 */
export const DECK_EXPORT_COUNTS = { flipIds: 1, nested: 1, chips: 0 };

/** Sentinels that must survive minification if the slide actually shipped. */
export const DECK_SENTINELS = ['data-flip-id', 'account-separation'];

/**
 * A marker only GSAP's own source carries. Present in a lazily-loaded chunk and
 * absent from the eager set, or the dynamic import boundary was defeated.
 *
 * NOT the bare word `gsap`, which was the first thing tried and is a false
 * positive: the slide's own compiled body reads `n.gsap.to(...)`, so the eager
 * chunk holding the COMPONENT matches it while holding none of the library.
 * Measured on this build, `'gsap'` reports 1 eager and 3 lazy chunks and the
 * `'gsap.registerPlugin'` spelling reports 1 eager and 2 lazy -- the eager hit
 * in that case being the loader module. Only the internal warning string below
 * separates the library from everything that talks about it: 0 eager, 1 lazy.
 */
export const GSAP_SENTINEL = 'Missing plugin? gsap.registerPlugin()';

/** A second, independent marker: GSAP writes this private property onto every
 *  element it has ever touched, and nothing else in the bundle spells it. */
export const GSAP_SENTINEL_ALT = '_gsap';

// ------------------------------------------------------------------- options

export interface SlideSeam {
	planStep: typeof planStep;
	revealTweens: typeof revealTweens;
	initialSets: typeof initialSets;
	// NOT `typeof FLIP_OPTIONS`. The real value is `as const`, so that spelling
	// fixes `absolute` to the LITERAL true -- and F-group's control substitutes
	// `{ ...FLIP_OPTIONS, absolute: false }`, which the declared type forbids.
	// The seam exists to be substituted; its type has to admit the substitution.
	// Nothing caught it because no tsconfig in this repo included `scripts/`;
	// tsconfig.scripts.json now does, for this pair.
	flipOptions: { duration: number; ease: string; absolute: boolean };
}

export interface ChordSeam {
	planGlobalChord: typeof planGlobalChord;
	planInputKey: typeof planInputKey;
	planDialogKey: typeof planDialogKey;
	moveSelection: typeof moveSelection;
	isPaletteChord: typeof isPaletteChord;
	isSearchChord: typeof isSearchChord;
	searchSuppressed: typeof searchSuppressed;
	searchHref: typeof searchHref;
}

export interface ListSeam {
	defaultResults: typeof defaultResults;
	groupResults: typeof groupResults;
	startsSection: typeof startsSection;
	highlightMatches: typeof highlightMatches;
}

export interface ItemSeam {
	buildNavItems: typeof buildNavItems;
	buildActionItems: typeof buildActionItems;
	buildPaletteItems: typeof buildPaletteItems;
	postToItem: typeof postToItem;
	localePath: typeof localePath;
	isKorean: typeof isKorean;
}

export interface Slice2GsapOptions {
	root?: string;
	buildDir?: string;
	ledgerFile?: string;
	/** Replace a repo file's CONTENT for one run: real path to scratch path. */
	sourceOverrides?: Record<string, string>;
	/** Directory roots P3 scans for Svelte imports. */
	scanRoots?: string[];
	/** Replace the declared client-boundary map. */
	clientBoundary?: Record<string, boolean>;
	/** Replace the declared dependency pins. */
	dependencyPins?: Record<string, string>;
	/** Replace the declared deck export counts. */
	deckCounts?: typeof DECK_EXPORT_COUNTS;
	/**
	 * The palette ordering, as a SEAM. A source override cannot reach it: the row
	 * imports the function, so mutating `post-order.ts` on disk changes nothing
	 * the running row can see -- which is what the first I7 control proved by
	 * failing. Behavioral rows need substitution, not text.
	 */
	orderPosts?: typeof orderPostsForPalette;
	slide?: SlideSeam;
	chord?: ChordSeam;
	list?: ListSeam;
	items?: ItemSeam;
	tsconfigProject?: string;
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
	 *  has not run rows 4 through 45. */
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
	if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
}

function count(haystack: string, needle: string): number {
	return haystack.split(needle).length - 1;
}

/** A chord event with the two modifier flags defaulted off. */
function key(k: string, modifiers: { meta?: boolean; ctrl?: boolean; shift?: boolean } = {}) {
	return {
		key: k,
		metaKey: Boolean(modifiers.meta),
		ctrlKey: Boolean(modifiers.ctrl),
		shiftKey: Boolean(modifiers.shift),
	};
}

function context(pathname: string, over: Partial<ChordContext> = {}): ChordContext {
	return { pathname, targetTag: '', targetEditable: false, ...over };
}

/** Records what an item would navigate to instead of navigating. */
function recorder(): { navigate: (href: string) => void; hrefs: string[] } {
	const hrefs: string[] = [];
	return { navigate: (href: string) => hrefs.push(href), hrefs };
}

function post(slug: string, date: string, over: Partial<PalettePost> = {}): PalettePost {
	return {
		slug,
		title: `Title ${slug}`,
		description: `Description ${slug}`,
		date,
		tags: ['alpha', 'beta'],
		category: 'backend',
		...over,
	};
}

function itemOf(items: PaletteItem[], id: string): PaletteItem {
	const found = items.find((item) => item.id === id);
	if (!found) throw new Error(`no item ${id} in [${items.map((i) => i.id).join(', ')}]`);
	return found;
}

/**
 * The `key: expression` pairs inside one `gsap.to(..., { ... })` call, as TEXT.
 *
 * This is the closest thing to an oracle available for a GSAP port. There is
 * no pure GSAP function to run both sides through the way `svelte/transition`
 * gave PR 2 a byte-comparable answer — a tween's numbers only become
 * observable once a timeline is running in a browser. What CAN be compared
 * without one is the arithmetic itself: both files spell out the same eleven
 * expressions, and a drifted multiplier stops matching immediately.
 */
function tweenExpressions(
	source: string,
	locate: RegExp,
	selector: string,
): Record<string, string> {
	const found = locate.exec(source);
	// The Svelte file mentions `.note` twice -- once in the onMount `gsap.set`
	// and once in the reveal `gsap.to`. A plain indexOf finds the SET, whose
	// body is `{ autoAlpha: 0, y: 6 }`, and the row then compares two tweens
	// that are not the same tween. The caller passes a locator that names the
	// call, not just the selector.
	if (!found) throw new Error(`no tween for ${selector}`);
	const open = source.indexOf('{', found.index + found[0].length - 1);
	let depth = 0;
	let end = -1;
	for (let i = open; i < source.length; i += 1) {
		if (source[i] === '{') depth += 1;
		else if (source[i] === '}') {
			depth -= 1;
			if (depth === 0) {
				end = i;
				break;
			}
		}
	}
	if (end === -1) throw new Error(`unterminated tween body for ${selector}`);

	const body = source.slice(open + 1, end);
	const pairs: Record<string, string> = {};
	for (const line of body.split('\n')) {
		const match = /^\s*([A-Za-z]+):\s*(.+?),?\s*$/.exec(line);
		if (!match) continue;
		pairs[match[1]] = match[2].replace(/,$/, '').replace(/\s+/g, ' ').trim();
	}
	return pairs;
}

/**
 * The source text of one hook call, from its opening paren to the matching
 * close.
 *
 * L1 used to test whether `Flip.getState(` appeared textually BEFORE the layout
 * effect, which accepts a capture hoisted into the render body — strictly worse
 * than the placement the row claims to prove, because a capture during render
 * runs before React has committed anything at all. Bracketing to the hook that
 * owns the call is what makes the row about a lifecycle phase rather than about
 * character offsets.
 */
function hookBody(source: string, hook: string, contains: string): string {
	let from = 0;
	for (;;) {
		const at = source.indexOf(`${hook}(`, from);
		if (at === -1) throw new Error(`no ${hook}() call containing ${contains}`);
		const open = source.indexOf('(', at);
		let depth = 0;
		let end = -1;
		for (let i = open; i < source.length; i += 1) {
			if (source[i] === '(') depth += 1;
			else if (source[i] === ')') {
				depth -= 1;
				if (depth === 0) {
					end = i;
					break;
				}
			}
		}
		if (end === -1) throw new Error(`unterminated ${hook}() call`);
		const body = source.slice(open, end);
		if (body.includes(contains)) return body;
		from = end;
	}
}

export function runAssertions(options: Slice2GsapOptions = {}): number {
	const root = resolve(options.root ?? process.cwd());
	const buildDir = resolve(root, options.buildDir ?? 'next/build');
	const ledgerFile = resolve(root, options.ledgerFile ?? 'verification/exception-ledger.json');
	const overrides = options.sourceOverrides ?? {};
	const orderPosts = options.orderPosts ?? orderPostsForPalette;
	const clientBoundary = options.clientBoundary ?? CLIENT_BOUNDARY;
	const dependencyPins = options.dependencyPins ?? NEW_DEPENDENCY_PINS;
	const deckCounts = options.deckCounts ?? DECK_EXPORT_COUNTS;
	const slide: SlideSeam = options.slide ?? {
		planStep,
		revealTweens,
		initialSets,
		flipOptions: FLIP_OPTIONS,
	};
	const chord: ChordSeam = options.chord ?? {
		planGlobalChord,
		planInputKey,
		planDialogKey,
		moveSelection,
		isPaletteChord,
		isSearchChord,
		searchSuppressed,
		searchHref,
	};
	const list: ListSeam = options.list ?? {
		defaultResults,
		groupResults,
		startsSection,
		highlightMatches,
	};
	const registry: ItemSeam = options.items ?? {
		buildNavItems,
		buildActionItems,
		buildPaletteItems,
		postToItem,
		localePath,
		isKorean,
	};
	const r = new Runner(options.quiet ?? false);

	const read = (rel: string): string => {
		const override = overrides[rel];
		return readFileSync(override ? resolve(root, override) : resolve(root, rel), 'utf8');
	};
	const exists = (rel: string): boolean =>
		existsSync(overrides[rel] ? resolve(root, overrides[rel]) : resolve(root, rel));

	// ------------------------------------------------- T: the tween arithmetic

	r.row(
		'T1',
		'the ported tween arithmetic is the Svelte arithmetic, expression for expression',
		() => {
			const svelte = read('src/routes/talks/my-career/slides/AccountSeparationSlide.svelte');
			const ported = read('next/src/deck/slide-plan.ts');
			const compared: string[] = [];
			let total = 0;

			for (const selector of ['.second', '.chip', '.note']) {
				const escaped = selector.replace('.', '\\.');
				const a = tweenExpressions(
					svelte,
					new RegExp(`gsap\\.to\\(root\\.querySelectorAll\\('${escaped}'\\),\\s*\\{`),
					selector,
				);
				const b = tweenExpressions(
					ported,
					new RegExp(`selector: '${escaped}',\\s*vars: \\{`),
					selector,
				);
				eq(Object.keys(b).sort(), Object.keys(a).sort(), `${selector} keys`);
				for (const property of Object.keys(a)) {
					eq(b[property], a[property], `${selector}.${property}`);
				}
				// A LOWER BOUND, or the oracle proves nothing when it finds nothing.
				// Hoisting a tween's vars into a local on BOTH sides makes both
				// extractions empty, `eq({}, {})` holds, and the row passes having
				// compared zero expressions -- while its own prose says "expression
				// for expression". The counts are the measured baseline (4 + 5 + 6),
				// not a claim: if the Svelte tween legitimately gains a property this
				// row fails loudly and the number is updated on purpose.
				must(
					Object.keys(a).length > 0,
					`${selector} yielded no expressions on the Svelte side -- the oracle compared nothing`,
				);
				total += Object.keys(a).length;
				compared.push(`${selector} ${Object.keys(a).length}`);
			}
			eq(total, 15, 'expressions extracted across the three tweens');

			return `${total} expressions compared as text across three tweens: ${compared.join(', ')}`;
		},
	);

	r.row('T2', 'the moving direction evaluates to the recorded numbers', () => {
		const tweens = slide.revealTweens(true, false);
		eq(
			tweens.map((tween: TweenSpec) => tween.selector),
			['.second', '.chip', '.note'],
			'selector order',
		);
		eq(
			tweens[0].vars,
			{ autoAlpha: 1, duration: DURATION, ease: EASE, delay: DURATION * 0.8 },
			'.second',
		);
		eq(
			tweens[1].vars,
			{ autoAlpha: 1, duration: DURATION * 0.8, stagger: 0.06, ease: EASE, delay: DURATION * 1.05 },
			'.chip',
		);
		eq(
			tweens[2].vars,
			{
				autoAlpha: 1,
				y: 0,
				duration: DURATION,
				stagger: 0.07,
				ease: EASE,
				delay: DURATION * 1.3,
			},
			'.note',
		);
		return `three tweens at DURATION ${DURATION}, ease ${EASE}`;
	});

	r.row('T3', 'the reverse direction hides without delay', () => {
		const tweens = slide.revealTweens(false, false);
		for (const tween of tweens) {
			must(
				tween.vars.autoAlpha === 0,
				`${tween.selector} should fade out, got ${tween.vars.autoAlpha}`,
			);
			must(tween.vars.delay === 0, `${tween.selector} should not delay on the way out`);
		}
		eq(tweens[2].vars.y, 6, '.note returns to its 6px offset');
		return 'all three reverse immediately; the note returns to y=6';
	});

	r.row('T4', 'reduced motion zeroes every time and no destination', () => {
		const still = slide.revealTweens(true, true);
		const moving = slide.revealTweens(true, false);

		for (const tween of still) {
			must(tween.vars.duration === 0, `${tween.selector} duration should collapse`);
			must(tween.vars.delay === 0, `${tween.selector} delay should collapse`);
			if (tween.vars.stagger !== undefined) {
				must(tween.vars.stagger === 0, `${tween.selector} stagger should collapse`);
			}
		}

		// The half that a dropped `d` would not break, and that a too-eager
		// collapse would: the slide must still ARRIVE, in one frame.
		for (let i = 0; i < still.length; i += 1) {
			eq(still[i].vars.autoAlpha, moving[i].vars.autoAlpha, `${still[i].selector} autoAlpha`);
			eq(still[i].vars.y, moving[i].vars.y, `${still[i].selector} y`);
		}
		return 'eight timing values collapse to 0; three destinations do not';
	});

	r.row('T5', 'the delay ladder is strictly increasing in the recorded ratios', () => {
		const [second, chip, note] = slide.revealTweens(true, false);
		must(second.vars.delay < chip.vars.delay, 'the second account must land before the chips');
		must(chip.vars.delay < note.vars.delay, 'the chips must land before the notes');
		eq(second.vars.delay / DURATION, 0.8, '.second ratio');
		eq(Number((chip.vars.delay / DURATION).toFixed(4)), 1.05, '.chip ratio');
		eq(Number((note.vars.delay / DURATION).toFixed(4)), 1.3, '.note ratio');
		return 'one move, then the room it made being used: 0.8 < 1.05 < 1.3';
	});

	r.row('T6', 'the initial state hides everything the reveals will show', () => {
		const sets = slide.initialSets();
		eq(
			sets.map((set) => set.selector),
			['.note', '.chip, .second'],
			'set selectors',
		);
		eq(sets[0].vars, { autoAlpha: 0, y: 6 }, '.note initial');
		eq(sets[1].vars, { autoAlpha: 0 }, '.chip, .second initial');
		return 'notes start 6px low and invisible; chips and the second account invisible';
	});

	r.row('T7', 'Flip is told the node changes parent', () => {
		// `absolute: true` is what lets Flip animate a node between two DIFFERENT
		// parents, which is the entire move this slide performs. Without it the
		// tween still runs and the node jumps.
		eq(slide.flipOptions.absolute, true, 'FLIP_OPTIONS.absolute');
		eq(slide.flipOptions.duration, DURATION, 'FLIP_OPTIONS.duration');
		eq(slide.flipOptions.ease, EASE, 'FLIP_OPTIONS.ease');

		const svelte = read('src/routes/talks/my-career/slides/AccountSeparationSlide.svelte');
		must(
			/Flip\.from\(state,\s*\{\s*duration:\s*DURATION,\s*ease:\s*EASE,\s*absolute:\s*true\s*\}\)/.test(
				svelte,
			),
			'the Svelte original no longer spells FLIP_OPTIONS the way this row assumes',
		);
		return 'duration, ease and absolute:true match the original call site';
	});

	r.row('T8', 'the component takes its numbers from the shared constants', () => {
		const component = codeOnly(read('next/src/components/deck/AccountSeparationSlide.tsx'));
		// A component that re-spelled 0.45 or 'power2.inOut' would drift from the
		// deck the moment the deck's scale changed, which is the reason the
		// constants exist at all.
		must(!component.includes('0.45'), 'the component hardcodes a duration');
		// THE CURVE CLAUSE CANNOT READ `codeOnly`. It empties string CONTENTS, and
		// 'power2.inOut' only ever occurs inside a string -- so `!includes('power2')`
		// held no matter what the component did, which round 2 demonstrated by
		// adding the ease back and watching T8 pass. `stripComments` keeps string
		// bodies and drops only comments, which is what this clause needs.
		const componentWithStrings = stripComments(
			read('next/src/components/deck/AccountSeparationSlide.tsx'),
		);
		must(!componentWithStrings.includes('power2'), 'the component hardcodes an easing curve');
		// Call forms, not bare identifiers: `ReturnType<typeof revealTweens>` is a
		// TYPE reference and would satisfy an identifier check in a component that
		// had stopped calling the planner altogether.
		must(/revealTweens\(/.test(component), 'the component does not CALL the planner');
		must(
			/Flip\.from\([^)]*FLIP_OPTIONS/.test(component),
			'the component does not pass the shared Flip options to Flip.from',
		);
		return 'no duration or curve literal in the component; the planner supplies both';
	});

	// -------------------------------------------------------- N: step planning

	const step = (over: Partial<SlideStepInput> = {}): SlideStepInput => ({
		step: 0,
		applied: -1,
		ready: true,
		separated: false,
		animate: true,
		reduced: false,
		...over,
	});

	r.row('N1', 'nothing happens before GSAP has loaded', () => {
		const plan = slide.planStep(step({ ready: false, step: 1 }));
		eq(plan, { kind: 'skip', reason: 'not-ready' }, 'plan');
		return 'the initial `set` calls have not run, so there is nothing to animate from';
	});

	r.row('N2', 'a step already applied is not re-applied', () => {
		const plan = slide.planStep(step({ step: 1, applied: 1, separated: true }));
		eq(plan, { kind: 'skip', reason: 'already-applied' }, 'plan');
		// This guard is what makes React's development double-invoke harmless.
		// Without it the second invocation re-enters the whole sequence and
		// captures a Flip state against a DOM that has already moved.
		return 'the guard that makes a double-invoked effect a no-op';
	});

	r.row('N3', 'crossing into the separated state captures before it moves', () => {
		const plan = slide.planStep(step({ step: 1 })) as Extract<SlidePlan, { kind: 'toggle' }>;
		eq(plan.kind, 'toggle', 'kind');
		eq(plan.want, true, 'want');
		eq(plan.capture, true, 'capture');
		eq(plan.still, false, 'still');
		return 'step 1 with separated=false is the one transition that needs a Flip state';
	});

	r.row('N4', 'crossing back captures too', () => {
		const plan = slide.planStep(step({ step: 0, applied: 1, separated: true })) as Extract<
			SlidePlan,
			{ kind: 'toggle' }
		>;
		eq(plan.kind, 'toggle', 'kind');
		eq(plan.want, false, 'want');
		eq(plan.capture, true, 'capture');
		return 'the move is reversible; a reset must animate back, not cut';
	});

	r.row('N5', 'a still slide takes no Flip state', () => {
		const reduced = slide.planStep(step({ step: 1, reduced: true })) as Extract<
			SlidePlan,
			{ kind: 'toggle' }
		>;
		eq(reduced.capture, false, 'capture under reduced motion');
		eq(reduced.still, true, 'still under reduced motion');

		const inert = slide.planStep(step({ step: 1, animate: false })) as Extract<
			SlidePlan,
			{ kind: 'toggle' }
		>;
		eq(inert.capture, false, 'capture with animate=false');
		eq(inert.still, true, 'still with animate=false');

		// Capturing anyway would be worse than wasteful: `Flip.from` on a still
		// slide would animate the node the OS setting asked it not to animate.
		return 'both reduced motion and animate=false suppress the capture';
	});

	r.row('N6', 'a step that does not cross the boundary only reveals', () => {
		const plan = slide.planStep(step({ step: 2, applied: 1, separated: true }));
		eq(plan, { kind: 'reveal', want: true, still: false }, 'plan');
		// The deck can advance past this slide's own steps while it stays mounted.
		return 'step 2 with separated=true re-runs the reveals and leaves the DOM alone';
	});

	// ----------------------------------------------------- L: lifecycle shape

	r.row(
		'L1',
		'the capture runs in the effect that plans the step, and the play in the layout effect',
		() => {
			const source = stripComments(read('next/src/components/deck/AccountSeparationSlide.tsx'));

			// Exactly once each, so "it is in the right place" cannot be satisfied by
			// a second copy somewhere else.
			eq(count(source, 'Flip.getState('), 1, 'Flip.getState call sites');
			eq(count(source, 'Flip.from('), 1, 'Flip.from call sites');

			// Bracketed to the hook that owns each call rather than to a character
			// offset: the capture must live in the PASSIVE effect that runs planStep,
			// and the play in the LAYOUT effect. A capture hoisted into the render
			// body is textually "before the layout effect" and is a different, worse
			// defect than the one this row exists to catch.
			const planning = hookBody(source, 'useEffect', 'planStep(');
			const playing = hookBody(source, 'useIsomorphicLayoutEffect', 'Flip.from(');

			must(
				planning.includes('Flip.getState('),
				'the capture is not in the effect that plans the step',
			);
			must(!planning.includes('Flip.from('), 'the play also runs in the pre-mutation phase');
			must(!playing.includes('Flip.getState('), 'the capture also runs after the commit');
			return 'getState only inside the planning effect, from only inside the layout effect';
		},
	);

	r.row('L2', 'the play is a layout effect, not a passive one', () => {
		const source = stripComments(read('next/src/components/deck/AccountSeparationSlide.tsx'));
		must(
			/useIsomorphicLayoutEffect\s*=\s*typeof window === 'undefined' \? useEffect : useLayoutEffect/.test(
				source,
			),
			'the layout effect is not SSR-guarded, or was renamed',
		);
		// A passive effect runs after paint, so the browser would show one frame
		// of the finished layout before Flip pulled the node back to its start.
		return 'useLayoutEffect on the client, useEffect during the export';
	});

	r.row('L3', 'every GSAP call is scoped to a revertible context', () => {
		const source = stripComments(read('next/src/components/deck/AccountSeparationSlide.tsx'));
		must(source.includes('gsap.context('), 'no gsap.context()');
		must(source.includes('.revert()'), 'the context is never reverted');
		must(/return\s*\(\)\s*=>\s*\{[\s\S]*?\.revert\(\)/.test(source), 'revert is not in a cleanup');
		must(source.includes('ctx.add('), 'later tweens are not added to the context');
		return 'context created on mount, reverted on cleanup, tweens added to it';
	});

	r.row('L4', 'plugin registration cannot run twice', () => {
		const loader = codeOnly(read('next/src/deck/gsap.ts'));
		must(/^let pending/m.test(loader), 'the memo is not module-scoped');
		must(count(loader, 'registerPlugin') === 1, 'registerPlugin is called more than once');
		// INSIDE the guard, not merely present alongside it. The three clauses were
		// spelling checks -- module-scoped `pending`, one registerPlugin, an
		// `if (!pending)` somewhere -- and all three survive moving the one
		// registration OUT of the memo so it runs on every call, which is precisely
		// the defect the row is named for.
		const guard = loader.match(/if \(!pending\) \{([\s\S]*?)\n\t\}/);
		must(guard !== null, 'the memo is not guarded');
		must(
			guard![1].includes('registerPlugin'),
			'registerPlugin runs outside the memo guard, so every call re-registers',
		);
		return 'one module-level promise; StrictMode remounts await it rather than re-registering';
	});

	r.row('L5', 'the captured state is a ref, not state', () => {
		const source = stripComments(read('next/src/components/deck/AccountSeparationSlide.tsx'));
		must(/const handoff = useRef/.test(source), 'the Flip handoff is not a ref');
		must(!/useState[^\n]*handoff/i.test(source), 'the handoff was made into state');
		// Storing it in state would schedule the very render it is trying to
		// measure, one render before the render it is measuring.
		return 'writing the capture must not schedule a render';
	});

	// -------------------------------------------------- K: keyboard precedence

	r.row('K1', 'both palette chords open it, on either modifier', () => {
		for (const letter of ['k', 'p']) {
			for (const modifier of ['meta', 'ctrl'] as const) {
				const plan = chord.planGlobalChord(key(letter, { [modifier]: true }), context('/'));
				eq(plan, { kind: 'open-palette' }, `${modifier}+${letter}`);
			}
		}
		return 'Cmd+K, Ctrl+K, Cmd+P, Ctrl+P';
	});

	r.row('K2', 'the palette chord is checked before the search chord', () => {
		// The ordering is the whole reason `handlePaletteShortcut` returns a
		// boolean in the Svelte original. Asserted two ways: the chord predicates
		// are disjoint on the letters, AND the combined plan never reaches search
		// for a palette letter even when the search chord would have been legal.
		must(!chord.isSearchChord(key('k', { meta: true })), 'k must not read as the search chord');
		must(!chord.isPaletteChord(key('f', { meta: true })), 'f must not read as the palette chord');
		eq(
			chord.planGlobalChord(key('k', { meta: true }), context('/')),
			{ kind: 'open-palette' },
			'k',
		);
		eq(
			chord.planGlobalChord(key('p', { meta: true }), context('/')),
			{ kind: 'open-palette' },
			'p',
		);
		return 'k and p never reach the search branch; f never reaches the palette branch';
	});

	r.row('K3', 'the search chord goes to the locale-correct search page', () => {
		eq(
			chord.planGlobalChord(key('f', { meta: true }), context('/')),
			{ kind: 'go-search', href: '/search' },
			'en',
		);
		eq(
			chord.planGlobalChord(key('f', { meta: true }), context('/ko/tags')),
			{ kind: 'go-search', href: '/ko/search' },
			'ko',
		);
		eq(chord.searchHref('/ko'), '/ko/search', 'the bare /ko route counts as Korean');
		return '/search on en routes, /ko/search on ko routes';
	});

	r.row('K4', 'each of the four search suppressions holds on its own', () => {
		const cases: [string, ChordContext][] = [
			['already on search', context('/search')],
			['already on ko search', context('/ko/search')],
			['a post detail page', context('/posts/redis-caching-patterns')],
			['typing in an input', context('/', { targetTag: 'INPUT' })],
			['typing in a textarea', context('/', { targetTag: 'TEXTAREA' })],
			['typing in a contenteditable', context('/', { targetEditable: true })],
		];
		for (const [label, ctx] of cases) {
			must(chord.searchSuppressed(ctx), `${label} should suppress the search chord`);
			eq(chord.planGlobalChord(key('f', { meta: true }), ctx), { kind: 'ignore' }, label);
		}
		// The list route is NOT a post detail page; a suppression that swallowed
		// it would disable the chord across the largest section of the site.
		must(!chord.searchSuppressed(context('/posts')), '/posts must not be suppressed');
		return 'six suppressing contexts, and /posts still allowed';
	});

	r.row('K5', 'the input suppression is what keeps the chords from colliding', () => {
		// While the palette is open, focus is in its input, so the layout-level
		// search chord is inert. That is the mechanism, and it is worth its own
		// row because it is the only thing standing between two live window
		// handlers that both answer a modifier chord.
		const inPalette = context('/migration-fixture/palette', { targetTag: 'INPUT' });
		eq(chord.planGlobalChord(key('f', { meta: true }), inPalette), { kind: 'ignore' }, 'Cmd+F');
		// Cmd+K, by contrast, still resolves -- and to open, never to toggle.
		eq(
			chord.planGlobalChord(key('k', { meta: true }), inPalette),
			{ kind: 'open-palette' },
			'Cmd+K',
		);
		return 'Cmd+F is inert inside the palette; Cmd+K stays an open, not a toggle';
	});

	r.row('K6', 'the open chord is an open, never a toggle', () => {
		const host = stripComments(read('next/src/components/palette/PaletteHost.tsx'));
		must(host.includes('setOpen(true)'), 'the host does not open on the chord');
		must(!/setOpen\(\s*\(?\s*\w*\s*\)?\s*=>\s*!/.test(host), 'the host toggles instead of opening');
		must(host.includes('onClose'), 'the host has no close path');
		// Escape is the only close. A toggle would make Cmd+K ambiguous whenever
		// the user could not see whether the palette was already up.
		return 'setOpen(true) on the chord; closing goes through onClose';
	});

	r.row('K7', 'a bare letter belongs to the search input, not to a chord', () => {
		for (const letter of ['k', 'p', 'f']) {
			eq(chord.planGlobalChord(key(letter), context('/')), { kind: 'ignore' }, `bare ${letter}`);
		}
		// If a modifier-free match existed, these three letters would be
		// unusable in a palette query, which is most of what the palette is for.
		return 'k, p and f with no modifier reach the window handler and are ignored';
	});

	r.row('K8', 'the dialog keys map to the four list actions', () => {
		eq(chord.planInputKey('ArrowUp'), 'move-up', 'ArrowUp');
		eq(chord.planInputKey('ArrowDown'), 'move-down', 'ArrowDown');
		eq(chord.planInputKey('Enter'), 'select', 'Enter');
		eq(chord.planInputKey('Escape'), 'close', 'Escape');
		for (const other of ['a', 'Tab', 'Shift', 'ArrowLeft']) {
			eq(chord.planInputKey(other), 'ignore', other);
		}
		return 'four actions, and every other key falls through to typing';
	});

	r.row('K9', 'the focus trap wraps at both ends and nowhere else', () => {
		const middle = { activeIsFirst: false, activeIsLast: false };
		eq(chord.planDialogKey(key('Escape'), middle), 'close', 'Escape anywhere closes');
		eq(
			chord.planDialogKey(key('Tab'), { activeIsFirst: false, activeIsLast: true }),
			'trap-to-first',
			'Tab at the end',
		);
		eq(
			chord.planDialogKey(key('Tab', { shift: true }), {
				activeIsFirst: true,
				activeIsLast: false,
			}),
			'trap-to-last',
			'Shift+Tab at the start',
		);
		eq(chord.planDialogKey(key('Tab'), middle), 'ignore', 'Tab in the middle');
		eq(
			chord.planDialogKey(key('Tab', { shift: true }), middle),
			'ignore',
			'Shift+Tab in the middle',
		);
		eq(chord.planDialogKey(key('a'), middle), 'ignore', 'a letter');
		return 'Escape closes from anywhere; Tab only wraps at the two edges';
	});

	r.row('K10', 'selection clamps rather than wrapping', () => {
		eq(chord.moveSelection(0, 'move-up', 5), 0, 'up at the top');
		eq(chord.moveSelection(4, 'move-down', 5), 4, 'down at the bottom');
		eq(chord.moveSelection(2, 'move-up', 5), 1, 'up in the middle');
		eq(chord.moveSelection(2, 'move-down', 5), 3, 'down in the middle');
		// An empty list clamps to -1 going down, which is why every consumer
		// checks `results[selectedIndex]` before using it.
		eq(chord.moveSelection(0, 'move-down', 0), -1, 'down in an empty list');
		return 'no wrap in either direction, as in the original';
	});

	// ------------------------------------------------------- F: the result list

	const fixture = (): PaletteItem[] => {
		const { navigate } = recorder();
		const posts = [
			post('oldest', '2024-01-01'),
			post('newest', '2026-06-01'),
			post('middle', '2025-03-01'),
			...Array.from({ length: 9 }, (_, i) => post(`filler-${i}`, `2025-01-0${(i % 9) + 1}`)),
		];
		return registry.buildPaletteItems(posts, '/', navigate, 'en');
	};

	r.row('F1', 'the empty query caps posts and keeps every command', () => {
		const items = fixture();
		const shown = list.defaultResults(items);
		const posts = shown.filter((row) => row.item.group === 'post');
		const commands = shown.filter((row) => row.item.group !== 'post');

		eq(posts.length, DEFAULT_POST_LIMIT, 'capped post count');
		eq(commands.length, 15, 'nav + action count');
		must(
			items.filter((i) => i.group === 'post').length > DEFAULT_POST_LIMIT,
			'the fixture must exceed the cap',
		);
		// UX-3: without the cap the default view is every post the site has,
		// which is what the cap was introduced to stop.
		return `${commands.length} commands in full, ${posts.length} of 12 posts`;
	});

	r.row('F2', 'the default posts are the most recent ones', () => {
		const shown = list.defaultResults(fixture()).filter((row) => row.item.group === 'post');
		eq(shown[0].item.id, 'post:newest', 'first default post');
		const dates = shown.map((row) => row.item.meta?.date ?? '');
		const sorted = [...dates].sort().reverse();
		eq(dates, sorted, 'default post ordering');
		must(!shown.some((row) => row.item.id === 'post:oldest'), 'the oldest post survived the cap');
		return 'newest first, and the 2024 post falls outside the cap';
	});

	r.row('F3', 'grouping preserves rank inside each section', () => {
		const items = fixture();
		// A deliberately interleaved list whose intra-group order is known.
		const shuffled = [
			itemOf(items, 'post:newest'),
			itemOf(items, 'nav:posts'),
			itemOf(items, 'action:rss'),
			itemOf(items, 'post:middle'),
			itemOf(items, 'nav:home'),
		].map((item, index) => ({ item, score: index / 10 }));

		const grouped = list.groupResults(shuffled);
		eq(
			grouped.map((row) => row.item.id),
			['nav:posts', 'nav:home', 'action:rss', 'post:newest', 'post:middle'],
			'grouped order',
		);
		// nav:posts before nav:home and post:newest before post:middle are the
		// input order, not an alphabetical or score order -- that is the point.
		return 'sections in nav/action/post order, input order kept inside each';
	});

	r.row('F4', 'exactly one header per section', () => {
		const grouped = list.groupResults(list.defaultResults(fixture()));
		const headers = grouped.filter((_, index) => list.startsSection(grouped, index));
		eq(
			headers.map((row) => row.item.group),
			['nav', 'action', 'post'],
			'header positions',
		);
		must(!list.startsSection(grouped, 1), 'the second row of a section must not repeat its header');
		return 'three headers for three sections, none repeated';
	});

	r.row('F5', 'the Fuse ranking configuration is the transcribed one', () => {
		const svelte = read('src/lib/fuzzy.ts');
		const ported = read('next/src/palette/fuzzy.ts');
		const options = (source: string) =>
			(
				source.match(/(weight: [\d.]+|threshold: [\d.]+|minMatchCharLength: \d+|name: '\w+')/g) ??
				[]
			).join('|');
		must(options(svelte).length > 0, 'the option scraper matched nothing on the Svelte side');
		eq(options(ported), options(svelte), 'Fuse options');

		// And that they still behave: a title-ish query outranks a tag-ish one,
		// which is what the 0.5/0.3/0.2 weighting buys.
		const items = fixture();
		const hits = fuzzySearch(createPaletteFuse(items), 'Title newest');
		must(hits.length > 0, 'the fixture query matched nothing');
		eq(hits[0].item.id, 'post:newest', 'top hit');
		return `${options(svelte).split('|').length} option values identical, and the ranking still resolves`;
	});

	r.row('F6', 'match highlighting splits at the edges as well as the middle', () => {
		eq(
			list.highlightMatches('redis', [[0, 1]]),
			[
				{ text: 're', highlighted: true },
				{ text: 'dis', highlighted: false },
			],
			'match at the start',
		);
		eq(
			list.highlightMatches('redis', [[3, 4]]),
			[
				{ text: 'red', highlighted: false },
				{ text: 'is', highlighted: true },
			],
			'match at the end',
		);
		eq(
			list.highlightMatches('redis', [
				[1, 1],
				[3, 3],
			]),
			[
				{ text: 'r', highlighted: false },
				{ text: 'e', highlighted: true },
				{ text: 'd', highlighted: false },
				{ text: 'i', highlighted: true },
				{ text: 's', highlighted: false },
			],
			'two disjoint matches',
		);
		eq(list.highlightMatches('redis', []), [{ text: 'redis', highlighted: false }], 'no match');
		return 'start, end, disjoint and empty all split correctly';
	});

	// ---------------------------------------------------- I: the item registry

	r.row('I1', 'the nine navigation entries survived with their paths', () => {
		const { navigate, hrefs } = recorder();
		const nav = registry.buildNavItems('/', navigate, 'en');
		eq(nav.length, 9, 'nav count');
		eq(
			nav.map((item) => item.id),
			[
				'nav:home',
				'nav:about',
				'nav:study',
				'nav:posts',
				'nav:tags',
				'nav:projects',
				'nav:contact',
				'nav:search',
				'nav:system',
			],
			'nav ids',
		);
		for (const item of nav) item.run();
		eq(
			hrefs,
			[
				'/',
				'/about',
				'/study',
				'/posts',
				'/tags',
				'/projects',
				'/contact',
				'/search',
				'/system/3b',
			],
			'nav hrefs',
		);
		return 'nine entries, nine hrefs, in the original order';
	});

	r.row('I2', 'navigation is locale-aware on both sides of the prefix', () => {
		eq(registry.localePath('/', '/posts'), '/posts', 'en stays bare');
		eq(registry.localePath('/ko/tags', '/posts'), '/ko/posts', 'ko gains the prefix');
		eq(registry.localePath('/ko/tags', '/'), '/ko', 'ko home is /ko, not /ko/');
		must(registry.isKorean('/ko'), '/ko is Korean');
		must(registry.isKorean('/ko/posts'), '/ko/posts is Korean');
		must(!registry.isKorean('/korean-things'), '/korean-things is not Korean');
		// That last one is why the check is `=== '/ko' || startsWith('/ko/')`
		// rather than a prefix test.
		return 'the prefix test does not swallow routes that merely start with ko';
	});

	r.row('I3', 'the six actions survived, and the language switch is reversible', () => {
		const { navigate, hrefs } = recorder();
		const en = registry.buildActionItems('/posts', navigate, 'en');
		eq(en.length, 6, 'action count');
		eq(
			en.map((item) => item.id),
			[
				'action:switch-language',
				'action:copy-link',
				'action:rss',
				'action:github',
				'action:linkedin',
				'action:email',
			],
			'action ids',
		);
		itemOf(en, 'action:switch-language').run();
		eq(hrefs, ['/ko/posts'], 'en to ko');

		const back = recorder();
		itemOf(
			registry.buildActionItems('/ko/posts', back.navigate, 'ko'),
			'action:switch-language',
		).run();
		eq(back.hrefs, ['/posts'], 'ko to en');

		const home = recorder();
		itemOf(registry.buildActionItems('/ko', home.navigate, 'ko'), 'action:switch-language').run();
		eq(home.hrefs, ['/'], 'the ko home falls back to / rather than an empty href');
		return 'six actions; the switch round-trips and does not produce an empty path';
	});

	r.row('I4', 'a post carries everything the row renders and the index searches', () => {
		const { navigate, hrefs } = recorder();
		const item = registry.postToItem(
			post('redis-caching-patterns', '2026-01-15'),
			'/ko/posts',
			navigate,
		);
		eq(item.id, 'post:redis-caching-patterns', 'id');
		eq(item.keywords, ['alpha', 'beta', 'backend', 'redis-caching-patterns'], 'keywords');
		eq(item.meta, { category: 'backend', date: '2026-01-15', tags: ['alpha', 'beta'] }, 'meta');
		item.run();
		eq(hrefs, ['/ko/posts/redis-caching-patterns'], 'href');
		return 'tags, category and slug all reach Fuse; the href is locale-aware';
	});

	r.row('I5', 'the full set is nav, then actions, then posts', () => {
		const { navigate } = recorder();
		const items = registry.buildPaletteItems([post('a', '2026-01-01')], '/', navigate, 'en');
		eq(items.length, 16, 'total');
		eq(
			items.slice(0, 9).every((item) => item.group === 'nav'),
			true,
			'nav block',
		);
		eq(
			items.slice(9, 15).every((item) => item.group === 'action'),
			true,
			'action block',
		);
		eq(items[15].group, 'post', 'post block');
		// defaultResults relies on this ordering rather than re-sorting.
		return 'the order defaultResults assumes is the order buildPaletteItems produces';
	});

	r.row('I6', 'labels are localized, and the locale actually reaches them', () => {
		const { navigate } = recorder();
		const en = registry.buildNavItems('/', navigate, 'en');
		const ko = registry.buildNavItems('/ko', navigate, 'ko');
		must(
			itemOf(en, 'nav:home').label !== itemOf(ko, 'nav:home').label,
			'both locales render the same label',
		);
		eq(itemOf(en, 'nav:home').label, 'Home', 'en label');
		// An explicit locale is required under `output: 'export'`: there is no
		// request context for an ambient one to live in.
		const source = codeOnly(read('next/src/palette/items.ts'));
		// The call form, not an object shorthand that could appear anywhere: the
		// point is that the locale reaches the message functions, not that the
		// word appears in the file.
		// UNIVERSAL, not existential. `/m\.\w+\(\{\}, at\)/.test()` is satisfied by
		// ONE surviving localized call: round 2 stripped `, at` from 14 of the 15
		// and the row stayed green. Every message call has to carry the locale, so
		// count them and require the two counts to agree.
		const allCalls = source.match(/m\.\w+\(/g) ?? [];
		const localizedCalls = source.match(/m\.\w+\(\{\}, at\)/g) ?? [];
		must(allCalls.length > 0, 'no message functions are called at all');
		eq(
			localizedCalls.length,
			allCalls.length,
			'message calls carrying an explicit locale, out of all message calls',
		);
		must(/const at = \{ locale \}/.test(source), '`at` no longer carries the caller locale');
		return `en "${itemOf(en, 'nav:home').label}" vs ko "${itemOf(ko, 'nav:home').label}"`;
	});

	// I7 exists because NO comparator row can reach this. The palette renders only
	// on a chord, so its ordering never lands in the exported HTML the harness
	// diffs -- round 2 found the first screen ordered differently from Svelte's and
	// nothing in 24 suites had a word to say about it.
	r.row('I7', 'the palette receives posts in the order the Svelte layout hands them', () => {
		// The corpus is read here rather than through `listPublishedPosts`, whose
		// CONTENT_ROOT is resolved against `next/` as the cwd (posts.ts:38) and so
		// points outside the repo when the harness runs from the root. The order
		// below is `relativePath`, which is exactly what that loader would return
		// (posts.ts:201-203) -- the input the contract has to reorder.
		const postsDir = join(root, 'src/content/posts/en');
		const files = (readdirSync(postsDir, { recursive: true }) as string[])
			.filter((file) => file.endsWith('.md'))
			.map((file) => file.split(sep).join('/'))
			.sort();
		const published = files
			.map((file) => ({
				slug: file.split('/').pop()!.replace(/\.md$/, ''),
				frontmatter: matter(readFileSync(join(postsDir, file), 'utf8')).data as {
					date: string | Date;
					updated?: string | Date;
					draft?: boolean;
				},
			}))
			.filter((post) => post.frontmatter.draft !== true);
		must(published.length > 0, 'no published EN posts were read');

		const ordered = orderPosts(published);

		// 1. The ordering is what it claims: effectiveDate, descending.
		for (let i = 1; i < ordered.length; i += 1) {
			must(
				paletteOrderKey(ordered[i - 1]) >= paletteOrderKey(ordered[i]),
				`posts ${i - 1} and ${i} are out of effectiveDate order`,
			);
		}

		// 2. It is not a no-op on this corpus. Without this clause the row would
		//    pass identically against `posts => posts`, which is the defect itself.
		const untouched = published.map((post) => post.slug).join();
		const sorted = ordered.map((post) => post.slug).join();
		must(untouched !== sorted, 'the ordering changes nothing here, so it proves nothing');

		// 3. The fixture page routes through the shared module rather than
		//    re-spelling a sort that dies with the route at Slice 4.
		const page = codeOnly(read('next/app/(en)/migration-fixture/palette/page.tsx'));
		must(/orderPostsForPalette\(/.test(page), 'the page does not CALL the ordering contract');
		must(!/\.sort\(/.test(page), 'the page sorts inline instead of using the contract');

		return `${ordered.length} published EN posts ordered by effectiveDate, ${
			sorted === untouched ? 0 : 1
		} divergence from source order`;
	});

	// ------------------------------------------------------ A: A11Y-1 preserved

	r.row('A1', 'focus returns to whatever held it, which is the recorded defect', () => {
		const source = stripComments(read('next/src/components/palette/FuzzyFinder.tsx'));

		// The BINDING, not a vocabulary of names. An earlier version of this row
		// blacklisted `openerRef|triggerRef|openedBy`, which a fix under any
		// fourth name walked straight past -- and its control injected one of the
		// three literals, so it only ever proved the blacklist matched itself.
		// What has to hold is that the restore target is bound to the element that
		// held focus at mount and to nothing else.
		must(
			/previouslyFocused\.current = restoreFocusTarget\(\);/.test(source),
			'the restore target is no longer bound to restoreFocusTarget()',
		);
		eq(count(source, 'previouslyFocused.current ='), 1, 'assignments to the restore target');
		// NOT containment. `[^}]*document.activeElement` accepts a body that
		// consults something else FIRST and only falls back to activeElement --
		// which is a genuine A11Y-1 fix, and round 2 demonstrated one staying green
		// under it. The escape the blacklist rewrite closed had simply moved one
		// function down. Assert the body exactly, so activeElement is the SOLE
		// source of the restore target.
		const restoreBody = source.match(/function restoreFocusTarget\(\)[^{]*\{([\s\S]*?)\n\}/);
		must(restoreBody !== null, 'restoreFocusTarget is missing or no longer a function declaration');
		eq(
			restoreBody![1].replace(/\s+/g, ' ').trim(),
			'return (document.activeElement as HTMLElement | null) ?? null;',
			'the restoreFocusTarget body',
		);
		must(
			/return \(\) => restore\?\.focus\?\.\(\);/.test(source),
			'focus is not restored on unmount',
		);
		must(
			/const restore = previouslyFocused\.current;/.test(source),
			'the restored value is not the captured one',
		);

		// behavior-matrix.md:122 records focus landing on BODY after Escape and
		// assigns the fix to the Slice 3 palette port. Reproducing it is the
		// requirement here; fixing it early would leave the baseline row
		// describing neither stack.
		return 'the restore target is document.activeElement at mount, assigned once, as in the original';
	});

	r.row('A2', 'the combobox contract the original shipped is intact', () => {
		// stripComments first: the `\s`-anchor below closed the `data-role=` hole
		// but left the comment channel open, so `// role="option"` above an
		// attribute that had been renamed still satisfied the loop.
		const source = stripComments(read('next/src/components/palette/FuzzyFinder.tsx'));
		// Matched with the whitespace that must precede a real JSX attribute,
		// because `data-role="option"` CONTAINS `role="option"` and a plain
		// includes() passes on a renamed attribute. Not hypothetical: the first
		// control written for this row renamed it exactly that way and the row
		// stayed green.
		for (const attribute of [
			'role="dialog"',
			'aria-modal="true"',
			'role="combobox"',
			'aria-autocomplete="list"',
			'aria-haspopup="listbox"',
			'aria-controls={RESULTS_LIST_ID}',
			'aria-activedescendant={activeOptionId}',
			'role="listbox"',
			'role="option"',
		]) {
			const pattern = new RegExp(`\\s${attribute.replace(/[{}[\]()*+?.\\^$|]/g, '\\$&')}`);
			must(pattern.test(source), `missing ${attribute}`);
		}
		return 'nine ARIA hooks carried over unchanged';
	});

	// ------------------------------------------------------- P: port roll-call

	r.row('P1', 'every Svelte source has a counterpart', () => {
		const missing: string[] = [];
		for (const role of PORT_ROLES) {
			if (!exists(role.svelte)) missing.push(`${role.svelte} (source gone)`);
			if (!exists(role.next)) missing.push(`${role.next} (target missing)`);
		}
		must(missing.length === 0, `unmapped: ${missing.join(', ')}`);
		for (const addition of PORT_ADDITIONS) {
			must(exists(addition.next), `missing addition ${addition.next}`);
		}
		return `${PORT_ROLES.length} roles mapped, ${PORT_ADDITIONS.length} additions present`;
	});

	r.row('P2', 'the client boundary is where it was declared', () => {
		const wrong: string[] = [];
		for (const [file, needsDirective] of Object.entries(clientBoundary)) {
			const first =
				read(file)
					.split('\n')
					.find((line) => line.trim().length > 0) ?? '';
			// A real directive, not a line that mentions one: `// 'use client';`
			// satisfies a substring test while Next treats the module as a server
			// component.
			const has = /^\s*(['"])use client\1\s*;?\s*$/.test(first);
			if (has !== needsDirective) {
				wrong.push(`${file} ${has ? 'has' : 'lacks'} the directive, expected ${needsDirective}`);
			}
		}
		must(wrong.length === 0, wrong.join('; '));
		const pure = Object.values(clientBoundary).filter((value) => !value).length;
		return `${Object.keys(clientBoundary).length} modules; ${pure} must stay server-reachable`;
	});

	r.row('P3', 'no Next module imports Svelte', () => {
		const roots = options.scanRoots ?? ['next/src', 'next/app'];
		const offenders: string[] = [];
		let scanned = 0;
		for (const dir of roots) {
			for (const file of walk(resolve(root, dir))) {
				if (!/\.(ts|tsx)$/.test(file)) continue;
				if (file.includes(`${'/'}paraglide${'/'}`)) continue;
				scanned += 1;
				// stripComments, NOT codeOnly: codeOnly empties string literals, and
				// the import specifier IS a string literal, so the scan would look
				// at `from ''` and find nothing. Comments still go, so a sentence
				// about `from 'svelte'` cannot satisfy the guard either.
				if (SVELTE_IMPORT.test(stripComments(readFileSync(file, 'utf8')))) {
					offenders.push(relative(root, file));
				}
			}
		}
		must(offenders.length === 0, `svelte imports in ${offenders.join(', ')}`);
		// A scan of nothing finds nothing. `walk` returns [] for a missing
		// directory, so a renamed `next/src` would silently turn this row into a
		// check of zero files that still reports PASS. S5 carries the same guard
		// for the same reason.
		must(scanned > 0, `the scan roots matched no modules at all: ${roots.join(', ')}`);
		return `${scanned} Next modules scanned, 0 svelte imports`;
	});

	r.row('P4', 'the two new dependencies are pinned exactly', () => {
		const manifest = JSON.parse(read('next/package.json')) as {
			dependencies: Record<string, string>;
		};
		for (const [name, pin] of Object.entries(dependencyPins)) {
			const found = manifest.dependencies[name];
			must(found !== undefined, `${name} is not a runtime dependency of next/`);
			eq(found, pin, `${name} pin`);
			must(!found.startsWith('^') && !found.startsWith('~'), `${name} is not pinned exactly`);
		}
		// Both are dependencies the Svelte side already carries for these same
		// two surfaces, so they are ported cost rather than a new library.
		const rootManifest = JSON.parse(read('package.json')) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		for (const name of Object.keys(dependencyPins)) {
			must(
				Boolean(rootManifest.dependencies?.[name] ?? rootManifest.devDependencies?.[name]),
				`${name} is not already a Svelte-side dependency, so it is new cost`,
			);
		}
		return Object.entries(dependencyPins)
			.map(([n, v]) => `${n}@${v}`)
			.join(', ');
	});

	// ---------------------------------------------------------- S: the exports

	r.row('S1', 'both spike routes exported, and both are noindex', () => {
		for (const page of [DECK_PAGE, PALETTE_PAGE]) {
			const file = join(buildDir, ...page);
			must(existsSync(file), `${page.join('/')} was not exported`);
			const html = readFileSync(file, 'utf8');
			must(/name="robots"[^>]*noindex/.test(html), `${page.join('/')} is missing noindex`);
		}
		return 'deck.html and palette.html, both noindex,nofollow';
	});

	r.row('S2', 'the deck export holds the slide at step 0 and no further', () => {
		const html = readFileSync(join(buildDir, ...DECK_PAGE), 'utf8');
		for (const sentinel of DECK_SENTINELS) {
			must(html.includes(sentinel), `missing ${sentinel}`);
		}
		eq(count(html, 'data-flip-id'), deckCounts.flipIds, 'data-flip-id count');
		eq(count(html, 'class="account nested"'), deckCounts.nested, 'nested account');
		eq(count(html, 'class="chip"'), deckCounts.chips, 'chip count');
		// One flip id and a nested account is the BEFORE state. The separated
		// state renders two account cards and six chips, so a build that shipped
		// step 1 would double the first number and stop matching here.
		return `${deckCounts.flipIds} flip node, nested, ${deckCounts.chips} chips`;
	});

	r.row('S3', 'the palette export is the CLOSED state', () => {
		const html = readFileSync(join(buildDir, ...PALETTE_PAGE), 'utf8');
		must(!html.includes('cmdk-overlay'), 'the dialog was rendered into static HTML');
		must(!html.includes('role="listbox"'), 'the results list was rendered into static HTML');
		must(html.includes('<kbd>Cmd</kbd>'), 'the page did not render at all');
		// The palette opens on a chord. A dialog in the export would mean it
		// mounts on every page load, which on the real shell would put a modal
		// over all 366 routes.
		return 'no overlay and no listbox in the export; the host page rendered';
	});

	r.row('S4', 'the ledger approves exactly one page row per spike route', () => {
		const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8')) as {
			url: string;
			field: string;
			fingerprint: string | null;
		}[];
		for (const url of [DECK_URL, PALETTE_URL]) {
			const entries = ledger.filter((entry) => entry.url === url);
			eq(entries.length, 1, `${url} ledger entries`);
			eq(entries[0].field, 'page', `${url} field`);
			must(typeof entries[0].fingerprint === 'string', `${url} approval carries no fingerprint`);
			must((entries[0].fingerprint as string).length === 32, `${url} fingerprint is not a digest`);
		}
		// One entry each, and page-only: an approval that had grown a second
		// field would mean the route started differing in content as well as
		// presence, which is not what was approved.
		return 'two entries, field `page`, both fingerprint-bound';
	});

	r.row('S5', 'GSAP is not in the chunk set the exported page loads eagerly', () => {
		const html = readFileSync(join(buildDir, ...DECK_PAGE), 'utf8');
		const eager = new Set<string>();
		for (const match of html.matchAll(/(?:src|href)="([^"]+\.js)"/g)) eager.add(match[1]);
		must(eager.size > 0, 'the exported page references no scripts at all');

		let eagerHits = 0;
		let lazyHits = 0;
		for (const file of walk(join(buildDir, '_next'))) {
			if (!file.endsWith('.js')) continue;
			const url = `/_next/${relative(join(buildDir, '_next'), file).split('\\').join('/')}`;
			const body = readFileSync(file, 'utf8');
			if (!body.includes(GSAP_SENTINEL) && !body.includes(GSAP_SENTINEL_ALT)) continue;
			if (eager.has(url)) eagerHits += 1;
			else lazyHits += 1;
		}

		must(lazyHits > 0, 'no chunk contains GSAP at all -- the sentinel no longer matches anything');
		must(eagerHits === 0, `GSAP is in ${eagerHits} eagerly referenced chunk(s)`);
		// The dynamic import is what keeps a 70KB animation library off every
		// page that merely LINKS to a deck route.
		return `${lazyHits} lazy chunk(s) carry GSAP, 0 of the ${eager.size} eager ones do`;
	});

	// ------------------------------------------------------------ C: typecheck

	if (!options.skipTypecheck) {
		r.row('C1', 'the ported modules typecheck and are in the program', () => {
			const project = options.tsconfigProject ?? 'next/tsconfig.json';
			const result = typecheckWithFileList(root, project);
			must(result.code === 0, `tsc exited ${result.code}\n${result.output.slice(0, 1200)}`);

			const expected = [
				...PORT_ROLES.filter((role) => role.next.endsWith('.ts') || role.next.endsWith('.tsx')).map(
					(role) => role.next,
				),
				...PORT_ADDITIONS.map((addition) => addition.next),
			];
			const missing = expected.filter(
				(file) => !result.files.some((seen) => seen.endsWith(file.replace('next/', ''))),
			);
			// `--noEmit` exiting 0 proves nothing on its own: a widened `exclude`
			// makes it green while checking none of these files.
			must(missing.length === 0, `not in the tsc program: ${missing.join(', ')}`);
			return `tsc exit 0, ${expected.length} ported modules in a program of ${result.files.length} files`;
		});
	}

	options.onRows?.(r.rows);

	const failed = r.rows.filter((row) => !row.ok);
	if (!options.quiet) {
		console.log(
			`\nSlice 2 GSAP + palette: ${r.rows.length - failed.length}/${r.rows.length} rows pass across ` +
				'T (tween arithmetic), N (step planning), L (lifecycle shape), K (keyboard), ' +
				'F (result list), I (item registry), A (A11Y-1), P (port roll-call), S (exports), C (typecheck)',
		);
		if (failed.length > 0) console.log(`FAILED: ${failed.map((row) => row.id).join(', ')}`);
	}

	return failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith('assert-slice2-gsap-palette.ts')) {
	try {
		process.exit(runAssertions());
	} catch (error) {
		console.error(`FATAL: ${(error as Error).stack ?? String(error)}`);
		process.exit(2);
	}
}
