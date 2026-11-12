'use client';

import { useEffect, useRef, useState } from 'react';

import type { ShellCopy } from '@/i18n/copy';

type Row = readonly [key: string, label: string];

function isTyping(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * The control's name without its `[K]` hint. `data-hotkey-label` names a control
 * whose own text is not a description of the action (a link that shows a post title).
 */
function labelOf(element: HTMLElement): string {
	const named = element.dataset.hotkeyLabel ?? element.getAttribute('aria-label');
	if (named) return named;
	return Array.from(element.childNodes)
		.filter((node) => !(node instanceof HTMLElement && node.classList.contains('hotkey')))
		.map((node) => node.textContent ?? '')
		.join('')
		.trim();
}

/** Every `data-hotkey` control on the page, first occurrence per key. */
function pageHotkeys(): Row[] {
	const rows = new Map<string, string>();
	for (const element of document.querySelectorAll<HTMLElement>('[data-hotkey]')) {
		const key = element.dataset.hotkey;
		if (key && !rows.has(key)) rows.set(key, labelOf(element));
	}
	return Array.from(rows);
}

/** The `data-row` links the reader can see now (a filter hides the rest). */
function visibleRows(): HTMLElement[] {
	return Array.from(document.querySelectorAll<HTMLElement>('[data-row]')).filter(
		(row) => row.offsetParent !== null,
	);
}

/** Move focus through the visible rows. Returns false when the page has none. */
function moveRow(delta: 1 | -1): boolean {
	const rows = visibleRows();
	if (rows.length === 0) return false;
	const current = rows.indexOf(document.activeElement as HTMLElement);
	const next =
		current === -1
			? delta === 1
				? 0
				: rows.length - 1
			: (current + delta + rows.length) % rows.length;
	rows[next].focus();
	return true;
}

/**
 * Single-key shortcuts. A key clicks the control whose `data-hotkey` matches;
 * `j` and `k` walk a list of `data-row` links; `?` lists what the page offers.
 * Keys are ignored while typing and with a modifier held.
 */
export function Shortcuts({ copy }: { copy: ShellCopy['shortcuts'] }) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [rows, setRows] = useState<Row[]>([]);
	const [hasList, setHasList] = useState(false);

	// The list is read from the page when the dialog opens, so it always matches what is on screen.
	function openHelp() {
		setRows(pageHotkeys());
		setHasList(visibleRows().length > 0);
		dialog.current?.showModal();
	}

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
			if (isTyping(event.target) || document.querySelector('dialog[open]')) return;

			const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
			if (key === '?') {
				event.preventDefault();
				openHelp();
				return;
			}
			if (key === 'j' || key === 'k') {
				if (moveRow(key === 'j' ? 1 : -1)) event.preventDefault();
				return;
			}
			const control = Array.from(document.querySelectorAll<HTMLElement>('[data-hotkey]')).find(
				(element) => element.dataset.hotkey === key,
			);
			if (control) {
				event.preventDefault();
				control.click();
			}
		}

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, []);

	return (
		<>
			<button type="button" className="site-footer__keys" onClick={openHelp}>
				<kbd className="kbd">?</kbd> {copy.title}
			</button>
			<dialog
				ref={dialog}
				className="shortcuts"
				aria-labelledby="shortcuts-title"
				onClick={(event) => {
					if (event.target === event.currentTarget) event.currentTarget.close();
				}}
			>
				<form method="dialog" className="shortcuts__body">
					<h2 id="shortcuts-title" className="eyebrow">
						{copy.title}
					</h2>
					<dl className="shortcuts__list">
						{rows.map(([key, label]) => (
							<div key={key}>
								<dt>
									<kbd className="kbd">{key === 'Backspace' ? '⌫' : key.toUpperCase()}</kbd>
								</dt>
								<dd>{label}</dd>
							</div>
						))}
						{hasList ? (
							<>
								<div>
									<dt>
										<kbd className="kbd">J</kbd> <kbd className="kbd">K</kbd>
									</dt>
									<dd>{copy.rows}</dd>
								</div>
								<div>
									<dt>
										<kbd className="kbd">Enter</kbd>
									</dt>
									<dd>{copy.open}</dd>
								</div>
							</>
						) : null}
						<div>
							<dt>
								<kbd className="kbd">?</kbd>
							</dt>
							<dd>{copy.help}</dd>
						</div>
					</dl>
					<button className="button shortcuts__close">{copy.close}</button>
				</form>
			</dialog>
		</>
	);
}
