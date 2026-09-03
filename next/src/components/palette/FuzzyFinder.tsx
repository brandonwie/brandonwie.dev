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
 * A11Y-1 IS PRESERVED ON PURPOSE. `verification/behavior-matrix.md:122`
 * records a serious finding against the Svelte palette: after Escape, focus
 * lands on BODY rather than returning to the control that opened it (WCAG 2.1
 * AA, 2.4.3). The cause is visible below — the palette restores whatever
 * `document.activeElement` was at mount, and when the palette was opened by a
 * keyboard chord that element IS the body. The matrix assigns the fix to the
 * Slice 3 palette port, so this port must reproduce the defect rather than
 * quietly repair it: a port that silently fixed it would be an unrecorded
 * behavior change, and the baseline row would stop describing either stack.
 * `restoreFocusTarget` below is the seam the harness asserts against.
 *
 * KEYBOARD: the precedence lives in `@/palette/shortcuts`, not here. This
 * component decides what a key MEANS for the list; that module decides which
 * handler gets to answer at all.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
}

function optionId(index: number): string {
	return `cmdk-option-${index}`;
}

/**
 * The element focus returns to when the palette closes: whatever held focus
 * when it opened. Named and exported because it is the mechanism behind
 * A11Y-1, and a row asserts the port kept it rather than substituting an
 * opener-element reference (which would fix the finding out of band).
 */
export function restoreFocusTarget(): HTMLElement | null {
	return (document.activeElement as HTMLElement | null) ?? null;
}

export default function FuzzyFinder({ items, onSelect, onClose, locale }: Props) {
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
	}, [results.length, selectedIndex]);

	useEffect(() => {
		// A11Y-2 / A11Y-1: remember focus so it can be restored on close. See the
		// header — restoring BODY is the recorded defect, not an oversight.
		previouslyFocused.current = restoreFocusTarget();
		inputRef.current?.focus();
		const restore = previouslyFocused.current;
		return () => restore?.focus?.();
	}, []);

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
			<div className="cmdk-panel">
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
						<div className="cmdk-empty">{m.palette_no_results({}, at)}</div>
					) : (
						results.map((result, index) => (
							<div key={result.item.id}>
								{startsSection(results, index) && (
									<div className="cmdk-grp">{groupLabel(result.item.group)}</div>
								)}
								<div
									id={optionId(index)}
									data-result-index={index}
									className={`cmdk-item${index === selectedIndex ? ' is-selected' : ''}`}
									onClick={() => onSelect(result.item)}
									onKeyDown={(event) => event.key === 'Enter' && onSelect(result.item)}
									role="option"
									aria-selected={index === selectedIndex}
									tabIndex={0}
								>
									{result.item.group === 'post' ? (
										/* POST ROW (rich: title, description, category/tags/date) */
										<div className="cmdk-post">
											<div className="cmdk-post__main">
												<div className="cmdk-tt cmdk-truncate">
													{highlightedLabel(result).map((segment, si) =>
														segment.highlighted ? (
															<span className="fuzzy-match" key={si}>
																{segment.text}
															</span>
														) : (
															<span key={si}>{segment.text}</span>
														),
													)}
												</div>
												{result.item.description && (
													<div className="cmdk-post__desc cmdk-truncate">
														{result.item.description}
													</div>
												)}
												<div className="cmdk-post__meta">
													{result.item.meta?.category && (
														<span className="cmdk-cat">{result.item.meta.category}</span>
													)}
													{(result.item.meta?.tags ?? []).slice(0, 3).map((tag) => (
														<span className="cmdk-tag" key={tag}>
															{tag}
														</span>
													))}
												</div>
											</div>
											{result.item.meta?.date && (
												<div className="cmdk-ds">{result.item.meta.date}</div>
											)}
										</div>
									) : (
										/* NAV / ACTION ROW (icon box + label + dim hint) */
										<>
											<span className="cmdk-ic" aria-hidden="true">
												{result.item.icon ?? '›'}
											</span>
											<div className="cmdk-row__main">
												<div className="cmdk-tt cmdk-truncate">
													{highlightedLabel(result).map((segment, si) =>
														segment.highlighted ? (
															<span className="fuzzy-match" key={si}>
																{segment.text}
															</span>
														) : (
															<span key={si}>{segment.text}</span>
														),
													)}
												</div>
												{result.item.description && (
													<div className="cmdk-ds cmdk-truncate">{result.item.description}</div>
												)}
											</div>
										</>
									)}
								</div>
							</div>
						))
					)}
				</div>

				{/* FOOTER - keyboard hints + result count */}
				<div className="cmdk-foot">
					<div className="cmdk-foot__hints">
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
					</div>
					<div>
						{results.length === 1
							? m.palette_result_count({ count: results.length }, at)
							: m.palette_results_count({ count: results.length }, at)}
					</div>
				</div>
			</div>
		</div>
	);
}
