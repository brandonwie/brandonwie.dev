import { AppLink } from '@/components/AppLink';
import StudyPageShell from './StudyPageShell';
import StudyPrintButton from './StudyPrintButton';
import type { StudyLocale } from '../../data/study';
import {
	getAwsAiPractitionerContent,
	type AwsCard,
	type AwsTerm,
	type AwsTone,
} from '../../data/study-aws-ai-practitioner';

function SecHead({ kicker, title, note }: { kicker: string; title: string; note: string }) {
	return (
		<div className="mb-5 flex flex-wrap items-end gap-x-3.5 gap-y-2">
			<div>
				<p className="font-mono text-xs uppercase tracking-wider text-foam">{kicker}</p>
				<h2 className="mt-1 font-sans text-xl font-semibold tracking-tight text-ink">{title}</h2>
			</div>
			<span className="mb-2.5 hidden h-px flex-1 bg-line2 sm:block"></span>
			<p className="font-mono text-xs text-faint">{note}</p>
		</div>
	);
}

function Term({ item }: { item: AwsTerm }) {
	return (
		<div className={`min-w-0 border-l-2 bg-bg px-3 py-2.5 ${toneBorder[item.tone ?? 'base']}`}>
			<p className="font-sans text-sm font-semibold text-ink">{item.term}</p>
			{item.detail && <p className="mt-0.5 text-xs leading-5 text-muted">{item.detail}</p>}
			{item.signal && (
				<p className={`mt-1 font-mono text-[11px] leading-5 ${toneText[item.tone ?? 'base']}`}>
					{item.signal}
				</p>
			)}
			{item.example && <p className="mt-1 text-xs italic leading-5 text-faint">{item.example}</p>}
		</div>
	);
}

function Layer({ layers, index }: { layers: AwsTerm[]; index: number }) {
	return (
		<div className="border border-line2 bg-bg p-3">
			<p className="text-sm leading-6">
				<span className="font-mono font-bold text-foam">{layers[index].term}</span>
				<span className="text-xs text-muted">{layers[index].detail}</span>
			</p>
			{index + 1 < layers.length && (
				<div className="mt-2">
					<Layer layers={layers} index={index + 1} />
				</div>
			)}
		</div>
	);
}

// Literal class strings so Tailwind can see every variant.
const span: Record<AwsCard['span'], string> = {
	4: 'lg:col-span-4',
	5: 'lg:col-span-5',
	6: 'lg:col-span-6',
	7: 'lg:col-span-7',
	8: 'lg:col-span-8',
	12: 'lg:col-span-12',
};
const columns: Record<2 | 3 | 4, string> = {
	2: 'sm:grid-cols-2',
	3: 'sm:grid-cols-3',
	4: 'sm:grid-cols-2 xl:grid-cols-4',
};
const toneBorder: Record<AwsTone | 'base', string> = {
	base: 'border-foam',
	warn: 'border-gold',
	violet: 'border-iris',
	teal: 'border-pine',
};
const toneText: Record<AwsTone | 'base', string> = {
	base: 'text-foam',
	warn: 'text-gold',
	violet: 'text-iris',
	// NOTE: 'teal' uses text-foam (not text-pine) because text-pine fails WCAG AA
	// contrast on dark bg. Un-toned cards use text-ink, so text-foam still distinguishes teal cards.
	teal: 'text-foam',
};
const tagTone: Record<AwsTone | 'base', string> = {
	base: 'border-line text-muted',
	warn: 'border-gold/50 text-gold',
	violet: 'border-iris/50 text-iris',
	teal: 'border-foam/50 text-foam',
};

/**
 * AwsAiPractitionerStudyPage — shared EN/KO page for the AWS Certified AI
 * Practitioner cram sheet. Static comparison cards with section jump links
 * and a print stylesheet; all copy comes from `study-aws-ai-practitioner`.
 *
 * Port of `src/lib/components/study/AwsAiPractitionerStudyPage.svelte`. The
 * three Svelte snippets become local components (`SecHead`, `Term`, and the
 * recursive `Layer`); the scoped print `<style>` block moves verbatim to
 * `next/app/globals.css` (minus the `:global()` wrappers, following the
 * roadmap-style precedent). The whole page is a client component for the
 * print button's `window.print()` handler; everything else renders
 * statically.
 */
