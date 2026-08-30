import unified from 'unified9';
import remarkParse8 from 'remark-parse8';
import { retext } from 'retext';
import { visit } from 'unist-util-visit';

/**
 * mdsvex's smart-typography step, ported — educators AND node boundaries.
 *
 * mdsvex enables `smartypants: true` by default, so every post in the baseline
 * is typeset: `--` becomes an em dash, straight quotes become curly ones. Three
 * rounds of review have established that copying the educators is not enough,
 * because smartypants reads a character's NEIGHBOURS and the neighbours depend
 * on where the markdown parser drew its text nodes:
 *
 *   1. `retext-smartypants@6` disagrees with mdsvex's bundled copy in one
 *      branch of the quote educator. Five posts differed. Fixed by transcribing
 *      mdsvex's educators below.
 *   2. mdsvex runs remark-parse 8, which builds a `linkReference` for
 *      `[bot]` where CommonMark keeps literal text, so `claude[bot]'s` is one
 *      text node here and three there. A regex that split on a bracket label
 *      fixed that one shape and 334/334 posts.
 *   3. The regex was still wrong. `[*a*]'s`, `[**a**]'s`, `` [`a`]'s `` and
 *      `[a\]b]'s` all place the apostrophe differently once the label has
 *      inline children or an escape, and a reviewer found them. There is no
 *      regex for "where does remark-parse 8 end an inline node"; the only
 *      faithful answer is remark-parse 8.
 *
 * So the source is segmented by remark-parse 8 ITSELF (pinned in `next/` as a
 * dev dependency alongside `unified@9`, which is the last unified that speaks
 * its parser API), each text node is educated with mdsvex's educators, and the
 * results are spliced back into the markdown by source offset. The Next
 * pipeline then parses ALREADY-TYPESET markdown, so micromark's own node
 * boundaries never enter the question.
 *
 * That makes this a source PREPROCESSOR, not a remark plugin. It is a temporary
 * cost of running two markdown stacks at once: it leaves with mdsvex.
 *
 * Code is untouched, because `code` and `inlineCode` are their own node types
 * and only `text` is visited.
 */

const PUNCTUATION = 'PunctuationNode';
const SYMBOL = 'SymbolNode';
const WORD = 'WordNode';
const WHITE_SPACE = 'WhiteSpaceNode';

const DECADE = /^\d\ds$/;
const THREE_FULL_STOPS = /^\.{3,}$/;
const FULL_STOPS = /^\.+$/;

const EM_DASH = '—';
const ELLIPSIS = '…';

const OPENING: Record<string, string> = { '"': '“', "'": '‘' };
const CLOSING: Record<string, string> = { '"': '”', "'": '’' };

/** The nlcst shape these educators actually touch. Typed locally rather than
 * pulled from `@types/unist`, because the retext tree is the only consumer. */
interface NlcstNode {
	type: string;
	value?: string;
	children?: NlcstNode[];
}

interface NlcstParent extends NlcstNode {
	children: NlcstNode[];
}

/** `nlcst-to-string`, inlined: the concatenated text of a node and its children. */
function toString(node: NlcstNode): string {
	if (typeof node.value === 'string') return node.value;
	return (node.children ?? []).map(toString).join('');
}

/** Two dashes become an em dash. mdsvex's default; `oldschool`/`inverted` unused. */
function dashes(node: NlcstNode): void {
	if (node.value === '--') node.value = EM_DASH;
}

/** Double backticks and two single quotes become smart double quotes. */
function backticks(node: NlcstNode): void {
	if (node.value === '``') node.value = OPENING['"'];
	else if (node.value === "''") node.value = CLOSING['"'];
}

/** Three or more dots — adjacent or separated by white space — become one ellipsis. */
function ellipses(
	node: NlcstNode,
	index: number | undefined,
	parent: NlcstParent | undefined,
): void {
	if (index === undefined || !parent) return;
	const siblings = parent.children;
	const value = node.value ?? '';

	if (THREE_FULL_STOPS.test(value)) {
		node.value = ELLIPSIS;
		return;
	}
	if (!FULL_STOPS.test(value)) return;

	const nodes: NlcstNode[] = [];
	let position = index;
	let count = 1;

	// A node merged with an adjacent word node cannot be transformed: there is
	// no reference to the grandparent. mdsvex's comment, and its `> 0` bound.
	while (--position > 0) {
		let sibling = siblings[position];
		if (sibling.type !== WHITE_SPACE) break;
		const queue = sibling;
		sibling = siblings[--position];
		const type = sibling && sibling.type;
		if (
			sibling &&
			(type === PUNCTUATION || type === SYMBOL) &&
			FULL_STOPS.test(sibling.value ?? '')
		) {
			nodes.push(queue, sibling);
			count++;
			continue;
		}
		break;
	}

	if (count < 3) return;
	siblings.splice(index - nodes.length, nodes.length);
	node.value = ELLIPSIS;
}

