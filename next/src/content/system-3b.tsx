import type { Metadata } from 'next';

import System3bGraph from '../components/System3bGraph';
import snapshot from '../data/system-snapshot';
import * as m from '../paraglide/messages.js';
import type { Locale } from '../i18n/locale';
import { absoluteUrl } from '../../../src/lib/seo';
import koOverlay from '../../../src/lib/data/system-snapshot.ko.json';
import { localizeSnapshot, type SnapshotOverlay } from './localize-snapshot';
import { koreanTitleBySlug } from './post-list';

/**
 * The /system/3b page, at the graph and blog-series altitudes.
 *
 * SCOPE. This is still a PARTIAL port and says so. The Svelte System3bPage also
 * carries stats, a subsystems table and an evolution section, so the parity
 * comparator reports field differences on BOTH `/system/3b` and `/ko/system/3b`
 * until those sections land.
 *
 * OWNERSHIP. Those remaining differences are **Slice 3** work and must be
 * repaired before G3, not deferred to Slice 4. An earlier version of this note
 * assigned them to Slice 4; that was superseded when `/ko/system/3b` moved onto
 * the Slice 3 row in `verification/behavior-matrix.md`. They are expected
 * progress rather than a regression, and are deliberately NOT ledgered — a
 * ledger entry would approve a difference that is supposed to disappear.
 *
 * The blog-series list is here ahead of those sections for one reason: it is
 * the consumer of the seventeenth `import.meta.glob` call site
 * (`src/routes/ko/system/3b/+page.ts:11`), and C5 cannot close on a call site
 * whose output nothing renders. The Korean route reads Korean post titles from
 * the corpus and merges them over the snapshot, which is the whole behavior
 * that call site exists for.
 */
function snapshotFor(locale: Locale) {
	if (locale === 'en') return snapshot;
	// `koTitleBySlug` in the Svelte loader; the overlay covers layers and nodes,
	// the corpus covers series titles.
	return localizeSnapshot(snapshot, koOverlay satisfies SnapshotOverlay, koreanTitleBySlug());
}

export function generateSystem3bMetadata(locale: Locale): Metadata {
	const path = locale === 'ko' ? '/ko/system/3b' : '/system/3b';
	return {
		title: m.system_3b_title({}, { locale }),
		description: m.system_3b_meta_description({}, { locale }),
		alternates: { canonical: absoluteUrl(path) },
	};
}

export function System3bPage({ locale }: { locale: Locale }) {
	const localized = snapshotFor(locale);
	const series = localized.blog_series;
	const published = series.filter((entry) => entry.status === 'published').length;
	const basePath = locale === 'ko' ? '/ko' : '';

	return (
		<div className="page-frame">
			<h1>{m.system_3b_title({}, { locale })}</h1>
			<p className="lede">{m.system_3b_subtitle({}, { locale })}</p>
			<System3bGraph
				nodes={localized.nodes}
				edges={localized.edges}
				layers={localized.layers}
				locale={locale}
			/>

			<section className="series">
				<h2>{m.system_3b_blog_heading({}, { locale })}</h2>
				<p className="note">
					{m.system_3b_blog_progress({ published, total: series.length }, { locale })}
				</p>
				<ol className="series-list">
					{series.map((entry) => (
						<li className="series-item" key={entry.slug}>
							<span className="idx">{entry.order}.</span>
							{entry.status === 'published' ? (
								<a href={`${basePath}/posts/${entry.slug}`}>{entry.title}</a>
							) : (
								<span className="name">{entry.title}</span>
							)}
							<span className="series-status">
								{entry.status === 'published'
									? m.system_3b_published({}, { locale })
									: m.system_3b_planned({}, { locale })}
							</span>
						</li>
					))}
				</ol>
			</section>
		</div>
	);
}
