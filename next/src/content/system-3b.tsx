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
import { TermPrompt } from '../shell/TermPrompt';
import { cwdFor } from '../shell/terminal-path';

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

const EVOLUTION_HEADING_ID = 'system-3b-evolution-heading';

/** Cells in the blog-series progress meter. */
const SERIES_METER_CELLS = 20;

/** Frame title: the section's real heading, with an optional dim count. */
function FrameTitle({ label, meta, id }: { label: string; meta?: string; id?: string }) {
	return (
		<h2 id={id} className="term-frame__title">
			{label}
			{meta ? <span className="dim"> · {meta}</span> : null}
		</h2>
	);
}

/** `█`/`░` text meter; decorative, the number beside it carries the value. */
function Meter({ on, off, bracket = false }: { on: number; off: number; bracket?: boolean }) {
	return (
		<span className="term-meter" aria-hidden="true">
			{bracket ? '[' : null}
			{'█'.repeat(Math.max(0, on))}
			<span className="off">{'░'.repeat(Math.max(0, off))}</span>
			{bracket ? ']' : null}
		</span>
	);
}

/**
 * The /system/3b page as a `3b` terminal session (Phosphor Fade). Each former
 * `#` section head is now a prompt line (decorative) plus a frame whose title
 * is the section's real `h2`; the page keeps its single `h1`.
 */
