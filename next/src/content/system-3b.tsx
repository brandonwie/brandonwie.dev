import type { Metadata } from 'next';

import System3bGraph from '../components/System3bGraph';
import snapshot from '../data/system-snapshot';
import * as m from '../paraglide/messages.js';
import type { Locale } from '../i18n/locale';
import { generateStudySeoMetadata } from '../seo/metadata';
import koOverlay from '../../../src/lib/data/system-snapshot.ko.json';
import { localizeSnapshot, type SnapshotOverlay } from './localize-snapshot';
import { koreanTitleBySlug } from './post-list';
import { homeHref } from '../data/nav';

/**
 * The /system/3b page — the full port of `src/lib/components/System3bPage.svelte`.
 *
 * SCOPE. Header crumb + eyebrow + title + intro, overview stats, architecture
 * map (System3bGraph), layer cards, subsystem cards, decision-history (ADR)
 * log, blog-series list, and snapshot status. Until this port landed the page
 * was intentionally partial (graph + blog series only); the earlier Slice 3
 * carry-over is now closed.
 *
 * The blog-series list is also the consumer of the seventeenth
 * `import.meta.glob` call site (`src/routes/ko/system/3b/+page.ts:11`): the
 * Korean route reads Korean post titles from the corpus and merges them over
 * the snapshot, which is the whole behavior that call site exists for.
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
		basePath: '/system/3b',
		locale,
	});
}

function SectionHead({ label, id }: { label: string; id?: string }) {
	return (
		<div className="mb-5 flex items-center gap-3.5">
			<span className="font-mono font-bold text-foam">#</span>
			<h2 id={id} className="font-sans text-xl font-semibold tracking-tight text-ink">
				{label}
			</h2>
			<span className="h-px flex-1 bg-line2" />
		</div>
	);
}

const EVOLUTION_HEADING_ID = 'system-3b-evolution-heading';

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

	// Decision history, newest first.
	const evolution = [...localized.evolution].sort((a, b) => b.date.localeCompare(a.date));

	return (
		<div className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
			{/* Header */}
			<section className="max-w-3xl">
				<div className="mb-5 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.12em] text-faint">
					<a
						href={homeHref(locale)}
						className="transition-colors hover:text-foam"
						aria-label={m.palette_nav_home({}, { locale })}
					>
						~
					</a>
					<span className="text-line2">/</span>
					<span>system</span>
					<span className="text-line2">/</span>
					<span>3b</span>
				</div>
				<p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-foam">
					{m.system_3b_subtitle({}, { locale })}
				</p>
				<h1 className="mt-4 font-sans text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
					{m.system_3b_title({}, { locale })}
				</h1>
				<p className="mt-6 font-sans text-lg leading-8 text-muted">
					{m.system_3b_intro({}, { locale })}
				</p>
			</section>

			{/* Overview / stats grid */}
			<section className="mt-14">
				<SectionHead label={m.system_3b_overview_heading({}, { locale })} />
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
					{localized.stats.map((stat) => (
						<div
							key={stat.metric}
							className="rounded-lg border border-line2 bg-surface p-4 transition-colors hover:border-foam"
						>
							<div className="font-sans text-2xl font-bold tabular-nums text-foam">
								{stat.value}
							</div>
							<div className="mt-1 font-mono text-xs text-muted">{stat.metric}</div>
						</div>
					))}
				</div>
			</section>

			{/* Architecture map */}
			<section className="mt-16">
				<SectionHead label={m.system_3b_map_heading({}, { locale })} />
				<System3bGraph
					nodes={localized.nodes}
					edges={localized.edges}
					layers={localized.layers}
					locale={locale}
				/>
			</section>

			{/* Layers */}
			<section className="mt-16">
				<SectionHead label={m.system_3b_layers_heading({}, { locale })} />
				<div className="grid gap-4 lg:grid-cols-2">
					{localized.layers.map((layer, i) => (
						<article
							key={layer.id}
							className="rounded-lg border border-line2 bg-surface p-5 transition-colors hover:border-foam"
						>
							<div className="flex items-start justify-between gap-3">
								<h3 className="font-sans text-base font-semibold text-ink">
									<span className="font-mono tabular-nums text-faint">{i + 1}.</span> {layer.name}
								</h3>
								<span className="shrink-0 rounded border border-line2 px-2 py-0.5 font-mono text-xs text-foam">
									{countByLayer[layer.id] ?? 0} {m.system_3b_nodes_label({}, { locale })}
								</span>
							</div>
							<p className="mt-3 font-sans text-sm leading-7 text-muted">{layer.description}</p>
						</article>
					))}
				</div>
			</section>

			{/* Subsystems */}
			<section className="mt-16">
				<SectionHead label={m.system_3b_subsystems_heading({}, { locale })} />
				<div className="grid gap-3 lg:grid-cols-2">
					{localized.subsystems.map((sub) => (
						<article
							key={sub.key}
							className="rounded-lg border border-line2 bg-surface p-4 transition-colors hover:border-foam"
						>
							<div className="flex flex-wrap items-center gap-2">
								<h3 className="font-sans text-sm font-semibold text-ink">{sub.name}</h3>
								{!sub.public_safe && (
									<span className="rounded border border-line2 px-2 py-0.5 font-mono text-xs text-faint">
										{m.system_3b_reads_private({}, { locale })}
									</span>
								)}
							</div>
							<p className="mt-2 font-sans text-sm leading-7 text-muted">{sub.display_one_liner}</p>
						</article>
					))}
				</div>
			</section>

			{/* Decision history (ADRs) */}
			<section className="mt-16">
				<SectionHead
					label={m.system_3b_evolution_heading({}, { locale })}
					id={EVOLUTION_HEADING_ID}
				/>
				{/* axe requires keyboard focus for this scrollable region. */}
				<div
					className="max-h-96 overflow-y-auto rounded-lg border border-line2 bg-surface"
					role="region"
					tabIndex={0}
					aria-labelledby={EVOLUTION_HEADING_ID}
				>
					<ul className="divide-y divide-line">
						{evolution.map((adr) => (
							<li
								key={adr.id}
								className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5"
							>
								<span className="shrink-0 font-mono text-xs tabular-nums text-faint">
									{adr.date}
								</span>
								<span className="shrink-0 font-mono text-xs text-foam">{adr.id}</span>
								<span className="min-w-0 font-sans text-sm text-muted">{adr.title}</span>
							</li>
						))}
					</ul>
				</div>
			</section>

			{/* Blog series progress */}
			<section className="mt-16">
				<SectionHead label={m.system_3b_blog_heading({}, { locale })} />
				<p className="mb-4 font-mono text-xs text-faint">
					{m.system_3b_blog_progress(
						{ published: publishedCount, total: series.length },
						{ locale },
					)}
				</p>
				<ol className="series-list">
					{series.map((post) => (
						<li key={post.slug} className="series-item">
							<span className="font-mono tabular-nums text-faint">{post.order}.</span>{' '}
							{post.status === 'published' ? (
								<a
									href={`${basePath}/posts/${post.slug}`}
									className="font-sans text-sm font-medium"
								>
									{post.title}
								</a>
							) : (
								<span className="name">{post.title}</span>
							)}
							<span className="series-status">
								{post.status === 'published'
									? m.system_3b_published({}, { locale })
									: m.system_3b_planned({}, { locale })}
							</span>
						</li>
					))}
				</ol>
			</section>

			{/* Snapshot status */}
			<section className="mt-16">
				<SectionHead label={m.system_3b_status_heading({}, { locale })} />
				<div className="rounded-lg border border-line2 bg-surface p-5">
					<div className="flex items-baseline justify-between gap-4">
						<span className="font-sans text-sm text-muted">
							{m.system_3b_model_generated({}, { locale })}
						</span>
						<span className="font-mono text-sm tabular-nums text-ink">
							{localized.model_generated}
						</span>
					</div>
					<div className="mt-2 flex items-baseline justify-between gap-4">
						<span className="font-sans text-sm text-muted">
							{m.system_3b_snapshot_built({}, { locale })}
						</span>
						<span className="font-mono text-sm tabular-nums text-ink">
							{localized.snapshot_built_at}
						</span>
					</div>
					<p className="mt-3 font-mono text-xs leading-relaxed text-faint">
						{m.system_3b_status_note({}, { locale })}
					</p>
				</div>
			</section>
		</div>
	);
}
