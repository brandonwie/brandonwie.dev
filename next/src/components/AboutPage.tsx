import { AppLink } from '@/components/AppLink';
import { aboutCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { getAboutContent } from '../../../src/lib/data/about';

export interface AboutPageProps {
	locale?: Locale;
}

const toneClass = {
	accent: 'text-accent',
	foam: 'text-foam',
	gold: 'text-gold',
	rose: 'text-rose',
} as const;

function isExternal(href: string): boolean {
	return href.startsWith('http');
}

function SecHead({ label }: { label: string }) {
	return (
		<div className="mb-6 flex items-center gap-3.5">
			<span className="font-mono font-bold text-foam">#</span>
			<h2 className="font-sans text-xl font-semibold tracking-tight text-ink">{label}</h2>
			<span className="h-px flex-1 bg-line2" />
		</div>
	);
}

export function AboutPage({ locale = 'en' }: AboutPageProps) {
	const content = getAboutContent(locale);
	const copy = aboutCopy(locale);
	const homeHref = locale === 'ko' ? '/ko' : '/';

	return (
		<main id="main-content" className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
			{/* Hero */}
			<section className="grid gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] lg:items-end">
				<div>
					<div className="mb-5 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.12em] text-faint">
						<AppLink
							href={homeHref}
							aria-label={copy.backToHome}
							className="transition-colors hover:text-foam"
						>
							~
						</AppLink>
						<span className="text-line2">/</span>
						<span>{copy.navAbout}</span>
					</div>
					<p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-faint">
						{content.eyebrow}
					</p>
					<h1 className="mt-4 max-w-4xl font-sans text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl lg:text-6xl">
						{content.title}
					</h1>
					<p className="mt-6 max-w-2xl font-sans text-lg leading-8 text-muted">
						{content.subtitle}
					</p>
					<div className="mt-8 flex flex-wrap gap-3">
						{content.links.map((link) => {
							const external =
								link.external ?? isExternal(link.href) ?? link.href.startsWith('mailto:');
							const linkClass =
								'rounded-lg border border-line2 px-4 py-2.5 font-mono text-sm text-ink no-underline transition-colors hover:border-foam hover:text-foam';

							return external ? (
								<a
									key={link.href}
									href={link.href}
									target={link.external ? '_blank' : undefined}
									rel={link.external ? 'noopener noreferrer' : undefined}
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
					</div>
				</div>

				<aside className="rounded-xl border border-line2 bg-surface p-5">
					<div className="flex items-center justify-between gap-4 border-b border-line pb-3">
						<p className="font-mono text-xs uppercase tracking-[0.14em] text-faint">
							{content.visualCaption}
						</p>
						<span className="font-mono text-xs text-foam">live</span>
					</div>
					<div className="mt-5 grid gap-3">
						{content.visualLayers.map((layer, index) => (
							<div key={layer} className="grid grid-cols-[2.5rem_1fr] items-center gap-3">
								<span className="font-mono text-xs text-faint">0{index + 1}</span>
								<div className="h-2 overflow-hidden rounded-sm border border-line bg-highlight-low">
									<div
										className="h-full bg-foam"
										style={{ width: `${Math.min(42 + index * 12, 92)}%` }}
									/>
								</div>
								<span className="col-start-2 font-sans text-sm text-muted">{layer}</span>
							</div>
						))}
					</div>
					<div className="mt-6 grid grid-cols-2 gap-3">
						{content.metrics.map((metric) => (
							<div key={metric.label} className="rounded-lg border border-line2 bg-bg p-3">
								<div className={`font-sans text-xl font-bold ${toneClass[metric.tone]}`}>
									{metric.value}
								</div>
								<div className="mt-1 text-xs leading-relaxed text-faint">{metric.label}</div>
							</div>
						))}
					</div>
				</aside>
			</section>

			{/* Intro */}
			<section className="mt-14 grid gap-5 font-sans text-base leading-8 text-muted lg:grid-cols-2">
				{content.intro.map((paragraph) => (
					<p key={paragraph}>{paragraph}</p>
				))}
			</section>

			{/* Career arc */}
			<section className="mt-16">
				<SecHead label={content.sections.arc} />
				<div className="grid gap-4 lg:grid-cols-4">
					{content.timeline.map((item) => (
						<article
							key={item.year}
							className="rounded-lg border border-line2 bg-surface p-5 transition-colors hover:border-foam"
						>
							<p className="font-mono text-xs text-foam">{item.year}</p>
							<h3 className="mt-3 font-sans text-base font-semibold text-ink">{item.title}</h3>
							<p className="mt-3 font-sans text-sm leading-7 text-muted">{item.body}</p>
						</article>
					))}
				</div>
			</section>

			{/* Now */}
			<section className="mt-16 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
				<div>
					<SecHead label={content.sections.now} />
					<p className="max-w-sm font-sans text-sm leading-7 text-muted">{copy.nowLead}</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-3">
					{content.now.map((item) => (
						<article
							key={item.title}
							className="rounded-lg border border-line2 bg-surface p-5 transition-colors hover:border-foam"
						>
							<h3 className="font-sans text-base font-semibold text-ink">{item.title}</h3>
							<p className="mt-3 font-sans text-sm leading-7 text-muted">{item.body}</p>
						</article>
					))}
				</div>
			</section>

			{/* Systems */}
			<section className="mt-16">
				<SecHead label={content.sections.systems} />
				<div className="grid gap-4 lg:grid-cols-3">
					{content.systems.map((system) => {
						const external = isExternal(system.href);
						const cardContent = (
							<>
								<img
									src={system.image}
									alt={system.alt}
									className="aspect-[16/9] w-full object-cover"
								/>
								<div className="p-5">
									<p className="font-mono text-xs uppercase tracking-[0.14em] text-faint">
										{system.kicker}
									</p>
									<h3 className="mt-2 font-sans text-lg font-semibold transition-colors group-hover:text-foam">
										{system.title}
									</h3>
									<p className="mt-3 font-sans text-sm leading-7 text-muted">{system.body}</p>
								</div>
							</>
						);
						const cardClass =
							'group block overflow-hidden rounded-lg border border-line2 bg-surface text-ink no-underline transition-colors hover:border-foam';

						return external ? (
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

			{/* Principles + Learning */}
			<section className="mt-16 grid gap-6 lg:grid-cols-[1fr_1fr]">
				<div>
					<SecHead label={content.sections.principles} />
					<div className="grid gap-4">
						{content.principles.map((principle) => (
							<article
								key={principle.title}
								className="rounded-r-lg border-l-2 border-foam bg-surface px-5 py-4"
							>
								<h3 className="font-sans text-base font-semibold text-ink">{principle.title}</h3>
								<p className="mt-2 font-sans text-sm leading-7 text-muted">{principle.body}</p>
							</article>
						))}
					</div>
				</div>

				<div className="rounded-xl border border-line2 bg-surface p-6">
					<p className="font-mono text-xs uppercase tracking-[0.14em] text-gold">
						{content.learning.kicker}
					</p>
					<h2 className="mt-3 font-sans text-2xl font-semibold leading-snug text-ink">
						{content.learning.title}
					</h2>
					<p className="mt-4 font-sans text-sm leading-7 text-muted">{content.learning.body}</p>
					<ul className="mt-5 grid gap-3">
						{content.learning.items.map((item) => (
							<li key={item} className="flex gap-3 font-sans text-sm leading-7 text-muted">
								<span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foam" />
								<span>{item}</span>
							</li>
						))}
					</ul>
				</div>
			</section>
		</main>
	);
}

export default AboutPage;
