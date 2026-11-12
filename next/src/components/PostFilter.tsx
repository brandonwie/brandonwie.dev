'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { IndexCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';

interface Pagefind {
	search: (
		query: string,
		options: { filters: { lang: string } },
	) => Promise<{ results: Array<{ data: () => Promise<{ url: string; excerpt: string }> }> }>;
}

/** Full-text matches read per query. Each one costs a small fetch, so only the best are read. */
const FULL_TEXT_LIMIT = 24;
const NO_HITS: ReadonlyMap<string, string> = new Map();

function sharedPrefix(a: string, b: string): number {
	let length = 0;
	while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
	return length;
}

/**
 * Whether a full-text excerpt really matches the query.
 *
 * When a word is not in its index, Pagefind retries with ever shorter prefixes,
 * so a nonsense query still returns pages (a page with the letter `z` for
 * `zzzzqq`). A page is kept only when a highlighted word and a query word start
 * with the same three characters, or with the whole word when it is shorter.
 * Three is enough to keep stemmed matches such as `retry` and `retries`.
 */
function isRelevant(excerpt: string, tokens: readonly string[]): boolean {
	const marked = Array.from(excerpt.matchAll(/<mark>(.*?)<\/mark>/g), (match) =>
		match[1].toLowerCase().replace(/^[^\p{L}\p{N}]+/u, ''),
	);
	return tokens.some((token) =>
		marked.some((word) => sharedPrefix(word, token) >= Math.min(3, token.length)),
	);
}

let runtime: Promise<Pagefind> | undefined;

/**
 * Pagefind writes its runtime into the build output after the bundler has run,
 * so the import must stay invisible to the bundler.
 */
function loadPagefind(): Promise<Pagefind> {
	runtime ??= new Function('path', 'return import(path)')(
		'/pagefind/pagefind.js',
	) as Promise<Pagefind>;
	return runtime;
}

/** `/ko/posts/some-slug.html` to `some-slug`. */
function slugOf(url: string): string {
	return (
		url
			.replace(/\.html$/, '')
			.replace(/\/$/, '')
			.split('/')
			.pop() ?? ''
	);
}

const haystacks = new WeakMap<HTMLElement, string>();

/** The text the instant filter matches: title, category and tags, lower-cased. */
function textOf(row: HTMLElement): string {
	let text = haystacks.get(row);
	if (text === undefined) {
		const title = row.querySelector('[data-title]')?.textContent ?? '';
		text = `${title} ${row.dataset.category} ${row.dataset.tags}`.toLowerCase();
		haystacks.set(row, text);
	}
	return text;
}

/** Show a full-text excerpt under a row's title, or remove it. */
function setExcerpt(row: HTMLElement, html: string | undefined): void {
	let slot = row.querySelector<HTMLElement>('.index__hit');
	if (html === undefined) {
		slot?.remove();
		return;
	}
	if (!slot) {
		slot = document.createElement('span');
		slot.className = 'index__hit';
		row.querySelector('a')?.append(slot);
	}
	// Pagefind escapes the page text and adds only <mark>; the pages are this site's own.
	slot.innerHTML = html;
}

function firstVisibleRow(): HTMLElement | null {
	return document.querySelector<HTMLElement>('#post-list [data-post]:not([hidden]) [data-row]');
}

/**
 * Search box, category tabs and result count for the post index.
 *
 * The rows are server-rendered siblings. This component hides the ones that do
 * not match and never renders them itself. Typing filters titles, categories
 * and tags at once; a full-text search runs just after and adds the posts whose
 * body matches, each with an excerpt. The filter is kept in the address
 * (`?q=`, `?category=`, `?tag=`), so a filtered list can be linked to.
 */
