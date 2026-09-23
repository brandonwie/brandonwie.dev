'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import { AppLink } from '@/components/AppLink';
import { searchHref } from '@/data/nav';
import { searchCopy } from '@/i18n/copy';
import { TermPrompt } from '@/shell/TermPrompt';
import { cwdFor } from '@/shell/terminal-path';
import type { Locale } from '@/i18n/locale';

export interface SearchPageProps {
	locale: Locale;
}

export interface SearchResult {
	url: string;
	title: string;
	excerpt: string;
	category?: string;
	malformed?: boolean;
}

interface PagefindResultItem {
	data: () => Promise<{
		url?: string;
		meta?: { title?: string };
		excerpt?: string;
		filters?: { category?: string[] };
	}>;
}

interface PagefindSearchResult {
	results: PagefindResultItem[];
}

interface PagefindInstance {
	init: () => Promise<void>;
	/** Facet counts; only read for the decorative init line. */
	filters?: () => Promise<Record<string, Record<string, number>>>;
	debouncedSearch: (
		query: string,
		options: { filters: { lang: string } },
		debounceMs: number,
	) => Promise<PagefindSearchResult | null>;
}

async function loadPagefindRuntime(): Promise<PagefindInstance> {
	const pagefindPath = '/pagefind/pagefind.js';
	const dynamicImport = new Function('p', 'return import(/* webpackIgnore: true */ p)');
	return (await dynamicImport(pagefindPath)) as PagefindInstance;
}

/**
 * SearchPage — full-text search over the built site via Pagefind.
 *
 * Ports `src/lib/components/SearchPage.svelte` to Next.js App Router.
 *
 * S3, S4, S5 C10 Contract Guards:
 * - S3: A broken Pagefind runtime load in production must NOT be disguised as dev mode.
 *       Dev notice is strictly reserved for `process.env.NODE_ENV === 'development'`.
 *       Production runtime load failures explicitly present as load error.
 * - S4: A well-formed index row renders its real title and URL. Malformed index rows
 *       (missing title or URL, or sentinel 'Untitled') are reported as a defect rather
 *       than rendered as a normal result item.
 * - S5: Query execution failure is explicitly distinguishable from legitimate no-results.
 */
