'use client';

/**
 * FuzzyFinder — the React port of
 * `src/lib/components/palette/FuzzyFinder.svelte`.
 *
 * WHAT: a modal command palette over heterogeneous items — navigation,
 *       actions, and posts — with fuzzy matching, grouped into GO TO /
 *       ACTIONS / POSTS.
 * WHY:  one Cmd/Ctrl+K surface for jumping anywhere and running quick actions.
 * HOW:  Fuse.js over PaletteItem[]; each item self-executes via item.run().
 *
 * A11Y-1 IS CLOSED HERE. `verification/behavior-matrix.md:122` recorded a
 * serious finding against the Svelte palette: after Escape, focus landed on
 * BODY rather than returning to the control that opened it (WCAG 2.1 AA,
 * 2.4.3). `ShellPalette` captures the opener element across three paths:
 * (1) clicking the header palette button, (2) chording from a focused control,
 * and (3) chording from BODY with fallback to the header palette button.
 * `restoreFocusTarget` receives that opener, falling back to activeElement.
 *
 * KEYBOARD: the precedence lives in `@/palette/shortcuts`, not here. This
 * component decides what a key MEANS for the list; that module decides which
 * handler gets to answer at all.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Fuse from 'fuse.js';

import * as m from '@/paraglide/messages';
import {
	createPaletteFuse,
	fuzzySearch,
	highlightMatches,
	type FuzzyResult,
} from '@/palette/fuzzy';
import type { PaletteGroup, PaletteItem, PaletteLocale } from '@/palette/items';
import { defaultResults, groupResults, startsSection } from '@/palette/results';
import { moveSelection, planDialogKey, planInputKey } from '@/palette/shortcuts';

const RESULTS_LIST_ID = 'cmdk-results';

interface Props {
	items: PaletteItem[]; // full item set (nav + actions + posts) for the route
	onSelect: (item: PaletteItem) => void; // called when the user selects an item
	onClose: () => void; // called when the user closes the palette
	locale: PaletteLocale;
	/** Opener element captured by ShellPalette across click and chord paths. */
	opener?: HTMLElement | null;
}

function optionId(index: number): string {
	return `cmdk-option-${index}`;
}

/**
 * The element focus returns to when the palette closes: the captured opener,
 * falling back to whatever held focus when it opened.
 */
export function restoreFocusTarget(opener?: HTMLElement | null): HTMLElement | null {
	return opener ?? (document.activeElement as HTMLElement | null) ?? null;
}

/** `ls -l` type column: directories are pages, executables are actions. */
const TYPE_GLYPH: Record<PaletteGroup, string> = { nav: 'd', action: 'x', post: '-' };

/**
 * Right-column hint for an action row, derived from what its `run()` does.
 * Terminal syntax (paths, `mailto:`), identical in both locales.
 */
function actionHint(id: string): string | undefined {
	if (typeof window === 'undefined') return undefined;
	const path = window.location.pathname;
	const ko = path === '/ko' || path.startsWith('/ko/');
	switch (id) {
		case 'action:switch-language':
			return ko ? path.replace(/^\/ko/, '') || '/' : `/ko${path === '/' ? '' : path}`;
		case 'action:copy-link':
			return 'clipboard';
		case 'action:rss':
			return ko ? '/ko/rss.xml' : '/rss.xml';
		case 'action:github':
		case 'action:linkedin':
			return '↗ new tab';
		case 'action:email':
			return 'mailto:';
		default:
			return undefined;
	}
}

/** Post dates arrive as ISO strings; the row shows the calendar day only. */
function shortDate(value: string): string {
	return value.slice(0, 10);
}