export function PostFilter({
	locale,
	total,
	categories,
	copy,
}: {
	locale: Locale;
	total: number;
	categories: ReadonlyArray<{ name: string; count: number }>;
	copy: IndexCopy['filter'];
}) {
	const [query, setQuery] = useState('');
	const [category, setCategory] = useState('');
	const [tag, setTag] = useState('');
	const [hits, setHits] = useState(NO_HITS);
	const [fullTextFailed, setFullTextFailed] = useState(false);
	const [shown, setShown] = useState(total);
	// False until the address has been read, so the first paint never rewrites it.
	const [restored, setRestored] = useState(false);
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		setQuery(params.get('q') ?? '');
		setCategory(params.get('category') ?? '');
		setTag(params.get('tag') ?? '');
		setRestored(true);
		// The header's search control links to `#search` from every other page.
		if (window.location.hash === '#search') input.current?.focus();
	}, []);

	useEffect(() => {
		const text = query.trim();
		if (text.length < 2) {
			setHits(NO_HITS);
			setFullTextFailed(false);
			return;
		}
		// A late answer to an older query must not replace a newer one.
		let stale = false;
		const timer = window.setTimeout(async () => {
			try {
				const pagefind = await loadPagefind();
				const { results } = await pagefind.search(text, { filters: { lang: locale } });
				const pages = await Promise.all(
					results.slice(0, FULL_TEXT_LIMIT).map((result) => result.data()),
				);
				if (stale) return;
				const tokens = text.toLowerCase().split(/\s+/);
				setHits(
					new Map(
						pages
							.filter((page) => isRelevant(page.excerpt, tokens))
							.map((page) => [slugOf(page.url), page.excerpt]),
					),
				);
				setFullTextFailed(false);
			} catch {
				runtime = undefined;
				if (stale) return;
				setHits(NO_HITS);
				setFullTextFailed(true);
			}
		}, 160);
		return () => {
			stale = true;
			window.clearTimeout(timer);
		};
	}, [query, locale]);

	useEffect(() => {
		if (!restored) return;
		const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
		let count = 0;
		for (const group of document.querySelectorAll<HTMLElement>('#post-list [data-year]')) {
			let any = false;
			for (const row of group.querySelectorAll<HTMLElement>('[data-post]')) {
				const excerpt = hits.get(row.dataset.post ?? '');
				const visible =
					(category === '' || row.dataset.category === category) &&
					(tag === '' || (row.dataset.tags ?? '').includes(`,${tag},`)) &&
					(tokens.length === 0 ||
						excerpt !== undefined ||
						tokens.every((token) => textOf(row).includes(token)));
				row.hidden = !visible;
				setExcerpt(row, visible ? excerpt : undefined);
				if (visible) {
					any = true;
					count += 1;
				}
			}
			group.hidden = !any;
		}
		setShown(count);

		const params = new URLSearchParams();
		if (query.trim()) params.set('q', query.trim());
		if (category) params.set('category', category);
		if (tag) params.set('tag', tag);
		const search = params.toString();
		window.history.replaceState(
			null,
			'',
			`${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
		);
	}, [restored, query, category, tag, hits]);

	function clear() {
		setQuery('');
		setCategory('');
		setTag('');
	}

	function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key === 'Escape') {
			if (query) setQuery('');
			else event.currentTarget.blur();
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			firstVisibleRow()?.focus();
		} else if (event.key === 'Enter') {
			firstVisibleRow()?.click();
		}
	}

	const filtered = query.trim() !== '' || category !== '' || tag !== '';
	const status = !filtered
		? copy.count.replace('{count}', String(total))
		: shown === 0
			? copy.none
			: copy.countFiltered.replace('{shown}', String(shown)).replace('{total}', String(total));

	return (
		<div className="index__controls" role="search">
			<label className="index__search">
				<span className="sr-only">{copy.searchLabel}</span>
				<input
					ref={input}
					id="search"
					type="search"
					value={query}
					placeholder={copy.searchHint}
					autoComplete="off"
					autoCapitalize="off"
					spellCheck={false}
					enterKeyHint="search"
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={onKeyDown}
				/>
				<kbd className="kbd hotkey" aria-hidden="true">
					/
				</kbd>
			</label>

			<div className="index__tabs" role="group" aria-label={copy.categories}>
				<button type="button" aria-pressed={category === ''} onClick={() => setCategory('')}>
					{copy.all} <span>{total}</span>
				</button>
				{categories.map(({ name, count }) => (
					<button
						key={name}
						type="button"
						aria-pressed={category === name}
						onClick={() => setCategory(category === name ? '' : name)}
					>
						{name} <span>{count}</span>
					</button>
				))}
			</div>

			<p className="index__status">
				<span role="status">{status}</span>
				{tag ? (
					<button
						type="button"
						className="tag"
						aria-label={copy.removeTag.replace('{tag}', tag)}
						onClick={() => setTag('')}
					>
						#{tag} <span aria-hidden="true">×</span>
					</button>
				) : null}
				{filtered ? (
					<button type="button" className="text-link" onClick={clear}>
						{copy.clear}
					</button>
				) : null}
				{fullTextFailed ? <span className="index__note">{copy.fullTextUnavailable}</span> : null}
			</p>
		</div>
	);
}