/** Straight quotes become curly ones. Transcribed branch for branch. */
function quotes(node: NlcstNode, index: number | undefined, parent: NlcstParent | undefined): void {
	if (index === undefined || !parent) return;
	const siblings = parent.children;
	const value = node.value;
	if (value !== '"' && value !== "'") return;

	const previous = siblings[index - 1];
	const next = siblings[index + 1];
	const nextNext = siblings[index + 2];
	const nextValue = next && toString(next);

	if (
		next &&
		nextNext &&
		(next.type === PUNCTUATION || next.type === SYMBOL) &&
		nextNext.type !== WORD
	) {
		// The very first character is a quote followed by punctuation at a
		// non-word-break: close by brute force. `nextNext` is REQUIRED here, and
		// that requirement is the whole difference from retext-smartypants@6.
		node.value = CLOSING[value];
	} else if (nextNext && (nextValue === '"' || nextValue === "'") && nextNext.type === WORD) {
		// Double sets of quotes: `He said, "'Quoted' words in a larger quote."`
		node.value = OPENING[value];
		next.value = OPENING[nextValue];
	} else if (next && DECADE.test(nextValue ?? '')) {
		// Decade abbreviations: `the '80s`
		node.value = CLOSING[value];
	} else if (
		previous &&
		next &&
		(previous.type === WHITE_SPACE || previous.type === PUNCTUATION || previous.type === SYMBOL) &&
		next.type === WORD
	) {
		node.value = OPENING[value];
	} else if (
		previous &&
		previous.type !== WHITE_SPACE &&
		previous.type !== SYMBOL &&
		previous.type !== PUNCTUATION
	) {
		node.value = CLOSING[value];
	} else if (!next || next.type === WHITE_SPACE || (value === "'" && nextValue === 's')) {
		// mdsvex also tests `value === '\u2019'` here. That branch is unreachable in
		// mdsvex too -- the guard at the top of this function returns unless the
		// value is a straight quote -- so it is dropped rather than transcribed as
		// dead code the type checker would reject.
		node.value = CLOSING[value];
	} else {
		node.value = OPENING[value];
	}
}

/** mdsvex's `transformFactory`: quotes, then ellipses, then backticks, then dashes. */
const EDUCATORS = [quotes, ellipses, backticks, dashes];

function smartypants() {
	return (tree: NlcstNode): void => {
		visit(tree as never, (node: NlcstNode, index: number | undefined, parent: NlcstParent) => {
			if (node.type !== PUNCTUATION && node.type !== SYMBOL) return;
			for (const educate of EDUCATORS) educate(node, index ?? undefined, parent);
		});
	};
}

/** Educate one string with mdsvex's educators. Exported for the oracle controls. */
export function educateSpan(span: string): string {
	return span === '' ? span : String(PROCESSOR.processSync(span));
}

const PROCESSOR = retext().use(smartypants);

interface TextNode {
	type: string;
	value?: string;
	position?: { start: { offset?: number }; end: { offset?: number } };
	children?: TextNode[];
}

/**
 * Map each index of a decoded node value back to its offset in the raw source.
 *
 * remark-parse resolves backslash escapes, so a node whose value is `]` may
 * occupy two source characters. Splicing an educated value straight over the
 * raw range would delete the escape — `\$50` would silently become `$50`, which
 * is one of the very content differences this lane is trying NOT to introduce.
 * Returns null when the two cannot be lined up, and the caller then leaves that
 * node alone rather than guessing.
 */
function offsetMap(raw: string, value: string): number[] | null {
	const map: number[] = [];
	let j = 0;
	for (let i = 0; i < value.length; i += 1) {
		// Continuation markup. A wrapped line inside a list item carries leading
		// spaces and inside a block quote a `> ` marker, and the parser strips both
		// from the value, so the raw cursor has to walk past them. 71 posts wrap a
		// line that way, which is how this was found: every one of them had a node
		// the map could not line up, so every one of them silently lost its
		// typography and the corpus check reported all 71.
		if (i > 0 && value[i - 1] === '\n') {
			while (
				j < raw.length &&
				(raw[j] === ' ' || raw[j] === '\t' || raw[j] === '>') &&
				raw[j] !== value[i]
			) {
				j += 1;
			}
		}
		if (raw[j] === '\\' && raw[j + 1] === value[i]) j += 1;
		if (raw[j] !== value[i]) return null;
		map.push(j);
		j += 1;
	}
	map.push(j);
	// A node that ends on a newline can leave the NEXT line's continuation markup
	// inside its raw range — indentation, or a block quote's `> `. That trailing
	// run is markup, not content, so it may remain unconsumed. Nothing else may.
	let tail = j;
	while (tail < raw.length && (raw[tail] === ' ' || raw[tail] === '\t' || raw[tail] === '>')) {
		tail += 1;
	}
	return tail === raw.length ? map : null;
}

