'use client';

import { AppLink } from '@/components/AppLink';
import StudyPageShell from './StudyPageShell';
import { getStudyIndexContent, type StudyLocale } from '../../data/study';

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
 * StudyIndexPage — the `/study` course catalog.
 *
 * Port of `src/lib/components/study/StudyIndexPage.svelte`. Owns its
 * `SecHead` like the Svelte original owns its snippet; course cards link
 * through `AppLink` since every `href` in the index copy is an intra-site
 * study route.
 */
export default function StudyIndexPage({ locale = 'en' }: { locale?: StudyLocale }) {
	const content = getStudyIndexContent(locale);
	const basePath = locale === 'ko' ? '/ko' : '';

	return (
		<StudyPageShell>
			<div className="mb-8 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.12em] text-faint">
				<AppLink href={basePath || '/'} className="transition-colors hover:text-foam">
					~
				</AppLink>
				<span className="text-line2">/</span>
				<span>study</span>
			</div>

			<section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
				<div>
					<p className="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
						{content.eyebrow}
					</p>
					<h1 className="mt-4 max-w-4xl font-sans text-3xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
						{content.title}
					</h1>
					<p className="mt-6 max-w-2xl font-sans text-lg leading-8 text-muted">
						{content.subtitle}
					</p>
				</div>
				<aside className="study-card p-5">
					<p className="font-mono text-xs uppercase tracking-wider text-faint">
						{content.sections.approach}
					</p>
					<h2 className="mt-3 font-sans text-xl font-semibold text-ink">
						{content.approach.title}
					</h2>
					<p className="mt-3 text-sm leading-7 text-muted">{content.approach.body}</p>
				</aside>
			</section>

			<section className="mt-16">
				<SecHead label={content.sections.courses} />
				<div className="mt-5 grid gap-4 lg:grid-cols-2">
					{content.courses.map((course) => (
						<AppLink
							key={course.slug}
							href={course.href}
							className="group block study-card p-6 text-ink no-underline transition-colors hover:border-foam"
						>
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<p className="font-mono text-xs uppercase tracking-wider text-foam">
										{course.status}
									</p>
									<h3 className="mt-3 font-sans text-2xl font-semibold transition-colors group-hover:text-foam">
										{course.title}
									</h3>
								</div>
								<span className="font-mono text-xs text-faint">{course.updated}</span>
							</div>
							<p className="mt-4 max-w-2xl text-sm leading-7 text-muted">{course.summary}</p>
							<div className="mt-5 flex flex-wrap gap-2">
								{course.learned.map((item) => (
									<span
										key={item}
										className="border border-line bg-bg px-2 py-1 font-mono text-[11px] text-faint"
									>
										{item}
									</span>
								))}
							</div>
							<div className="mt-6 grid gap-3 sm:grid-cols-2">
								{course.modules.map((module) => (
									<div
										key={module}
										className="border-l border-foam bg-bg px-3 py-2 text-sm text-muted"
									>
										{module}
									</div>
								))}
							</div>
							<p className="mt-5 font-mono text-xs text-faint">{course.meta}</p>
						</AppLink>
					))}
				</div>
			</section>

			<section className="mt-16 study-card p-6">
				<ul className="grid gap-3 md:grid-cols-3">
					{content.approach.items.map((item) => (
						<li key={item} className="text-sm leading-7 text-muted">
							<span className="mr-2 font-mono text-foam">/</span>
							{item}
						</li>
					))}
				</ul>
			</section>
		</StudyPageShell>
	);
}