export function System3bPage({ locale }: { locale: Locale }) {
	const localized = snapshotFor(locale);
	const series = localized.blog_series;
	const publishedCount = series.filter((entry) => entry.status === 'published').length;
	const basePath = locale === 'ko' ? '/ko' : '';
	const route = `${basePath}/system/3b`;
	const cwd = cwdFor(route);

	// Node count per layer, derived from the snapshot so the diagram + badges
	// stay accurate across snapshot regenerations.
	const countByLayer: Record<string, number> = {};
	for (const node of localized.nodes)
		countByLayer[node.layer] = (countByLayer[node.layer] ?? 0) + 1;
	const laneMax = Math.max(1, ...localized.layers.map((layer) => countByLayer[layer.id] ?? 0));
	const nodesLabel = m.system_3b_nodes_label({}, { locale });

	// Decision history, newest first.
	const evolution = [...localized.evolution].sort((a, b) => b.date.localeCompare(a.date));

	const seriesOn =
		series.length > 0 ? Math.round((publishedCount / series.length) * SERIES_METER_CELLS) : 0;

	return (
		<div className="pg-s3b">
			{/* Header: the prompt path is the crumb; `~` still links home. */}
			<p className="term-ps1">
				<span className="u" aria-hidden="true">
					brandon@seoul
				</span>
				<span className="s" aria-hidden="true">
					:
				</span>
				<a
					href={homeHref(locale)}
					className="p pg-s3b__crumb"
					aria-label={m.palette_nav_home({}, { locale })}
				>
					~
				</a>
				<span className="p" aria-hidden="true">
					{route}
				</span>
				<span className="s" aria-hidden="true">
					{' $ '}
				</span>
				<span className="cmd" aria-hidden="true">
					cat
				</span>{' '}
				<span className="flag" aria-hidden="true">
					README.md
				</span>
			</p>
			<div className="pg-s3b__hdr">
				<p className="term-eyebrow">{m.system_3b_subtitle({}, { locale })}</p>
				<div className="term-worn pg-s3b__ttl">
					<h1 className="term-ttl">{m.system_3b_title({}, { locale })}</h1>
				</div>
				<p className="pg-s3b__lede">{m.system_3b_intro({}, { locale })}</p>
			</div>

			{/* Overview / stats grid */}
			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="3b stats" />
			<section className="term-frame pg-s3b__stats">
				<FrameTitle
					label={m.system_3b_overview_heading({}, { locale })}
					meta={String(localized.stats.length)}
				/>
				<dl className="pg-s3b__statgrid">
					{localized.stats.map((stat) => (
						<div key={stat.metric} className="pg-s3b__stat">
							<dt className="pg-s3b__statk">{stat.metric}</dt>
							<dd className="pg-s3b__statv">{stat.value}</dd>
						</div>
					))}
				</dl>
			</section>

			{/* Architecture map */}
			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="3b graph" flags="--altitude overview" />
			<section className="term-frame pg-s3b__graph">
				<FrameTitle label={m.system_3b_map_heading({}, { locale })} />
				<System3bGraph
					nodes={localized.nodes}
					edges={localized.edges}
					layers={localized.layers}
					locale={locale}
				/>
			</section>

			{/* Layers */}
			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="ls -l" flags="layers/" />
			<section className="term-frame">
				<FrameTitle
					label={m.system_3b_layers_heading({}, { locale })}
					meta={`${localized.layers.length} · ${localized.nodes.length} ${nodesLabel}`}
				/>
				{localized.layers.map((layer, i) => {
					const count = countByLayer[layer.id] ?? 0;
					return (
						<article key={layer.id} className="pg-s3b__layer">
							<span className="pg-s3b__idx" aria-hidden="true">
								[{i + 1}]
							</span>
							<h3 className="pg-s3b__nm">{layer.name}</h3>
							<p className="pg-s3b__cnt">
								<Meter on={count} off={laneMax - count} />{' '}
								<span className="text-crt-green">{count}</span>{' '}
								<span className="text-crt-faint">{nodesLabel}</span>
							</p>
							<p className="pg-s3b__ds">{layer.description}</p>
						</article>
					);
				})}
			</section>

			{/* Subsystems */}
			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="ls -F" flags="subsystems/" />
			<section className="term-frame">
				<FrameTitle
					label={m.system_3b_subsystems_heading({}, { locale })}
					meta={String(localized.subsystems.length)}
				/>
				{localized.subsystems.map((sub) => (
					<article key={sub.key} className="pg-s3b__sub">
						<div className="pg-s3b__subhead">
							<span className="text-crt-amber" aria-hidden="true">
								/{' '}
							</span>
							<h3 className="pg-s3b__nm">{sub.name}</h3>
							{!sub.public_safe && (
								<span className="pg-s3b__priv">[{m.system_3b_reads_private({}, { locale })}]</span>
							)}
						</div>
						<p className="pg-s3b__ds">{sub.display_one_liner}</p>
					</article>
				))}
			</section>

			{/* Decision history (ADRs) */}
			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="git log" flags="--oneline decisions/" />
			<section className="term-frame pg-s3b__adr">
				<FrameTitle
					id={EVOLUTION_HEADING_ID}
					label={m.system_3b_evolution_heading({}, { locale })}
					meta={String(evolution.length)}
				/>
				{/* axe requires keyboard focus for this scrollable region. */}
				<div
					className="pg-s3b__adrscroll"
					role="region"
					tabIndex={0}
					aria-labelledby={EVOLUTION_HEADING_ID}
				>
					<ul className="pg-s3b__adrlist">
						{evolution.map((adr) => (
							<li key={adr.id} className="pg-s3b__adrrow">
								<span className="text-crt-faint">{adr.date}</span>
								<span className="text-crt-amber">{adr.id}</span>
								<span className="pg-s3b__adrt">{adr.title}</span>
							</li>
						))}
					</ul>
				</div>
			</section>

			{/* Blog series progress */}
			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="3b series" flags="--progress" />
			<section className="term-frame pg-s3b__series">
				<FrameTitle label={m.system_3b_blog_heading({}, { locale })} />
				<p className="pg-s3b__fr">
					<Meter on={seriesOn} off={SERIES_METER_CELLS - seriesOn} bracket />{' '}
					{m.system_3b_blog_progress(
						{ published: publishedCount, total: series.length },
						{ locale },
					)}
				</p>
				<ol className="pg-s3b__serieslist">
					{series.map((post) => (
						<li key={post.slug} className="series-item">
							<span className="pg-s3b__n">{String(post.order).padStart(2, '0')}.</span>{' '}
							{post.status === 'published' ? (
								<a href={`${basePath}/posts/${post.slug}`} className="term-lnk">
									{post.title}
								</a>
							) : (
								<span className="name">{post.title}</span>
							)}
							<span
								className={
									post.status === 'published'
										? 'series-status text-crt-green'
										: 'series-status text-crt-faint'
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

			{/* Snapshot status */}
			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="stat" flags="snapshot.json" />
			<section className="term-frame pg-s3b__kv">
				<FrameTitle label={m.system_3b_status_heading({}, { locale })} />
				<dl>
					<div>
						<dt>{m.system_3b_model_generated({}, { locale })}</dt>
						<dd>{localized.model_generated}</dd>
					</div>
					<div>
						<dt>{m.system_3b_snapshot_built({}, { locale })}</dt>
						<dd>{localized.snapshot_built_at}</dd>
					</div>
				</dl>
				<p className="pg-s3b__note">{m.system_3b_status_note({}, { locale })}</p>
			</section>
		</div>
	);
}