/** A single educated replacement, in SOURCE coordinates. */
interface Splice {
	start: number;
	end: number;
	text: string;
}

/**
 * Educated replacements for one text node, or null if it must be left alone.
 *
 * The educated value is compared to the original CHARACTER BY CHARACTER rather
 * than spliced wholesale, so an escape that sits between two substitutions
 * survives untouched. Educators only ever rewrite a short run of punctuation
 * (`--`, `...`, one quote), so a common-prefix / common-suffix trim isolates
 * each change precisely enough.
 */
function nodeSplices(node: TextNode, raw: string): Splice[] | null {
	const value = node.value ?? '';
	const educated = educateSpan(value);
	if (educated === value) return [];
	const map = offsetMap(raw, value);
	if (map === null) return null;

	let head = 0;
	while (head < value.length && head < educated.length && value[head] === educated[head]) head += 1;
	let tail = 0;
	while (
		tail < value.length - head &&
		tail < educated.length - head &&
		value[value.length - 1 - tail] === educated[educated.length - 1 - tail]
	) {
		tail += 1;
	}
	const base = node.position?.start.offset ?? 0;
	return [
		{
			start: base + map[head],
			end: base + map[value.length - tail],
			text: educated.slice(head, educated.length - tail),
		},
	];
}

/**
 * Cumulative count of text nodes this preprocessor declined to educate.
 *
 * It must stay at zero, and it is asserted rather than merely logged: a node the
 * map cannot line up is silently left in ASCII, which is precisely the failure
 * this whole preprocessor exists to prevent. The first three versions of
 * `offsetMap` declined 257 nodes across 71 posts, 21 across 18, then 1 — every
 * one of them a wrapped line whose continuation markup the parser strips
 * (list indentation, then a block quote's `> `, then that marker in the TRAILING
 * position). The corpus check reads this after rendering all 334 posts.
 */
let unmapped = 0;

export function unmappedNodeCount(): number {
	return unmapped;
}

/**
 * Cumulative count of raw-HTML nodes seen in educated sources.
 *
 * It must stay at zero, and the corpus check asserts it. Reproducing
 * remark-parse 8's node boundaries is not enough on its own: mdsvex runs its own
 * parser extensions BEFORE smartypants, and around raw HTML they change which
 * text is eligible for education at all. `> <span>b</span> c -- d` keeps its two
 * hyphens under mdsvex and became an em dash here; `<span>a</span>'s b` keeps
 * its straight apostrophe there and curled here.
 *
 * The corpus contains ZERO raw-HTML nodes across all 334 posts, so the divergence
 * is entirely out of corpus today. That is a reason to DETECT it, not to ignore
 * it: a post that introduces raw HTML tomorrow would be educated on rules this
 * preprocessor cannot claim to match, and the gate says so instead of guessing.
 */
let htmlNodes = 0;

export function htmlNodeCount(): number {
	return htmlNodes;
}

/** True when a source carries raw HTML, whose mdsvex boundaries are not reproduced. */
export function hasRawHtml(markdown: string): boolean {
	const before = htmlNodes;
	educateSource(markdown);
	return htmlNodes > before;
}

/**
 * Typeset a markdown source the way mdsvex would, and return the new source.
 *
 * The tree is remark-parse 8's, so the text-node boundaries the educators see
 * are mdsvex's. Splices are applied last-to-first so earlier offsets stay valid
 * while the text length changes (`--` to an em dash is a two-to-one shrink).
 */
export function educateSource(markdown: string): string {
	const tree = (
		unified as unknown as () => { use: (p: unknown) => { parse: (d: string) => TextNode } }
	)()
		.use(remarkParse8)
		.parse(markdown);

	visit(tree as never, 'html', () => {
		htmlNodes += 1;
	});

	const splices: Splice[] = [];
	visit(tree as never, 'text', (node: TextNode) => {
		const start = node.position?.start.offset;
		const end = node.position?.end.offset;
		if (start === undefined || end === undefined) return;
		const result = nodeSplices(node, markdown.slice(start, end));
		if (result === null) {
			unmapped += 1;
			return;
		}
		splices.push(...result);
	});

	let out = markdown;
	for (const splice of splices.sort((a, b) => b.start - a.start)) {
		out = out.slice(0, splice.start) + splice.text + out.slice(splice.end);
	}
	return out;
}
