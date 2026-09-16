'use client';

import type { ReactNode } from 'react';

import { AppLink } from '@/components/AppLink';
import StudyPageShell from './StudyPageShell';
import StudyRoadmap from './StudyRoadmap';
import type { DsaConceptCard, DsaModule, StudyLocale } from '../../data/study';

export interface DsaStudySections {
	map: string;
	lab: string;
	notes: string;
	recall: string;
	inside: string;
}

/**
 * The structural shape every DSA course content object shares. The four
 * `Dsa*Content` interfaces each declare these fields (plus their own
 * `visuals`); typing the layout against the shared subset keeps the four
 * pages one layout instead of four copies, and `tsc` rejects any course
 * that drifts from it.
 */
export interface DsaStudyContent {
	eyebrow: string;
	title: string;
	subtitle: string;
	sections: DsaStudySections;
	coverage: string[];
	modules: DsaModule[];
	concepts: DsaConceptCard[];
}

function SecHead({ label }: { label: string }) {
	return (
		<div className="mb-5 flex items-center gap-3.5">
			<span className="font-mono font-bold text-foam">#</span>
			<h2 className="font-sans text-xl font-semibold tracking-tight text-ink">{label}</h2>
			<span className="h-px flex-1 bg-line2"></span>
		</div>
	);
}

/**
 * Shared shell for the four DSA course pages. Port of the common structure
 * of `DsaI..IVStudyPage.svelte` (breadcrumb, hero, coverage, map, lab slot,
 * notes, recall). Each course keeps its thin wrapper for its content getter
 * and lab grid; `StudySeoHead` is omitted everywhere — head metadata comes
 * from each route's `generateMetadata`, the App Router contract the ported
 * `StudySeoHead` documents.
 */
export default function DsaStudyPageLayout({
	slug,
	locale = 'en',
	content,
	lab,
}: {
	slug: string;
	locale?: StudyLocale;
	content: DsaStudyContent;
	lab: ReactNode;
}) {
	const basePath = locale === 'ko' ? '/ko' : '';
	const insideLinks = [
		{ href: '#map', label: content.sections.map },
		{ href: '#lab', label: content.sections.lab },
		{ href: '#recall', label: content.sections.recall },
	];

	return (
		<StudyPageShell>
			<div className="mb-8 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.12em] text-faint">
				<AppLink href={basePath || '/'} className="transition-colors hover:text-foam">
					~
				</AppLink>
				<span className="text-line2">/</span>
				<AppLink href={`${basePath}/study`} className="transition-colors hover:text-foam">
					study
				</AppLink>
				<span className="text-line2">/</span>
				<span>{slug}</span>
			</div>

			<section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
				<div>
					<p className="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
						{content.eyebrow}
					</p>
					<h1 className="mt-4 max-w-4xl font-sans text-3xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
						{content.title}
					</h1>
					<p className="mt-6 max-w-3xl font-sans text-lg leading-8 text-muted">
						{content.subtitle}
					</p>
				</div>
				<aside className="study-card p-5">
					<p className="font-mono text-xs uppercase tracking-wider text-faint">
						{content.sections.inside}
					</p>
					<ul className="mt-4 grid gap-2">
						{insideLinks.map((link) => (
							<li key={link.href}>
								<a
									href={link.href}
									className="flex items-center gap-2 font-mono text-sm text-muted no-underline transition-colors hover:text-foam"
								>
									<span className="text-foam">▸</span>
									{link.label}
								</a>
							</li>
						))}
					</ul>
				</aside>
			</section>

			<section className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{content.coverage.map((item) => (
					<div key={item} className="study-card p-4 text-sm leading-6 text-muted">
						{item}
					</div>
				))}
			</section>

			<section id="map" className="mt-16 scroll-mt-24">
				<SecHead label={content.sections.map} />
				<div className="mt-6">
					<StudyRoadmap modules={content.modules} ariaLabel={content.sections.map} />
				</div>
			</section>

			<section id="lab" className="mt-16 scroll-mt-24">
				<SecHead label={content.sections.lab} />
				<div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-2">{lab}</div>
			</section>

			<section className="mt-16">
				<SecHead label={content.sections.notes} />
				<div className="mt-5 grid gap-4 lg:grid-cols-3">
					{content.concepts.map((concept) => (
						<article key={concept.title} className="study-card p-5">
							<h3 className="font-sans text-lg font-semibold text-ink">{concept.title}</h3>
							<p className="mt-3 text-sm leading-7 text-muted">{concept.body}</p>
							<p className="mt-4 font-mono text-xs text-faint">{concept.source}</p>
						</article>
					))}
				</div>
			</section>

			<section id="recall" className="mt-16 scroll-mt-24">
				<SecHead label={content.sections.recall} />
				<div className="mt-5 grid gap-4 lg:grid-cols-2">
					{content.modules.map((module, index) => (
						<div key={index} className="study-card p-5">
							<p className="font-mono text-xs uppercase tracking-wider text-foam">
								{module.kicker}
							</p>
							<h3 className="mt-2 font-sans text-base font-semibold text-ink">{module.title}</h3>
							<div className="mt-4 grid gap-2">
								{module.recall.map((prompt) => (
									<details key={prompt.q} className="study-recall">
										<summary>{prompt.q}</summary>
										<p className="px-3 pb-3 text-sm leading-7 text-muted">{prompt.a}</p>
									</details>
								))}
							</div>
						</div>
					))}
				</div>
			</section>
		</StudyPageShell>
	);
}