export default function FuzzyFinder({ items, onSelect, onClose, locale, opener }: Props) {
	const inputRef = useRef<HTMLInputElement>(null);
	const resultsContainerRef = useRef<HTMLDivElement>(null);
	// A11Y-2: focus-trap scope; `previouslyFocused` is restored when it closes.
	const dialogRef = useRef<HTMLDivElement>(null);
	const previouslyFocused = useRef<HTMLElement | null>(null);

	const [query, setQuery] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);

	const fuse = useMemo<Fuse<PaletteItem>>(() => createPaletteFuse(items), [items]);
	const [results, setResults] = useState<FuzzyResult[]>(() => defaultResults(items));

	const at = useMemo(() => ({ locale }), [locale]);
	const activeOptionId = results.length > 0 ? optionId(selectedIndex) : undefined;
	const groupCounts = useMemo(() => {
		const counts: Record<PaletteGroup, number> = { nav: 0, action: 0, post: 0 };
		for (const result of results) counts[result.item.group] += 1;
		return counts;
	}, [results]);

	// AUTO-SCROLL TO SELECTED ROW
	// Section headers interleave the result rows in the DOM, so a positional
	// `children[selectedIndex]` no longer maps to result items. Rows carry
	// data-result-index and are queried directly.
	useEffect(() => {
		if (!resultsContainerRef.current || results.length === 0) return;
		const selected = resultsContainerRef.current.querySelector<HTMLElement>(
			`[data-result-index="${selectedIndex}"]`,
		);
		selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		// `results`, not `results.length`: the Svelte `$effect` reads the array, so
		// it re-runs on any reassignment. Depending on the length instead skips the
		// scroll when a new query happens to return the same number of rows, which
		// leaves a hand-scrolled list showing the wrong row as selected.
	}, [results, selectedIndex]);

	useEffect(() => {
		// A11Y-2 / A11Y-1: remember focus so it can be restored on close.
		previouslyFocused.current = restoreFocusTarget(opener);
		inputRef.current?.focus();
		const restore = previouslyFocused.current;
		return () => restore?.focus?.();
	}, [opener]);

	const handleInput = useCallback(
		(next: string) => {
			setQuery(next);
			setResults(next.trim() ? groupResults(fuzzySearch(fuse, next)) : defaultResults(items));
			setSelectedIndex(0);
		},
		[fuse, items],
	);

	const handleInputKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			const action = planInputKey(event.key);
			if (action === 'ignore') return;
			event.preventDefault();

			if (action === 'move-up' || action === 'move-down') {
				setSelectedIndex((index) => moveSelection(index, action, results.length));
				return;
			}
			if (action === 'select') {
				const chosen = results[selectedIndex];
				if (chosen) onSelect(chosen.item);
				return;
			}
			onClose();
		},
		[onClose, onSelect, results, selectedIndex],
	);

	// GLOBAL ESCAPE + TAB TRAP (A11Y-2). A window listener, as in the original,
	// so Escape works with focus anywhere inside the dialog.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
				'a[href], button, input, [tabindex]:not([tabindex="-1"])',
			);
			const first = focusables?.[0];
			const last = focusables?.[focusables.length - 1];
			const active = document.activeElement;

			const action = planDialogKey(event, {
				activeIsFirst: Boolean(first) && active === first,
				activeIsLast: Boolean(last) && active === last,
			});

			if (action === 'ignore') return;
			if (action === 'close') {
				event.preventDefault();
				event.stopPropagation();
				onClose();
				return;
			}
			if (!focusables || focusables.length === 0) return;
			event.preventDefault();
			(action === 'trap-to-last' ? last : first)?.focus();
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [onClose]);

	// Highlight matched characters in the item label (Fuse `label` key).
	const highlightedLabel = (result: FuzzyResult): { text: string; highlighted: boolean }[] => {
		const labelMatch = result.matches?.find((match) => match.key === 'label');
		if (labelMatch && labelMatch.indices) {
			return highlightMatches(result.item.label, labelMatch.indices);
		}
		return [{ text: result.item.label, highlighted: false }];
	};

	const groupLabel = (group: PaletteGroup): string => {
		switch (group) {
			case 'nav':
				return m.palette_group_nav({}, at);
			case 'action':
				return m.palette_group_action({}, at);
			case 'post':
				return m.palette_group_post({}, at);
		}
	};

	const label = (result: FuzzyResult) =>
		highlightedLabel(result).map((segment, si) =>
			segment.highlighted ? (
				<span className="fuzzy-match" key={si}>
					{segment.text}
				</span>
			) : (
				<span key={si}>{segment.text}</span>
			),
		);

	return (
		<div
			ref={dialogRef}
			className="cmdk-overlay"
			onClick={(event) => event.target === event.currentTarget && onClose()}
			onKeyDown={(event) => event.key === 'Escape' && onClose()}
			role="dialog"
			aria-modal="true"
			aria-label={m.palette_aria_label({}, at)}
			tabIndex={-1}
		>
			<div className="cmdk-panel term-frame is-active">
				<span className="term-frame__title" aria-hidden="true">
					palette <span className="dim">· fuzzy · posts + commands</span>
				</span>
				<span className="cmdk-counter" aria-hidden="true">
					<b>{results.length}</b>/{items.length}
				</span>

				{/* SEARCH INPUT HEADER */}
				<div className="cmdk-ibar">
					<span className="cmdk-prompt" aria-hidden="true">
						$
					</span>
					<input
						ref={inputRef}
						value={query}
						onChange={(event) => handleInput(event.currentTarget.value)}
						onKeyDown={handleInputKeyDown}
						type="text"
						placeholder={m.palette_placeholder({}, at)}
						className="cmdk-input"
						spellCheck={false}
						role="combobox"
						aria-autocomplete="list"
						aria-expanded={results.length > 0}
						aria-haspopup="listbox"
						aria-controls={RESULTS_LIST_ID}
						aria-activedescendant={activeOptionId}
					/>
					<kbd className="cmdk-esc">esc</kbd>
				</div>

				{/* RESULTS LIST (max-h + scroll). Rows carry data-result-index; section
				    headers are interleaved but non-selectable. */}
				<div
					ref={resultsContainerRef}
					id={RESULTS_LIST_ID}
					className="cmdk-results"
					role="listbox"
					aria-label={m.search_results_status({}, at)}
				>
					{results.length === 0 ? (
						<div className="cmdk-empty">
							<span className="cmdk-empty__n" aria-hidden="true">
								0 matches
							</span>
							<span className="cmdk-empty__why">{m.palette_no_results({}, at)}</span>
						</div>
					) : (
						results.map((result, index) => {
							const { item } = result;
							const hint = item.group === 'nav' ? item.description : actionHint(item.id);
							return (
								/* A Fragment, not a <div>: React needs one node per key, but a real
								   element between role="listbox" and its role="option" children
								   breaks the ownership the accessibility tree reads. The Svelte
								   template emits the header and the row as direct siblings. */
								<Fragment key={item.id}>
									{startsSection(results, index) && (
										<div className="cmdk-grp">
											{groupLabel(item.group)}
											<span className="cmdk-grp__n" aria-hidden="true">
												· {groupCounts[item.group]}
											</span>
										</div>
									)}
									<div
										id={optionId(index)}
										data-result-index={index}
										className={`cmdk-item cmdk-item--${item.group}${
											index === selectedIndex ? ' is-selected' : ''
										}`}
										onClick={() => onSelect(item)}
										onKeyDown={(event) => event.key === 'Enter' && onSelect(item)}
										role="option"
										aria-selected={index === selectedIndex}
										tabIndex={0}
									>
										<span className="cmdk-mk" aria-hidden="true" />
										<span className="cmdk-ty" aria-hidden="true">
											{TYPE_GLYPH[item.group]}
										</span>
										{item.group === 'post' ? (
											/* POST ROW: title, description, category + tags; date right */
											<>
												<div className="cmdk-main">
													<div className="cmdk-tt cmdk-truncate">{label(result)}</div>
													{item.description && (
														<div className="cmdk-post__desc cmdk-truncate">{item.description}</div>
													)}
													<div className="cmdk-post__meta cmdk-truncate">
														{item.meta?.category && (
															<span className="cmdk-cat">{item.meta.category}</span>
														)}
														{(item.meta?.tags ?? []).slice(0, 3).map((tag) => (
															<span className="cmdk-tag term-tag" key={tag}>
																{tag}
															</span>
														))}
													</div>
												</div>
												<span className="cmdk-rt cmdk-rt--date">
													{item.meta?.date ? shortDate(item.meta.date) : ''}
												</span>
											</>
										) : (
											/* NAV / ACTION ROW: label + right-column route or effect */
											<>
												<div className="cmdk-main cmdk-tt cmdk-truncate">{label(result)}</div>
												<span className="cmdk-rt" aria-hidden="true">
													{hint ?? ''}
												</span>
											</>
										)}
									</div>
								</Fragment>
							);
						})
					)}
				</div>

				{/* FOOTER - keyboard hints + result count */}
				<div className="cmdk-foot">
					<span>
						<kbd>↑↓</kbd>
						{m.palette_hint_navigate({}, at)}
					</span>
					<span>
						<kbd>↵</kbd>
						{m.palette_hint_select({}, at)}
					</span>
					<span>
						<kbd>esc</kbd>
						{m.palette_hint_close({}, at)}
					</span>
					<span className="cmdk-foot__n">
						{results.length === 1
							? m.palette_result_count({ count: results.length }, at)
							: m.palette_results_count({ count: results.length }, at)}
					</span>
				</div>
			</div>
		</div>
	);
}
