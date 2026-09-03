/**
 * Keyboard precedence for the palette and the search chord, written down.
 *
 * WHY THIS FILE EXISTS. In the Svelte app this behavior has no home. It is
 * spread across three files and two `<svelte:window onkeydown>` bindings that
 * are both live whenever the palette is open:
 *
 *   src/routes/+layout.svelte:147                 window handler #1
 *     :89-105   Cmd/Ctrl+F  -> the search page, with three suppressions
 *     :108-115  Cmd/Ctrl+K or +P -> open the palette, and RETURN, which is
 *               the only thing that makes the two chords ordered
 *   src/lib/components/palette/FuzzyFinder.svelte:185   window handler #2
 *     :153-163  Escape -> close; Tab -> focus trap
 *   src/lib/stores/palette.ts                     the ten lines both share
 *
 * Nothing in those three files states which handler wins, so the precedence is
 * a property of the reading order of one `if` and of which component mounted
 * first. That survives a refactor by luck. Re-deriving it during the React
 * port would have meant re-deriving it from the same accident, so it is
 * restated here as a pure function with the harness's P-group rows asserting
 * each rule by name.
 *
 * THE RULES, in order:
 *
 *   1. Cmd/Ctrl+K and Cmd/Ctrl+P open the palette and stop. They are checked
 *      FIRST, so the search chord can never see them, and they do NOT toggle:
 *      pressing Cmd+K in an open palette re-opens it, which is a no-op. Escape
 *      is the only close.
 *   2. Cmd/Ctrl+F goes to the search page UNLESS the route is already a search
 *      route, is a post detail page, or the keystroke landed in an editable
 *      element. That last suppression is what keeps the chord from firing
 *      while the user is typing INSIDE the palette, and it is the reason the
 *      deck and the palette never collide over it.
 *   3. Everything else is ignored at the window level. Arrow keys, Enter and
 *      Escape belong to the dialog, not to the window handler.
 *
 * A plain `k` with no modifier is rule 3, not rule 1. That is not a detail:
 * the palette's own input receives every keystroke the user types, and a
 * modifier-free match would make the letter unusable in a query.
 */

/** The parts of a KeyboardEvent these decisions read. */
export interface ChordEvent {
	key: string;
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey?: boolean;
}

/** The parts of the world these decisions read. */
export interface ChordContext {
	pathname: string;
	/** `event.target`'s uppercase tagName, or '' when there is no element. */
	targetTag: string;
	/** `event.target.isContentEditable`. */
	targetEditable: boolean;
}

export type GlobalChord =
	{ kind: 'open-palette' } | { kind: 'go-search'; href: string } | { kind: 'ignore' };

/** '/ko' for Korean routes, '' otherwise — `base(localeOf(pathname))`. */
function localeBase(pathname: string): string {
	return pathname === '/ko' || pathname.startsWith('/ko/') ? '/ko' : '';
}

/** `searchHref(localeOf(pathname))` from `src/lib/data/nav.ts:92`. */
export function searchHref(pathname: string): string {
	return `${localeBase(pathname)}/search`;
}

function hasChordModifier(event: ChordEvent): boolean {
	return event.metaKey || event.ctrlKey;
}

/** Rule 1. Kept separate so a control can delete it and watch rule 2 take
 *  over, which is what proves the ordering is real rather than incidental. */
export function isPaletteChord(event: ChordEvent): boolean {
	return hasChordModifier(event) && (event.key === 'k' || event.key === 'p');
}

/** Rule 2's chord, before its three suppressions. */
export function isSearchChord(event: ChordEvent): boolean {
	return hasChordModifier(event) && event.key === 'f';
}

/** Rule 2's suppressions, named individually so each can fail on its own. */
export function searchSuppressed(context: ChordContext): boolean {
	if (context.pathname.includes('/search')) return true;
	if (/\/posts\/.+/.test(context.pathname)) return true;
	if (context.targetTag === 'INPUT' || context.targetTag === 'TEXTAREA') return true;
	if (context.targetEditable) return true;
	return false;
}

/**
 * The window-level handler's whole decision. Every returned kind other than
 * `ignore` also calls `preventDefault` at the call site — Cmd+P would print
 * and Cmd+F would open the browser's own find bar otherwise.
 */
export function planGlobalChord(event: ChordEvent, context: ChordContext): GlobalChord {
	if (isPaletteChord(event)) return { kind: 'open-palette' };
	if (isSearchChord(event) && !searchSuppressed(context)) {
		return { kind: 'go-search', href: searchHref(context.pathname) };
	}
	return { kind: 'ignore' };
}

// ------------------------------------------------------------- inside the dialog

export type InputKey = 'move-up' | 'move-down' | 'select' | 'close' | 'ignore';

/** The search input's own handler (`FuzzyFinder.svelte:109-130`). */
export function planInputKey(key: string): InputKey {
	switch (key) {
		case 'ArrowUp':
			return 'move-up';
		case 'ArrowDown':
			return 'move-down';
		case 'Enter':
			return 'select';
		case 'Escape':
			return 'close';
		default:
			return 'ignore';
	}
}

export type DialogKey = 'close' | 'trap-to-last' | 'trap-to-first' | 'ignore';

/**
 * The dialog's window handler (`FuzzyFinder.svelte:153-182`): Escape closes
 * from anywhere, and Tab wraps at the ends of the focusable list.
 *
 * Escape appears here AND in `planInputKey` in the original, and both fire
 * when focus is in the input. That is harmless — `onClose` is idempotent —
 * and it is preserved rather than tidied, because deduplicating it would
 * change which handler runs first for a surface whose ordering this file
 * exists to pin down.
 */
export function planDialogKey(
	event: ChordEvent,
	position: { activeIsFirst: boolean; activeIsLast: boolean },
): DialogKey {
	if (event.key === 'Escape') return 'close';
	if (event.key !== 'Tab') return 'ignore';
	if (event.shiftKey && position.activeIsFirst) return 'trap-to-last';
	if (!event.shiftKey && position.activeIsLast) return 'trap-to-first';
	return 'ignore';
}

/**
 * Selection movement, clamped exactly as the original clamps it: the list does
 * not wrap, so ArrowUp at the top and ArrowDown at the bottom are no-ops.
 */
export function moveSelection(index: number, key: 'move-up' | 'move-down', length: number): number {
	if (key === 'move-up') return Math.max(0, index - 1);
	return Math.min(length - 1, index + 1);
}
