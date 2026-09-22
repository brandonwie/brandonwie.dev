import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AppLink } from '@/components/AppLink';
import { aboutCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { getAboutContent } from '../../../src/lib/data/about';

export interface AboutPageProps {
	locale?: Locale;
}

const portrait = readFileSync(
	join(process.cwd(), '..', 'src/lib/data/portrait.ascii.txt'),
	'utf8',
).trimEnd();

const surfaceLevels = [92, 78, 66, 54, 42];

function isExternal(href: string): boolean {
	return href.startsWith('http');
}

function Prompt({ command }: { command: string }) {
	return (
		<>
			<span aria-hidden="true" className="text-crt-green">
				$
			</span>
			<span>{command}</span>
		</>
	);
}

function SectionPrompt({ command, label }: { command: string; label: string }) {
	return (
		<h2 className="flex flex-wrap gap-x-2 font-mono text-[13px] leading-6 text-crt-amber">
			<Prompt command={command} />
			<span className="sr-only">{label}</span>
		</h2>
	);
}

export function AboutPage({ locale = 'en' }: AboutPageProps) {
	const content = getAboutContent(locale);
	const copy = aboutCopy(locale);

	return (
		<main id="main-content" className="mx-auto max-w-[960px] px-4 py-6 sm:px-6">
			<div className="crt-panel">
				<div className="crt-glass-inner">
					<div className="crt-film" aria-hidden="true" />
					<div
						aria-hidden="true"
						className="pointer-events-none absolute right-[26px] top-[120px] z-0 font-mono text-[92px] leading-none tracking-[0.06em] text-[#e0a35c0f]"
					>
						3B
					</div>

					<div className="relative z-10">
						<div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line2 pb-2.5">
							<div className="flex gap-3" aria-hidden="true">
								{[0, 1, 2].map((dot) => (
									<span
										key={dot}
										className="h-[9px] w-[9px] rounded-full border border-line2 bg-highlight-low"
									/>
								))}
							</div>
							<span className="font-mono text-xs tracking-[0.1em] text-faint">
								brandon@seoul:~/about
							</span>
							<span className="font-mono text-[11px] uppercase tracking-[0.16em] text-crt-amber/75 sm:ml-auto">
								{copy.terminalSignal}
							</span>
						</div>

						{/* Hero */}
						<section className="mt-4">
							<p className="flex gap-2 font-mono text-[13px] leading-6 text-crt-amber">
								<Prompt command="whoami --long" />
							</p>
							<p className="mt-2 font-mono text-xs text-faint">{copy.terminalLoading}</p>
							<div className="mt-[18px] grid items-start gap-7 lg:grid-cols-[340px_minmax(0,1fr)]">
								<figure className="min-w-0">
									<pre
										role="img"
										aria-label={copy.portraitCaption}
										className="m-0 overflow-hidden border-0 font-mono text-[10px] leading-[10px] text-crt-amber opacity-[0.92]"
									>
										{portrait}
									</pre>
									<figcaption className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
										{copy.portraitCaption}
									</figcaption>
								</figure>
								<div className="min-w-0">
									<p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
										{content.eyebrow}
									</p>
									<h1 className="mt-1.5 font-sans text-[32px] font-bold leading-[1.08] tracking-[-0.02em] text-ink sm:text-[40px]">
										{content.title}
									</h1>
									<p className="mt-4 font-sans text-base leading-7 text-muted">
										{content.subtitle}
									</p>
									<dl className="mt-5 grid gap-1 font-mono text-xs leading-5">
										{content.metrics.map((metric) => (
											<div
												key={metric.label}
												className="grid grid-cols-[150px_minmax(0,1fr)] gap-3"
											>
												<dt className="uppercase tracking-[0.1em] text-faint">{metric.label}</dt>
												<dd className="text-crt-green">{metric.value}</dd>
											</div>
										))}
									</dl>
								</div>
							</div>
						</section>

						{/* Intro */}
						<section className="mt-[34px] grid gap-3 font-sans text-sm leading-7 text-muted">
							{content.intro.map((paragraph) => (
								<p key={paragraph}>{paragraph}</p>
							))}
						</section>

						{/* Career arc */}
						<section className="mt-[34px]">
							<SectionPrompt command="cat career.log --since 2004" label={content.sections.arc} />
							<div className="mt-3 grid gap-2.5 border-l border-line2 pl-4">
								{content.timeline.map((item) => (
									<article
										key={item.year}
										className="grid items-baseline gap-x-4 gap-y-1 sm:grid-cols-[96px_minmax(0,1fr)]"
									>
										<p className="font-mono text-xs text-crt-amber">{item.year}</p>
										<div>
											<h3 className="font-sans text-[15px] font-semibold text-ink">{item.title}</h3>
											<p className="mt-1 font-sans text-[13px] leading-[22px] text-muted">
												{item.body}
											</p>
										</div>
									</article>
								))}
							</div>
						</section>

						{/* Now */}
						<section className="mt-[34px]">
							<SectionPrompt command="ls ~/now" label={content.sections.now} />
							<div className="mt-3 grid gap-3.5 sm:grid-cols-3">
								{content.now.map((item) => (
									<article
										key={item.title}
										className="rounded-lg border border-line2 bg-[#100e18] px-4 py-3.5"
									>
										<h3 className="font-sans text-sm font-semibold text-crt-amber">{item.title}</h3>
										<p className="mt-2 font-sans text-[13px] leading-[22px] text-muted">
											{item.body}
										</p>
									</article>
								))}
							</div>
						</section>

						<aside className="mt-[34px]">
							<SectionPrompt command="top --operating-surface" label={content.visualCaption} />
							<div className="mt-3 grid max-w-[520px] gap-2">
								{content.visualLayers.map((layer, index) => (
									<div
										key={layer}
										className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-x-3 gap-y-1 font-mono text-[11px] text-faint sm:grid-cols-[170px_minmax(0,1fr)_44px]"
									>
										<span className="col-span-2 sm:col-span-1">{layer}</span>
										<div className="h-2 border border-line2 bg-[#0a0910]" aria-hidden="true">
											<div
												className="h-full bg-crt-amber/80"
												style={{ width: `${surfaceLevels[index]}%` }}
											/>
										</div>
										<span>{surfaceLevels[index]}%</span>
									</div>
								))}
							</div>
						</aside>

						{/* Systems */}
						<section className="mt-[34px]">
							<SectionPrompt command="ls ~/systems" label={content.sections.systems} />
							<div className="mt-3 grid gap-4">
								{content.systems.map((system) => {
									const cardContent = (
										<>
											<img
												src={system.image}
												alt={system.alt}
												loading="lazy"
												className="aspect-video w-full rounded object-cover sm:w-36"
											/>
											<div>
												<p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
													{system.kicker}
												</p>
												<h3 className="mt-1 font-sans text-[15px] font-semibold group-hover:text-crt-amber">
													{system.title}
												</h3>
												<p className="mt-1 font-sans text-[13px] leading-[22px] text-muted">
													{system.body}
												</p>
											</div>
										</>
									);
									const cardClass =
										'focus-terminal group grid gap-4 border-b border-line2 pb-4 text-ink no-underline sm:grid-cols-[144px_minmax(0,1fr)]';

									return isExternal(system.href) ? (
										<a
											key={system.title}
											href={system.href}
											target="_blank"
											rel="noopener noreferrer"
											className={cardClass}
										>
											{cardContent}
										</a>
									) : (
										<AppLink key={system.title} href={system.href} className={cardClass}>
											{cardContent}
										</AppLink>
									);
								})}
							</div>
						</section>

						{/* Principles */}
						<section className="mt-[34px]">
							<SectionPrompt command="cat principles.txt" label={content.sections.principles} />
							<div className="mt-3 grid gap-3 border-l border-line2 pl-4">
								{content.principles.map((principle) => (
									<article key={principle.title}>
										<h3 className="font-sans text-[15px] font-semibold text-ink">
											{principle.title}
										</h3>
										<p className="mt-1 font-sans text-[13px] leading-[22px] text-muted">
											{principle.body}
										</p>
									</article>
								))}
							</div>
						</section>

						{/* Learning */}
						<section className="mt-[34px]">
							<SectionPrompt command="cat learning.txt" label={content.sections.learning} />
							<div className="mt-3 border-l border-line2 pl-4">
								<p className="font-mono text-[10px] uppercase tracking-[0.14em] text-crt-amber">
									{content.learning.kicker}
								</p>
								<h3 className="mt-1 font-sans text-[15px] font-semibold text-ink">
									{content.learning.title}
								</h3>
								<p className="mt-1 font-sans text-[13px] leading-[22px] text-muted">
									{content.learning.body}
								</p>
								<ul className="mt-3 grid list-disc gap-1 pl-4 font-sans text-[13px] leading-[22px] text-muted marker:text-crt-amber">
									{content.learning.items.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
							</div>
						</section>

						<footer className="mt-[26px] flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line2 pt-3 font-mono text-xs">
							{content.links.map((link) => {
								const linkClass = 'focus-terminal text-crt-green no-underline hover:text-crt-amber';

								if (link.href.startsWith('mailto:')) {
									return (
										<a key={link.href} href={link.href} className={linkClass}>
											{link.label}
										</a>
									);
								}

								const external = link.external ?? isExternal(link.href);

								return external ? (
									<a
										key={link.href}
										href={link.href}
										target="_blank"
										rel="noopener noreferrer"
										className={linkClass}
									>
										{link.label}
									</a>
								) : (
									<AppLink key={link.href} href={link.href} className={linkClass}>
										{link.label}
									</AppLink>
								);
							})}
							<span className="ml-auto flex items-center gap-2 text-crt-green" aria-hidden="true">
								$
								<span className="cursor-block [--accent:var(--crt-amber)] [--accent-strong:var(--crt-amber)]" />
							</span>
						</footer>
					</div>
				</div>
			</div>
		</main>
	);
}

export default AboutPage;