export default function AwsAiPractitionerStudyPage({ locale = 'en' }: { locale?: StudyLocale }) {
	const content = getAwsAiPractitionerContent(locale);
	const basePath = locale === 'ko' ? '/ko' : '';
	const insideLinks = [...content.sections, content.traps].map((section) => ({
		href: `#${section.id}`,
		label: section.kicker,
	}));

	return (
		<StudyPageShell>
			<div data-aws-study>
				<div className="mb-8 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.12em] text-faint">
					<AppLink href={basePath || '/'} className="transition-colors hover:text-foam">
						~
					</AppLink>
					<span className="text-line2">/</span>
					<AppLink href={`${basePath}/study`} className="transition-colors hover:text-foam">
						study
					</AppLink>
					<span className="text-line2">/</span>
					<span>aws-ai-practitioner</span>
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
						<p className="mt-5 inline-flex items-center gap-2 border border-foam/50 px-2.5 py-1 font-mono text-xs text-foam">
							<span aria-hidden="true">✓</span>
							{content.passNote}
						</p>
					</div>
					<aside className="study-card p-5" data-print-hide>
						<p className="font-mono text-xs uppercase tracking-wider text-faint">
							{content.labels.inside}
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
						<StudyPrintButton label={content.labels.print} />
					</aside>
				</section>

				{content.sections.map((section) => (
					<section key={section.id} id={section.id} className="mt-16 scroll-mt-24">
						<SecHead kicker={section.kicker} title={section.title} note={section.note} />
						<div className="grid gap-4 lg:grid-cols-12">
							{section.cards.map((card) => (
								<article key={card.title} className={`study-card min-w-0 p-5 ${span[card.span]}`}>
									<h3
										className={`font-sans text-lg font-semibold ${card.tone ? toneText[card.tone] : 'text-ink'}`}
									>
										{card.title}
									</h3>
									{card.subtitle && (
										<p className="mt-1 font-mono text-xs text-faint">{card.subtitle}</p>
									)}
									{card.definition && (
										<p className="mt-2 text-sm leading-6 text-muted">{card.definition}</p>
									)}
									<div className="mt-4 grid gap-3">
										{card.blocks.map((block, blockIndex) => {
											if (block.kind === 'hierarchy') {
												return <Layer key={blockIndex} layers={block.layers} index={0} />;
											}
											if (block.kind === 'compare') {
												return (
													<div key={blockIndex} className={`grid gap-2 ${columns[block.columns]}`}>
														{block.items.map((item, itemIndex) => (
															<Term key={itemIndex} item={item} />
														))}
													</div>
												);
											}
											if (block.kind === 'services') {
												return (
													<div key={blockIndex} className={`grid gap-2 ${columns[block.columns]}`}>
														{block.items.map((service) => (
															<div
																key={service.name}
																className="min-w-0 border border-line bg-bg p-3"
															>
																<p className="text-sm font-semibold text-ink">{service.name}</p>
																<p className="text-xs leading-5 text-muted">{service.role}</p>
																<p className="mt-2 font-mono text-[11px] leading-5 text-foam">
																	▸ {service.trigger}
																</p>
																<p className="mt-1 text-xs italic leading-5 text-faint">
																	{service.example}
																</p>
															</div>
														))}
													</div>
												);
											}
											if (block.kind === 'flow') {
												return (
													<ol key={blockIndex} className="flex flex-wrap items-center gap-2">
														{block.steps.map((step, stepIndex) => (
															<li key={stepIndex} className="flex min-w-0 items-center gap-2">
																<div className="min-w-0 border border-line bg-bg px-3 py-2">
																	<p className="text-sm font-semibold text-ink">{step.term}</p>
																	{step.detail && (
																		<p className="text-xs leading-5 text-muted">{step.detail}</p>
																	)}
																</div>
																{block.joins[stepIndex] && (
																	<span aria-hidden="true" className="font-mono text-faint">
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
													<ul key={blockIndex} className="flex flex-wrap gap-2">
														{block.tags.map((tag) => (
															<li
																key={tag.text}
																className={`border px-2 py-1 font-mono text-[11px] leading-5 ${tagTone[tag.tone ?? 'base']}`}
															>
																{tag.text}
															</li>
														))}
													</ul>
												);
											}
											return (
												<p key={blockIndex} className="font-mono text-xs leading-5 text-faint">
													{block.text}
												</p>
											);
										})}
									</div>
								</article>
							))}
						</div>
					</section>
				))}

				<section id={content.traps.id} className="mt-16 scroll-mt-24">
					<SecHead
						kicker={content.traps.kicker}
						title={content.traps.title}
						note={content.traps.note}
					/>
					<dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{content.traps.items.map((trap) => (
							<div key={trap.signal} className="study-card flex min-w-0 flex-col gap-1 p-3">
								<dt className="text-sm leading-6 text-muted">{trap.signal}</dt>
								<dd className="font-mono text-sm leading-6 text-foam">→ {trap.pick}</dd>
							</div>
						))}
					</dl>
				</section>

				<section className="mt-16 study-card p-5">
					<p className="font-mono text-xs uppercase tracking-wider text-faint">
						{content.labels.sources}
					</p>
					<p className="mt-3 max-w-3xl text-sm leading-7 text-muted">{content.sourceNote}</p>
				</section>
			</div>
		</StudyPageShell>
	);
}
