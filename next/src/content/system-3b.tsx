import type { Metadata } from 'next';

import System3bGraph from '../components/System3bGraph';
import snapshot from '../data/system-snapshot';
import * as m from '../paraglide/messages.js';
import type { Locale } from '../i18n/locale';
import { generateStudySeoMetadata } from '../seo/metadata';
import koOverlay from '../../../src/lib/data/system-snapshot.ko.json';
import { localizeSnapshot, type SnapshotOverlay } from './localize-snapshot';
import { koreanTitleBySlug } from './post-list';

/**
 * The snapshot in the page's locale. The Korean route merges Korean post titles
 * from the corpus over the snapshot's blog-series titles.
 */
function snapshotFor(locale: Locale) {
	if (locale === 'en') return snapshot;
	// `koTitleBySlug` in the Svelte loader; the overlay covers layers, subsystems
	// and nodes, the corpus covers series titles.
	return localizeSnapshot(snapshot, koOverlay satisfies SnapshotOverlay, koreanTitleBySlug());
}

export function generateSystem3bMetadata(locale: Locale): Metadata {
	return generateStudySeoMetadata({
		pageTitle: `${m.system_3b_title({}, { locale })} | Brandon Wie`,
		description: m.system_3b_meta_description({}, { locale }),
		basePath: '/system/b3',
		locale,
	});
}

const EVOLUTION_HEADING_ID = 'system-3b-evolution-heading';

/** A section heading with an optional count beside it. */
function SectionHeading({ id, label, meta }: { id: string; label: string; meta?: string }) {
	return (
		<h2 id={id}>
			{label}
			{meta ? <span className="s3b__meta">{meta}</span> : null}
		</h2>
	);
}

/**
 * The /system/b3 page: header, overview stats, architecture map (the
 * interactive graph), layers, subsystems, decision history, blog series and
 * snapshot status. One `h1`; each section has an `h2`.
 */
export function System3bPage({ locale }: { locale: Locale }) {
	const localized = snapshotFor(locale);
	const series = localized.blog_series;
	const publishedCount = series.filter((entry) => entry.status === 'published').length;
	const basePath = locale === 'ko' ? '/ko' : '';

	// Node count per layer, derived from the snapshot so the diagram + badges
	// stay accurate across snapshot regenerations.
	const countByLayer: Record<string, number> = {};
	for (const node of localized.nodes)
		countByLayer[node.layer] = (countByLayer[node.layer] ?? 0) + 1;
	const nodesLabel = m.system_3b_nodes_label({}, { locale });

	// Decision history, newest first.
	const evolution = [...localized.evolution].sort((a, b) => b.date.localeCompare(a.date));

	return (
		<div className="s3b">
			<header className="s3b__head">
				<p className="eyebrow">{m.system_3b_subtitle({}, { locale })}</p>
				<h1>{m.system_3b_title({}, { locale })}</h1>
				<p className="s3b__lede">{m.system_3b_intro({}, { locale })}</p>
			</header>

			<section aria-labelledby="s3b-overview">
				<SectionHeading id="s3b-overview" label={m.system_3b_overview_heading({}, { locale })} />
				<dl className="s3b__stats">
					{localized.stats.map((stat) => (
						<div key={stat.metric}>
							<dt>{stat.metric}</dt>
							<dd>{stat.value}</dd>
						</div>
					))}
				</dl>
			</section>

			<section aria-labelledby="s3b-map">
				<SectionHeading id="s3b-map" label={m.system_3b_map_heading({}, { locale })} />
				<div className="s3b__graph">
					<System3bGraph
						nodes={localized.nodes}
						edges={localized.edges}
						layers={localized.layers}
						locale={locale}
					/>
				</div>
			</section>

			<section aria-labelledby="s3b-layers">
				<SectionHeading
					id="s3b-layers"
					label={m.system_3b_layers_heading({}, { locale })}
					meta={`${localized.layers.length} · ${localized.nodes.length} ${nodesLabel}`}
				/>
				<ol className="s3b__rows">
					{localized.layers.map((layer) => (
						<li key={layer.id}>
							<div className="s3b__rowhead">
								<h3>{layer.name}</h3>
								<span className="s3b__count">
									{countByLayer[layer.id] ?? 0} {nodesLabel}
								</span>
							</div>
							<p className="s3b__desc">{layer.description}</p>
						</li>
					))}
				</ol>
			</section>

			<section aria-labelledby="s3b-subsystems">
				<SectionHeading
					id="s3b-subsystems"
					label={m.system_3b_subsystems_heading({}, { locale })}
					meta={String(localized.subsystems.length)}
				/>
				<ul className="s3b__rows">
					{localized.subsystems.map((sub) => (
						<li key={sub.key}>
							<div className="s3b__rowhead">
								<h3>{sub.name}</h3>
								{!sub.public_safe && (
									<span className="tag s3b__private">
										{m.system_3b_reads_private({}, { locale })}
									</span>
								)}
							</div>
							<p className="s3b__desc">{sub.display_one_liner}</p>
						</li>
					))}
				</ul>
			</section>

			<section aria-labelledby={EVOLUTION_HEADING_ID}>
				<SectionHeading
					id={EVOLUTION_HEADING_ID}
					label={m.system_3b_evolution_heading({}, { locale })}
					meta={String(evolution.length)}
				/>
				{/* axe requires keyboard focus for this scrollable region. */}
				<div
					className="s3b__adrscroll"
					role="region"
					tabIndex={0}
					aria-labelledby={EVOLUTION_HEADING_ID}
				>
					<ul className="s3b__adrlist">
						{evolution.map((adr) => (
							// 3B reuses some ADR numbers (two files each for 055 and 075), so the id alone is not unique.
							<li key={`${adr.id}:${adr.title}`}>
								<span className="s3b__adrdate">{adr.date}</span>
								<span className="s3b__adrid">{adr.id}</span>
								<span className="s3b__adrtitle">{adr.title}</span>
							</li>
						))}
					</ul>
				</div>
			</section>

			<section aria-labelledby="s3b-series">
				<SectionHeading id="s3b-series" label={m.system_3b_blog_heading({}, { locale })} />
				<p className="s3b__progress">
					{m.system_3b_blog_progress(
						{ published: publishedCount, total: series.length },
						{ locale },
					)}
				</p>
				<ol className="s3b__series">
					{series.map((post) => (
						<li key={post.slug}>
							<span className="s3b__order">{String(post.order).padStart(2, '0')}</span>
							{post.status === 'published' ? (
								<a href={`${basePath}/posts/${post.slug}`} className="text-link" data-row>
									{post.title}
								</a>
							) : (
								<span className="s3b__planned">{post.title}</span>
							)}
							<span
								className={
									post.status === 'published' ? 's3b__state s3b__state--published' : 's3b__state'
								}
							>
								{post.status === 'published'
									? m.system_3b_published({}, { locale })
									: m.system_3b_planned({}, { locale })}
							</span>
						</li>
					))}
				</ol>
			</section>

			<section aria-labelledby="s3b-status">
				<SectionHeading id="s3b-status" label={m.system_3b_status_heading({}, { locale })} />
				<dl className="s3b__kv">
					<div>
						<dt>{m.system_3b_model_generated({}, { locale })}</dt>
						<dd>{localized.model_generated}</dd>
					</div>
					<div>
						<dt>{m.system_3b_snapshot_built({}, { locale })}</dt>
						<dd>{localized.snapshot_built_at}</dd>
					</div>
				</dl>
				<p className="s3b__note">{m.system_3b_status_note({}, { locale })}</p>
			</section>
		</div>
	);
}
