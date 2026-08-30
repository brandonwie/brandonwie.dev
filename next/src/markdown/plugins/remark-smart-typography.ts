import { retext } from 'retext';
import { visit } from 'unist-util-visit';
import type { Root, Text } from 'mdast';

/**
 * mdsvex's smart-typography step, ported implementation and all.
 *
 * mdsvex enables `smartypants: true` by default, so every post in the baseline
 * is typeset: `--` becomes an em dash, straight quotes become curly ones. The
 * first port of the article omitted this entirely and shipped ASCII.
 *
 * The first FIX of that omission used the published `retext-smartypants@6`, and
 * a 334-post probe against the built baseline found five posts where the quote
 * DIRECTION differed — same character counts, opposite curl. mdsvex bundles an
 * older copy of the same package, and the two disagree in the first branch of
 * the quote educator:
 *
 *   mdsvex   next && nextNext && (next is punctuation/symbol) && nextNext is not a word
 *   v6       next && (next is punctuation/symbol) && (!nextNext || nextNext is not a word)
 *
 * When the quote is followed by punctuation at the END of a sentence node there
 * is no `nextNext`, so v6 closes the quote by brute force and mdsvex falls
 * through to a later branch and opens it. Five posts across the corpus land on
 * exactly that shape.
 *
 * So this is mdsvex's educator set, transcribed from its bundle
 * (`mdsvex/dist/main-*.js`, `educators` and `transformFactory`), rather than a
 * dependency that merely resembles it. The target is the baseline's output, not
 * the newest available typography — and `pnpm migration:typography` compares
 * all 334 posts against the built baseline so that claim is checked rather than
 * asserted.
 *
 * `retext()` still supplies the tokenizer. Only the educators are ported; if
 * the parser ever drifts, the corpus check is what will say so.
 *
 * Position in the pipeline mirrors mdsvex: registered BEFORE the ported
 * remark plugins, so reading time and the heading list are computed from the
 * typeset text. Code is untouched — `code` and `inlineCode` are their own mdast
 * node types, so visiting `text` never reaches them.
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

/**
 * Text spans mdsvex would have seen as SEPARATE mdast nodes.
 *
 * The last of the five corpus mismatches is not an educator difference at all,
 * it is a text-node BOUNDARY difference, and smartypants reads its neighbours.
 * `claude[bot]'s` is one text node under micromark, because CommonMark says an
 * undefined shortcut reference is literal text. mdsvex runs remark-parse 8,
 * which builds a `linkReference` node for `[bot]` regardless, splitting the
 * paragraph into `claude`, the reference, and `'s structured review ...`.
 *
 * That changes the answer. With the split, the apostrophe is the FIRST node in
 * its span, has no previous sibling, and falls through to the `'` + `s` branch
 * that closes it -- `claude[bot]'s` with a closing curl, the correct
 * possessive. Without it the apostrophe's previous sibling is `]` and its next
 * is the word `s`, which is the "opening single quote" branch: wrong English as
 * well as a parity difference.
 *
 * So the value is educated span by span, split exactly where remark-parse 8
 * would have built a `linkReference`: a NON-EMPTY label containing no nested
 * brackets. The label is educated as its own span, which is what mdsvex does
 * with the reference node's children; the brackets are rejoined untouched.
 *
 * The precision matters, and the first version did not have it. Splitting on
 * every bracket diverged from mdsvex on three shapes that are NOT shortcut
 * references and therefore never split: `[[bot]]'s`, `foo[]'s` (empty label)
 * and `[a[b]c]'s` (nested). `pnpm migration:typography:oracle` runs those and
 * more through the installed mdsvex and this pipeline side by side, so the
 * claim is differential rather than asserted; `pnpm migration:typography`
 * covers all 334 real posts.
 */
const SHORTCUT_REFERENCE = /\[([^[\]]+)\]/g;

/** Educate one span with mdsvex's educators. Exported for the oracle controls. */
export function educateSpan(span: string): string {
	return span === '' ? span : String(PROCESSOR.processSync(span));
}

export function educateBySpan(
	value: string,
	educate: (span: string) => string = educateSpan,
): string {
	let out = '';
	let cursor = 0;
	SHORTCUT_REFERENCE.lastIndex = 0;
	for (const match of value.matchAll(SHORTCUT_REFERENCE)) {
		out += educate(value.slice(cursor, match.index));
		out += `[${educate(match[1])}]`;
		cursor = match.index + match[0].length;
	}
	return out + educate(value.slice(cursor));
}

const PROCESSOR = retext().use(smartypants);

export function remarkSmartTypography() {
	return (tree: Root) => {
		visit(tree, 'text', (node: Text) => {
			node.value = educateBySpan(node.value, educateSpan);
		});
	};
}
