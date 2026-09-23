import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';

import { AppLink } from '@/components/AppLink';
import { TermPrompt } from '@/shell/TermPrompt';
import { cwdFor } from '@/shell/terminal-path';
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
 * Number of panes in the `lab` slot. Each course passes its visualizers as one
 * fragment, so the count is the fragment's children; it feeds the decorative
 * `./lab --panes N` prompt and the `· N visualizers` label suffix only.
 */
function countPanes(lab: ReactNode): number {
	if (isValidElement(lab) && lab.type === Fragment) {
		return Children.count((lab as ReactElement<{ children?: ReactNode }>).props.children);
	}
	return Children.count(lab);
}

/**
 * Shared layout for the four DSA course pages as a terminal session: a `pwd`
 * breadcrumb, a `cat README.md` hero with the "what's inside" pane,
 * `coverage.txt`, the module roadmap, the visual lab, concept notes and the
 * recall quiz. Each course keeps its thin wrapper for its content getter and
 * lab set.
 *
 * Headings: one `h1`; every section label is an `h2` (the roadmap's frame
 * title, `.sc-lbl` elsewhere); every card title an `h3`. The prompt lines are
 * decorative (`TermPrompt` is `aria-hidden`). The anchor ids `map`, `lab` and
 * `recall` stay because the inside pane links to them. Command, flag and file
 * names in prompts and frame suffixes are terminal syntax and stay English in
 * both locales.
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
	const cwd = cwdFor(`${basePath}/study/${slug}`);
	const panes = countPanes(lab);
	const prompts = content.modules.reduce((total, module) => total + module.recall.length, 0);
	const insideLinks = [
		{ href: '#map', label: content.sections.map },
		{ href: '#lab', label: content.sections.lab },
		{ href: '#recall', label: content.sections.recall },
	];

	return (
		<StudyPageShell className="pg-study-course">
			<TermPrompt cwd={cwd} command="pwd" />
			<div className="st-bc">
				<AppLink href={basePath || '/'}>{`~${basePath}`}</AppLink>
				<span className="st-bc__sep">/</span>
				<AppLink href={`${basePath}/study`}>study</AppLink>
				<span className="st-bc__sep">/</span>
				<span className="st-bc__leaf">{slug}</span>
			</div>

			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="cat README.md" />
			<section className="st-hero">
				<div>
					<p className="term-eyebrow">{content.eyebrow}</p>
					<h1 className="term-ttl term-worn">{content.title}</h1>
					<p className="st-lede">{content.subtitle}</p>
				</div>
				<aside className="term-frame st-inside">
					<p className="term-frame__title">{content.sections.inside}</p>
					<ul>
						{insideLinks.map((link, index) => (
							<li key={link.href}>
								<a href={link.href} className="term-lnk">
									<span className="n" aria-hidden="true">
										[{index + 1}]
									</span>
									{link.label}
								</a>
							</li>
						))}
					</ul>
				</aside>
			</section>

			<div className="term-frame sc-cov">
				<p className="term-frame__title">
					coverage.txt <span className="dim">· {content.coverage.length} lines</span>
				</p>
				<ol>
					{content.coverage.map((item, index) => (
						<li key={item}>
							<span className="sc-cov__ln" aria-hidden="true">
								{index + 1}
							</span>
							<span>{item}</span>
						</li>
					))}
				</ol>
			</div>

			<section id="map" className="st-sec scroll-mt-24">
				<TermPrompt cwd={cwd} command="ls modules/" flags="--roadmap" />
				<div className="term-frame">
					<h2 className="term-frame__title">
						{content.sections.map}{' '}
						<span className="dim" aria-hidden="true">
							· {content.modules.length} modules
						</span>
					</h2>
					<StudyRoadmap modules={content.modules} ariaLabel={content.sections.map} />
				</div>
			</section>

			<section id="lab" className="st-sec scroll-mt-24">
				<TermPrompt cwd={cwd} command="./lab" flags={`--panes ${panes}`} />
				<h2 className="sc-lbl">
					{content.sections.lab}
					<span aria-hidden="true"> · {panes} visualizers</span>
				</h2>
				<div className="sc-lab">{lab}</div>
			</section>

			<section className="st-sec">
				<TermPrompt cwd={cwd} command="cat notes/*.md" />
				<h2 className="sc-lbl">
					{content.sections.notes}
					<span aria-hidden="true"> · {content.concepts.length} files</span>
				</h2>
				<div className="sc-grid2">
					{content.concepts.map((concept, index) => (
						<article key={concept.title} className="term-frame sc-note">
							<p className="term-frame__title" aria-hidden="true">
								note {index + 1}/{content.concepts.length}
							</p>
							<h3 className="sc-h">{concept.title}</h3>
							<p className="sc-small">{concept.body}</p>
							<p className="sc-src">{concept.source}</p>
						</article>
					))}
				</div>
			</section>

			<section id="recall" className="st-sec scroll-mt-24">
				<TermPrompt cwd={cwd} command="quiz" flags="--recall" />
				<h2 className="sc-lbl">
					{content.sections.recall}
					<span aria-hidden="true"> · {prompts} prompts</span>
				</h2>
				<div className="sc-grid2">
					{content.modules.map((module, index) => (
						<div key={index} className="term-frame sc-rc">
							<p className="term-frame__title">{module.kicker}</p>
							<h3 className="sc-h">{module.title}</h3>
							<div className="sc-rc__list">
								{module.recall.map((prompt) => (
									<details key={prompt.q} className="study-recall">
										<summary>{prompt.q}</summary>
										<p className="sc-rc__a">{prompt.a}</p>
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
