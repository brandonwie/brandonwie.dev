import { Fragment, type ReactNode } from 'react';

import { AppLink } from '@/components/AppLink';
import { TermPrompt } from '@/shell/TermPrompt';
import { cwdFor } from '@/shell/terminal-path';
import StudyPageShell from './StudyPageShell';
import StudyPrintButton from './StudyPrintButton';
import type { StudyLocale } from '../../data/study';
import {
	getAwsAiPractitionerContent,
	type AwsBlock,
	type AwsCard,
	type AwsTerm,
	type AwsTone,
} from '../../data/study-aws-ai-practitioner';

/** Section head: amber kicker, `## title`, a rule, and the note in faint. */
function SecHead({ kicker, title, note }: { kicker: string; title: string; note: string }) {
	return (
		<div className="sa-sh">
			<div>
				<p className="st-kick">{kicker}</p>
				<h2 className="term-sub">{title}</h2>
			</div>
			<span className="sa-sh__rl" aria-hidden="true" />
			<p className="sa-sh__nt">{note}</p>
		</div>
	);
}

/**
 * Allow a line break after each `/` in slash-joined tokens
 * (`instructions/examples`), so narrow cells wrap there instead of splitting a
 * word (`overflow-wrap: anywhere` is never used on this page).
 */
function breakAfterSlash(text: string): ReactNode {
	if (!text.includes('/')) return text;
	const parts = text.split('/');
	return parts.map((part, index) => (
		<Fragment key={index}>
			{part}
			{index < parts.length - 1 ? (
				<>
					/<wbr />
				</>
			) : null}
		</Fragment>
	));
}

// Shell-ink tone classes (study-aws.css): warn → amber, violet → hi,
// teal → green with a dotted rule; untoned cells use the base green rule.
const tone: Record<AwsTone, string> = { warn: 'sa-tw', violet: 'sa-tv', teal: 'sa-tt' };
const toneOf = (value?: AwsTone) => (value ? ` ${tone[value]}` : '');

// Literal class strings for the 12-column spans (the data's own widths).
const span: Record<AwsCard['span'], string> = {
	4: 'sa-s4',
	5: 'sa-s5',
	6: 'sa-s6',
	7: 'sa-s7',
	8: 'sa-s8',
	12: 'sa-s12',
};

function Term({ item }: { item: AwsTerm }) {
	return (
		<div className={`sa-cell${toneOf(item.tone)}`}>
			<p className="sa-b">{item.term}</p>
			{item.detail && <p className="sa-d">{breakAfterSlash(item.detail)}</p>}
			{item.signal && <p className="sa-sg">{breakAfterSlash(item.signal)}</p>}
			{item.example && <p className="sa-ex">{item.example}</p>}
		</div>
	);
}

/** Hierarchy: nested square boxes, term green bold, detail worn. */
function Layer({ layers, index }: { layers: AwsTerm[]; index: number }) {
	return (
		<div className="sa-lay">
			<p>
				<span className="sa-lay__k">{layers[index].term}</span> {layers[index].detail}
			</p>
			{index + 1 < layers.length && <Layer layers={layers} index={index + 1} />}
		</div>
	);
}

function Block({ block }: { block: AwsBlock }) {
	if (block.kind === 'hierarchy') {
		return <Layer layers={block.layers} index={0} />;
	}
	if (block.kind === 'compare') {
		return (
			<div className={`sa-cells sa-c${block.columns}`}>
				{block.items.map((item, itemIndex) => (
					<Term key={itemIndex} item={item} />
				))}
			</div>
		);
	}
	if (block.kind === 'services') {
		return (
			<div className={`sa-cells sa-c${block.columns}`}>
				{block.items.map((service) => (
					<div key={service.name} className="sa-svc">
						<p className="sa-b">{service.name}</p>
						<p className="sa-d">{breakAfterSlash(service.role)}</p>
						<p className="sa-sg">{breakAfterSlash(service.trigger)}</p>
						<p className="sa-ex">{service.example}</p>
					</div>
				))}
			</div>
		);
	}
	if (block.kind === 'flow') {
		return (
			<ol className="sa-flow">
				{block.steps.map((step, stepIndex) => (
					<li key={stepIndex}>
						<div className="sa-flow__st">
							<p className="sa-b">{step.term}</p>
							{step.detail && <p className="sa-flow__d">{step.detail}</p>}
						</div>
						{block.joins[stepIndex] && (
							<span aria-hidden="true" className="sa-flow__j">
								{block.joins[stepIndex]}
							</span>
						)}
					</li>
				))}
			</ol>
		);
	}
	if (block.kind === 'tags') {
		return (
			<ul className="sa-chips">
				{block.tags.map((tag) => (
					<li key={tag.text} className={`sa-chip${toneOf(tag.tone)}`}>
						{tag.text}
					</li>
				))}
			</ul>
		);
	}
	return <p className="sa-nt">{block.text}</p>;
}