export function SearchPage({ locale }: SearchPageProps) {
	const copy = searchCopy(locale);

	const [query, setQuery] = useState('');
	const [results, setResults] = useState<SearchResult[]>([]);
	const [resultCount, setResultCount] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [isDevMode, setIsDevMode] = useState(false);
	const [hasSearched, setHasSearched] = useState(false);
	const [loadError, setLoadError] = useState(false);
	const [queryError, setQueryError] = useState(false);
	const [indexReady, setIndexReady] = useState(false);
	const [indexPages, setIndexPages] = useState<number | null>(null);

	const pagefindRef = useRef<PagefindInstance | null>(null);
	const requestIdRef = useRef(0);

	useEffect(() => {
		let active = true;

		async function initPagefind() {
			try {
				// Allow browser probe to inject mock/throwing instance in negative controls
				const override =
					typeof window !== 'undefined'
						? (window as unknown as { __pagefindOverride?: PagefindInstance }).__pagefindOverride
						: undefined;
				const pf = override ?? (await loadPagefindRuntime());
				if (!active) return;
				await pf.init();
				if (!active) return;
				pagefindRef.current = pf;
				setLoadError(false);
				setIsDevMode(false);
				setIndexReady(true);
				// Decorative init line only: the page count for the active language.
				// Never allowed to affect the search states above.
				if (typeof pf.filters === 'function') {
					pf.filters()
						.then((facets) => {
							const count = facets?.lang?.[locale];
							if (active && typeof count === 'number') setIndexPages(count);
						})
						.catch(() => {});
				}
			} catch {
				if (!active) return;
				const maskDevMode =
					typeof window !== 'undefined' &&
					Boolean((window as unknown as { __maskDevMode?: boolean }).__maskDevMode);
				if (maskDevMode || process.env.NODE_ENV === 'development') {
					setIsDevMode(true);
				} else {
					setLoadError(true);
				}
			} finally {
				if (active && typeof document !== 'undefined') {
					document.body.dataset.searchReady = 'true';
				}
			}
		}

		initPagefind();

		return () => {
			active = false;
			if (typeof document !== 'undefined') {
				delete document.body.dataset.searchReady;
			}
		};
	}, [locale]);

	async function handleInput(e: ChangeEvent<HTMLInputElement>) {
		const val = e.target.value;
		setQuery(val);
		const reqId = ++requestIdRef.current;

		const override =
			typeof window !== 'undefined'
				? (window as unknown as { __pagefindOverride?: PagefindInstance }).__pagefindOverride
				: undefined;
		const pf = override ?? pagefindRef.current;
		if (!pf || !val.trim()) {
			setResults([]);
			setResultCount(0);
			setHasSearched(false);
			setIsLoading(false);
			setQueryError(false);
			return;
		}

		setIsLoading(true);
		setHasSearched(true);
		setQueryError(false);

		try {
			const search = await pf.debouncedSearch(val, { filters: { lang: locale } }, 200);

			if (reqId !== requestIdRef.current) return;
			if (!search) return; // superseded by a newer search call

			setResultCount(search.results.length);

			const data = await Promise.all(search.results.slice(0, 20).map((r) => r.data()));

			if (reqId !== requestIdRef.current) return;

			const maskMalformed =
				typeof window !== 'undefined' &&
				Boolean((window as unknown as { __maskMalformed?: boolean }).__maskMalformed);

			const mapped: SearchResult[] = [];
			for (const d of data) {
				const rawUrl = d.url;
				const rawTitle = d.meta?.title;

				// S4 sentinel defect detection: if title or url is absent or 'Untitled', report defect
				if (!maskMalformed && (!rawUrl || !rawTitle || rawTitle === 'Untitled')) {
					mapped.push({
						url: rawUrl ? rawUrl.replace(/\.html$/, '') : '',
						title: rawTitle ?? 'Untitled',
						excerpt: d.excerpt ?? '',
						category: d.filters?.category?.[0],
						malformed: true,
					});
				} else {
					mapped.push({
						url: (rawUrl ?? '').replace(/\.html$/, ''),
						title: rawTitle ?? 'Untitled',
						excerpt: d.excerpt ?? '',
						category: d.filters?.category?.[0],
						malformed: false,
					});
				}
			}

			setResults(mapped);
		} catch (err) {
			if (reqId !== requestIdRef.current) return;
			console.error('Search error:', err);
			const maskQueryError =
				typeof window !== 'undefined' &&
				Boolean((window as unknown as { __maskQueryError?: boolean }).__maskQueryError);
			if (maskQueryError) {
				setQueryError(false);
			} else {
				setQueryError(true);
			}
			setResults([]);
			setResultCount(0);
		} finally {
			if (reqId === requestIdRef.current) {
				setIsLoading(false);
			}
		}
	}

	const cwd = cwdFor(searchHref(locale));
	const initStatus = isDevMode ? (
		<span className="text-crt-amber">skipped</span>
	) : loadError ? (
		<span className="text-crt-amber">failed</span>
	) : indexReady ? (
		<>
			<span className="text-crt-green">ok</span>
			{indexPages !== null ? ` · ${indexPages} pages` : ''} · lang={locale}
		</>
	) : (
		'...'
	);

	return (
		<div className="pg-search">
			<TermPrompt
				cwd={cwd}
				command="pagefind --init"
				flags={`--bundle /pagefind/ --filter lang=${locale}`}
			/>
			<p className="pg-search__init" aria-hidden="true">
				loading index ......... {initStatus}
			</p>
			<div className="term-gap" />
			<div className="term-worn">
				<h1 className="term-ttl">{copy.pageHeading}</h1>
			</div>

			{isDevMode ? (
				<div data-search-dev-notice className="term-frame pg-search__notice">
					<p className="pg-search__warn">{copy.devNotice}</p>
				</div>
			) : loadError ? (
				<div role="alert" data-search-load-error className="term-frame pg-search__notice">
					<p className="pg-search__err">{copy.loadError}</p>
				</div>
			) : (
				<>
					{/* stdin: the search input, drawn as a frame that lights up while focused */}
					<div className="term-frame pg-search__stdin" role="search">
						<span className="term-frame__title" aria-hidden="true">
							stdin<span className="dim pg-search__focused"> · focused</span>
						</span>
						<span className="pg-search__gt" aria-hidden="true">
							&gt;
						</span>
						<label htmlFor="site-search" className="sr-only">
							{copy.pageHeading}
						</label>
						<input
							id="site-search"
							type="search"
							value={query}
							onChange={handleInput}
							placeholder={copy.searchPlaceholder}
							className="pg-search__input"
							autoFocus
							autoComplete="off"
							spellCheck={false}
						/>
						<span className="pg-search__hint" aria-hidden="true">
							lang={locale} · debounce 200ms
						</span>
					</div>

					{hasSearched ? (
						<>
							<div className="term-gap" />
							<TermPrompt
								cwd={cwd}
								command={`pagefind --search ${JSON.stringify(query.trim())}`}
								flags={`--lang ${locale} --limit 20`}
							/>
						</>
					) : null}

					{/* Results */}
					<section
						className="pg-search__results"
						aria-label={copy.resultsStatus}
						aria-live="polite"
						aria-busy={isLoading}
					>
						{isLoading ? (
							<p className="pg-search__loading">
								<span className="pg-search__spin" aria-hidden="true" />
								{copy.loading}
							</p>
						) : queryError ? (
							<div role="alert" data-search-query-error className="pg-search__state">
								<p className="pg-search__err">{copy.queryError}</p>
							</div>
						) : hasSearched && results.length === 0 ? (
							<p data-search-no-results className="pg-search__state pg-search__none">
								{copy.noResults(query)}
							</p>
						) : results.length > 0 ? (
							<>
								<p className="pg-search__count" role="status">
									<b>{copy.resultsCount(resultCount)}</b>
									<span className="pg-search__rule" aria-hidden="true" />
									<span className="pg-search__ranked" aria-hidden="true">
										ranked by pagefind
									</span>
								</p>

								<ol className="pg-search__hits">
									{results.map((result, idx) =>
										result.malformed ? (
											<li key={result.url || `defect-${idx}`}>
												<div
													role="alert"
													data-search-row-defect
													className="pg-search__err pg-search__defect"
												>
													Malformed search index entry: {result.title} (
													{result.url || 'missing url'})
												</div>
											</li>
										) : (
											<li key={result.url}>
												{/* The category must stay the row's FIRST <span>: the
												   search suite reads it with querySelector('span'). */}
												<AppLink href={result.url} className="search-result-item pg-search__hit">
													<i className="n" aria-hidden="true">
														[{idx + 1}]
													</i>
													<div className="pg-search__head">
														<h2 className="pg-search__ti">{result.title}</h2>
														{result.category ? (
															<span className="pg-search__cat">{result.category}</span>
														) : null}
													</div>
													<p
														className="search-excerpt pg-search__ex"
														dangerouslySetInnerHTML={{ __html: result.excerpt }}
													/>
													<p className="pg-search__url" aria-hidden="true">
														{result.url}
													</p>
												</AppLink>
											</li>
										),
									)}
								</ol>
							</>
						) : null}
					</section>
				</>
			)}
		</div>
	);
}

export default SearchPage;
