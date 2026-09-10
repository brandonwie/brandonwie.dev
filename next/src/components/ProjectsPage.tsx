import { AppLink } from '@/components/AppLink';
import { projectsCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { getAboutContent } from '../../../src/lib/data/about';

export interface ProjectsPageProps {
	locale?: Locale;
}

function isExternal(href: string): boolean {
	return href.startsWith('http');
}

export function ProjectsPage({ locale = 'en' }: ProjectsPageProps) {
	const content = getAboutContent(locale);
	const copy = projectsCopy(locale);
	const basePath = locale === 'ko' ? '/ko' : '';

	return (
		<main id="main-content" className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
			{/* Header */}
			<section className="max-w-3xl">
				<div className="mb-5 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.12em] text-faint">
					<AppLink href={basePath || '/'} className="transition-colors hover:text-foam">
						~
					</AppLink>
					<span className="text-line2">/</span>
					<span>projects</span>
				</div>
				<p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-foam">
					{copy.eyebrow}
				</p>
				<h1 className="mt-4 font-sans text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
					{copy.title}
				</h1>
				<p className="mt-6 font-sans text-lg leading-8 text-muted">{copy.intro}</p>
			</section>

			{/* System cards (reused from about.ts systems[]) */}
			<section className="mt-12 grid gap-5 lg:grid-cols-3">
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
								<h2 className="mt-2 font-sans text-lg font-semibold transition-colors group-hover:text-foam">
									{system.title}
								</h2>
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
			</section>
		</main>
	);
}

export default ProjectsPage;
