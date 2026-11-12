import type { ReactNode } from 'react';

import { AppLink } from '@/components/AppLink';
import { shellCopy } from '@/i18n/copy';
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

/**
 * Shared layout for the four DSA course pages: a header with the coverage list
 * and in-page links, then the module roadmap, the visual lab, concept notes and
 * the recall quiz. Each course keeps its thin wrapper for its content getter
 * and lab set.
 *
 * Headings: one `h1`; every section an `h2`; every card title an `h3` (the
 * visualizers bring their own). The anchor ids `map`, `lab` and `recall` stay
 * because the in-page links point at them.
 */
export default function DsaStudyPageLayout({
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
		<StudyPageShell className="course">
			<header className="study__head">
				<p className="study__crumbs" data-pagefind-ignore>
					<AppLink href={`${basePath}/study`}>
						<span aria-hidden="true">←</span> {shellCopy(locale).nav.study}
					</AppLink>
				</p>
				<p className="eyebrow">{content.eyebrow}</p>
				<h1>{content.title}</h1>
				<p className="study__lede">{content.subtitle}</p>
				<ul className="course__coverage">
					{content.coverage.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
				<nav className="study__toc" aria-label={content.sections.inside} data-print-hide>
					{insideLinks.map((link) => (
						<a key={link.href} href={link.href} className="text-link">
							{link.label}
						</a>
					))}
				</nav>
			</header>

			<section id="map" className="study__section" aria-labelledby="course-map">
				<h2 id="course-map" className="study__h2">
					{content.sections.map}
				</h2>
				<StudyRoadmap modules={content.modules} ariaLabel={content.sections.map} />
			</section>

			<section id="lab" className="study__section" aria-labelledby="course-lab">
				<h2 id="course-lab" className="study__h2">
					{content.sections.lab}
				</h2>
				<div className="course__lab">{lab}</div>
			</section>

			<section className="study__section" aria-labelledby="course-notes">
				<h2 id="course-notes" className="study__h2">
					{content.sections.notes}
				</h2>
				<div className="course__grid">
					{content.concepts.map((concept) => (
						<article key={concept.title} className="course__card">
							<h3 className="course__h3">{concept.title}</h3>
							<p className="course__body">{concept.body}</p>
							<p className="course__source">{concept.source}</p>
						</article>
					))}
				</div>
			</section>

			<section id="recall" className="study__section" aria-labelledby="course-recall">
				<h2 id="course-recall" className="study__h2">
					{content.sections.recall}
				</h2>
				<div className="course__grid">
					{content.modules.map((module, index) => (
						<div key={index} className="course__card">
							<p className="eyebrow">{module.kicker}</p>
							<h3 className="course__h3">{module.title}</h3>
							<div className="course__recall">
								{module.recall.map((prompt) => (
									<details key={prompt.q} className="study-recall">
										<summary>{prompt.q}</summary>
										<p className="course__answer">{prompt.a}</p>
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
