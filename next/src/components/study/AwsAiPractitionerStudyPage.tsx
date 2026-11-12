import { Fragment, type ReactNode } from 'react';

import { AppLink } from '@/components/AppLink';
import { shellCopy } from '@/i18n/copy';
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

/** Section head: kicker, `h2` and the section note. */
function SecHead({ kicker, title, note }: { kicker: string; title: string; note: string }) {
	return (
		<div className="aws__sec-head">
			<p className="eyebrow">{kicker}</p>
			<h2 className="study__h2">{title}</h2>
			<p className="aws__sec-note">{note}</p>
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

// Tone classes (study-aws.css): warn → `--warn`, violet → `--iris`,
// teal → `--foam`; untoned items use the accent.
const tone: Record<AwsTone, string> = {
	warn: 'aws__tone-warn',
	violet: 'aws__tone-violet',
	teal: 'aws__tone-teal',
};
const toneOf = (value?: AwsTone) => (value ? ` ${tone[value]}` : '');

// Literal class strings for the 12-column spans (the data's own widths).
const span: Record<AwsCard['span'], string> = {
	4: 'aws__s4',
	5: 'aws__s5',
	6: 'aws__s6',
	7: 'aws__s7',
	8: 'aws__s8',
	12: 'aws__s12',
};

function Term({ item }: { item: AwsTerm }) {
	return (
		<div className={`aws__cell${toneOf(item.tone)}`}>
			<p className="aws__term">{item.term}</p>
			{item.detail && <p className="aws__detail">{breakAfterSlash(item.detail)}</p>}
			{item.signal && <p className="aws__signal">{breakAfterSlash(item.signal)}</p>}
			{item.example && <p className="aws__example">{item.example}</p>}
		</div>
	);
}

/** Hierarchy: nested boxes, outer layer first. */
function Layer({ layers, index }: { layers: AwsTerm[]; index: number }) {
	return (
		<div className="aws__layer">
			<p>
				<span className="aws__layer-key">{layers[index].term}</span> {layers[index].detail}
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
			<div className={`aws__cells aws__c${block.columns}`}>
				{block.items.map((item, itemIndex) => (
					<Term key={itemIndex} item={item} />
				))}
			</div>
		);
	}
	if (block.kind === 'services') {
		return (
			<div className={`aws__cells aws__c${block.columns}`}>
				{block.items.map((service) => (
					<div key={service.name} className="aws__service">
						<p className="aws__term">{service.name}</p>
						<p className="aws__detail">{breakAfterSlash(service.role)}</p>
						<p className="aws__signal">{breakAfterSlash(service.trigger)}</p>
						<p className="aws__example">{service.example}</p>
					</div>
				))}
			</div>
		);
	}
	if (block.kind === 'flow') {
		return (
			<ol className="aws__flow">
				{block.steps.map((step, stepIndex) => (
					<li key={stepIndex}>
						<div className="aws__step">
							<p className="aws__term">{step.term}</p>
							{step.detail && <p className="aws__step-detail">{step.detail}</p>}
						</div>
						{block.joins[stepIndex] && (
							<span aria-hidden="true" className="aws__join">
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
			<ul className="aws__tags">
				{block.tags.map((tag) => (
					<li key={tag.text} className={`tag${toneOf(tag.tone)}`}>
						{tag.text}
					</li>
				))}
			</ul>
		);
	}
	return <p className="aws__aside">{block.text}</p>;
}

/**
 * AwsAiPractitionerStudyPage — the AIF-C01 cram sheet: a header with the pass
 * line, in-page links and the print button, five sections of 12-column cards,
 * the exam-traps list and the sources. All cards and traps render; copy comes
 * from `study-aws-ai-practitioner`.
 *
 * Print: `data-print-hide` drops the screen-only parts (study-index.css), and
 * `data-aws-study` is the hook for the print token sheet in
 * talk-deck-slides.css. A server component; only the print button is client
 * (`StudyPrintButton`).
 */
export default function AwsAiPractitionerStudyPage({ locale = 'en' }: { locale?: StudyLocale }) {
	const content = getAwsAiPractitionerContent(locale);
	const basePath = locale === 'ko' ? '/ko' : '';
	const insideLinks = [...content.sections, content.traps].map((section) => ({
		href: `#${section.id}`,
		label: section.kicker,
	}));

	return (
		<StudyPageShell className="aws">
			<div className="aws__page" data-aws-study>
				<header className="study__head">
					<p className="study__crumbs" data-pagefind-ignore>
						<AppLink href={`${basePath}/study`}>
							<span aria-hidden="true">←</span> {shellCopy(locale).nav.study}
						</AppLink>
					</p>
					<p className="eyebrow">{content.eyebrow}</p>
					<h1>{content.title}</h1>
					<p className="study__lede">{content.subtitle}</p>
					<p className="aws__pass">{content.passNote}</p>
					<div className="aws__tools" data-print-hide>
						<nav className="study__toc" aria-label={content.labels.inside}>
							{insideLinks.map((link) => (
								<a key={link.href} href={link.href} className="text-link">
									{link.label}
								</a>
							))}
						</nav>
						<StudyPrintButton label={content.labels.print} />
					</div>
				</header>

				{content.sections.map((section) => (
					<section key={section.id} id={section.id} className="study__section">
						<SecHead kicker={section.kicker} title={section.title} note={section.note} />
						<div className="aws__cards">
							{section.cards.map((card) => (
								<article
									key={card.title}
									className={`aws__card ${span[card.span]}${toneOf(card.tone)}`}
								>
									<h3 className="aws__card-title">{card.title}</h3>
									{card.subtitle && <p className="aws__card-sub">{card.subtitle}</p>}
									{card.definition && <p className="aws__card-def">{card.definition}</p>}
									{card.blocks.map((block, blockIndex) => (
										<div key={blockIndex} className="aws__block">
											<Block block={block} />
										</div>
									))}
								</article>
							))}
						</div>
					</section>
				))}

				<section id={content.traps.id} className="study__section">
					<SecHead
						kicker={content.traps.kicker}
						title={content.traps.title}
						note={content.traps.note}
					/>
					<dl className="aws__traps">
						{content.traps.items.map((trap) => (
							<div key={trap.signal}>
								<dt>{breakAfterSlash(trap.signal)}</dt>
								<dd>{breakAfterSlash(trap.pick)}</dd>
							</div>
						))}
					</dl>
				</section>

				<section className="study__section" aria-labelledby="aws-sources">
					<h2 id="aws-sources" className="study__h2">
						{content.labels.sources}
					</h2>
					<p className="aws__sources">{content.sourceNote}</p>
				</section>
			</div>
		</StudyPageShell>
	);
}
