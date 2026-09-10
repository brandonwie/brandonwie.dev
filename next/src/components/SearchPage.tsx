'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import { AppLink } from '@/components/AppLink';
import { searchCopy } from '@/i18n/copy';
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

	const pagefindRef = useRef<PagefindInstance | null>(null);

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
	}, []);

	async function handleInput(e: ChangeEvent<HTMLInputElement>) {
		const val = e.target.value;
		setQuery(val);

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

			if (!search) return; // superseded by a newer search call

			setResultCount(search.results.length);

			const data = await Promise.all(search.results.slice(0, 20).map((r) => r.data()));

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
			setIsLoading(false);
		}
	}

	return (
		<div className="min-h-screen bg-terminal-bg-primary">
			<main id="main-content" className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
				<h1 className="mb-6 text-2xl font-bold text-terminal-text-primary">{copy.pageHeading}</h1>

				{isDevMode ? (
					<div
						data-search-dev-notice
						className="rounded-lg border border-terminal-accent-yellow/30 bg-terminal-accent-yellow/10 p-4"
					>
						<p className="text-sm text-terminal-accent-yellow">{copy.devNotice}</p>
					</div>
				) : loadError ? (
					<div
						role="alert"
						data-search-load-error
						className="rounded-lg border border-red-500/30 bg-red-500/10 p-4"
					>
						<p className="text-sm text-red-400">{copy.loadError}</p>
					</div>
				) : (
					<>
						{/* Search Input */}
						<div
							className="mb-8 flex items-center gap-2 border-b border-terminal-border pb-2"
							role="search"
						>
							<span className="text-terminal-accent-orange font-bold" aria-hidden="true">
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
								className="flex-1 bg-transparent text-terminal-text-primary placeholder:text-terminal-text-dim outline-none"
								autoFocus
								autoComplete="off"
								spellCheck={false}
							/>
						</div>

						{/* Results */}
						<section aria-label={copy.resultsStatus} aria-live="polite" aria-busy={isLoading}>
							{isLoading ? (
								<p className="text-terminal-text-muted text-sm">{copy.loading}</p>
							) : queryError ? (
								<div
									role="alert"
									data-search-query-error
									className="rounded-lg border border-red-500/30 bg-red-500/10 p-4"
								>
									<p className="text-sm text-red-400">{copy.queryError}</p>
								</div>
							) : hasSearched && results.length === 0 ? (
								<p data-search-no-results className="text-terminal-text-muted text-sm">
									{copy.noResults(query)}
								</p>
							) : results.length > 0 ? (
								<>
									<p className="text-terminal-text-dim text-xs mb-6" role="status">
										{copy.resultsCount(resultCount)}
									</p>

									<div className="space-y-4">
										{results.map((result, idx) =>
											result.malformed ? (
												<div
													key={result.url || `defect-${idx}`}
													role="alert"
													data-search-row-defect
													className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
												>
													Malformed search index entry: {result.title} (
													{result.url || 'missing url'})
												</div>
											) : (
												<AppLink
													key={result.url}
													href={result.url}
													className="search-result-item block rounded-lg border border-terminal-border bg-terminal-bg-secondary p-4 transition-colors hover:border-terminal-accent-orange no-underline"
												>
													{result.category && (
														<span className="rounded-sm bg-terminal-accent-yellow/20 px-2 py-0.5 text-xs text-terminal-accent-yellow mb-2 inline-block">
															{result.category}
														</span>
													)}
													<h2 className="text-base font-semibold text-terminal-text-primary mb-1">
														{result.title}
													</h2>
													<p
														className="text-sm text-terminal-text-muted search-excerpt"
														dangerouslySetInnerHTML={{ __html: result.excerpt }}
													/>
												</AppLink>
											),
										)}
									</div>
								</>
							) : null}
						</section>
					</>
				)}
			</main>
		</div>
	);
}

export default SearchPage;