/**
 * AwsAiPractitionerStudyPage — the AIF-C01 cram sheet as a terminal session:
 * `pwd` breadcrumb, a `cat README.md` hero with the `[ ok ]` pass line and the
 * "on this page" pane (print button inside), five `cat sheet/0N-<id>.md`
 * sections of 12-column card frames, the `exam-traps.tsv` table and the
 * sources frame. All 33 cards and 36 traps render; copy comes from
 * `study-aws-ai-practitioner`, whose shape is shared with the Svelte build.
 *
 * Print: `data-aws-study` and `data-print-hide` are the hooks for the
 * `@media print` sheet (next/app/globals.css + study-aws.css), which drops the
 * CRT and prints dark ink on white. A server component; only the print button
 * is client (`StudyPrintButton`).
 */
export default function AwsAiPractitionerStudyPage({ locale = 'en' }: { locale?: StudyLocale }) {
	const content = getAwsAiPractitionerContent(locale);
	const basePath = locale === 'ko' ? '/ko' : '';
	const cwd = cwdFor(`${basePath}/study/aws-ai-practitioner`);
	const insideLinks = [...content.sections, content.traps].map((section) => ({
		href: `#${section.id}`,
		label: section.kicker,
	}));
	const sheet = (index: number, id: string) => `sheet/${String(index + 1).padStart(2, '0')}-${id}`;
	const trapsFile = sheet(content.sections.length, content.traps.id);
	const trapsHead = (
		<div className="sa-thd__hd">
			<span>#</span>
			<span>see</span>
			<span>pick</span>
		</div>
	);

	return (
		<StudyPageShell className="pg-study-aws">
			<div data-aws-study>
				<TermPrompt cwd={cwd} command="pwd" />
				<div className="st-bc">
					<AppLink href={basePath || '/'}>{`~${basePath}`}</AppLink>
					<span className="st-bc__sep">/</span>
					<AppLink href={`${basePath}/study`}>study</AppLink>
					<span className="st-bc__sep">/</span>
					<span className="st-bc__leaf">aws-ai-practitioner</span>
				</div>

				<div className="term-gap" />
				<TermPrompt cwd={cwd} command="cat README.md" />
				<section className="st-hero">
					<div>
						<p className="term-eyebrow">{content.eyebrow}</p>
						<h1 className="term-ttl term-worn">{content.title}</h1>
						<p className="st-lede">{content.subtitle}</p>
						<p className="sa-pass">
							<span className="sa-pass__ok" aria-hidden="true">
								[ <b>ok</b> ]
							</span>
							{content.passNote}
						</p>
					</div>
					<aside className="term-frame st-inside" data-print-hide>
						<p className="term-frame__title">{content.labels.inside}</p>
						<ul>
							{insideLinks.map((link) => (
								<li key={link.href}>
									<a href={link.href} className="term-lnk">
										{link.label}
									</a>
								</li>
							))}
						</ul>
						<StudyPrintButton label={content.labels.print} />
					</aside>
				</section>

				{content.sections.map((section, sectionIndex) => (
					<section key={section.id} id={section.id} className="st-sec scroll-mt-24">
						<TermPrompt cwd={cwd} command={`cat ${sheet(sectionIndex, section.id)}.md`} />
						<SecHead kicker={section.kicker} title={section.title} note={section.note} />
						<div className="sa-cards">
							{section.cards.map((card) => (
								<article
									key={card.title}
									className={`term-frame sa-card ${span[card.span]}${toneOf(card.tone)}`}
								>
									<h3 className="term-frame__title">{card.title}</h3>
									{card.subtitle && <p className="sa-card__sub">{card.subtitle}</p>}
									{card.definition && <p className="sa-card__def">{card.definition}</p>}
									{card.blocks.map((block, blockIndex) => (
										<div key={blockIndex} className="sa-blk">
											<Block block={block} />
										</div>
									))}
								</article>
							))}
						</div>
					</section>
				))}

				<section id={content.traps.id} className="st-sec scroll-mt-24">
					<TermPrompt cwd={cwd} command={`column -t ${trapsFile}.tsv`} />
					<SecHead
						kicker={content.traps.kicker}
						title={content.traps.title}
						note={content.traps.note}
					/>
					<div className="term-frame sa-trapsf">
						<p className="term-frame__title" aria-hidden="true">
							{content.traps.id}.tsv{' '}
							<span className="dim">· {content.traps.items.length} lines</span>
						</p>
						<div className="sa-thd" aria-hidden="true">
							{trapsHead}
							{trapsHead}
						</div>
						<dl className="sa-traps">
							{content.traps.items.map((trap) => (
								<div key={trap.signal}>
									<dt>{breakAfterSlash(trap.signal)}</dt>
									<dd>{breakAfterSlash(trap.pick)}</dd>
								</div>
							))}
						</dl>
					</div>
				</section>

				<section className="st-sec">
					<TermPrompt cwd={cwd} command="cat sheet/ABOUT" />
					<div className="term-frame sa-src">
						<p className="term-frame__title">{content.labels.sources}</p>
						<p>{content.sourceNote}</p>
					</div>
				</section>
			</div>
		</StudyPageShell>
	);
}
