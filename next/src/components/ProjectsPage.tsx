import type { ReactNode } from 'react';

import { AppLink } from '@/components/AppLink';
import { base } from '@/data/nav';
import { projectsCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { TermPrompt } from '@/shell/TermPrompt';
import { cwdFor } from '@/shell/terminal-path';
import { getAboutContent } from '../../../src/lib/data/about';

export interface ProjectsPageProps {
	locale?: Locale;
}

function isExternal(href: string): boolean {
	return href.startsWith('http');
}

/** One link to a system: internal via AppLink, external in a new tab. */
function SystemLink({
	href,
	className,
	children,
}: {
	href: string;
	className: string;
	children: ReactNode;
}) {
	return isExternal(href) ? (
		<a href={href} target="_blank" rel="noopener noreferrer" className={className}>
			{children}
		</a>
	) : (
		<AppLink href={href} className={className}>
			{children}
		</AppLink>
	);
}

/**
 * ProjectsPage — `/projects` and `/ko/projects` in the Phosphor Fade shell.
 *
 * `cd ~/projects && cat .about` (crumb, eyebrow, h1, intro), then the same
 * three systems twice: an `ls -l --index` table and `cat *\/README` frames.
 * Rows and frames are separate links to the same target, so nothing nests.
 * Data stays `getAboutContent(locale).systems` (shared with /about); the
 * thumbnail keeps the real OG image and its alt inside a bordered, worn box.
 */
export function ProjectsPage({ locale = 'en' }: ProjectsPageProps) {
	const content = getAboutContent(locale);
	const copy = projectsCopy(locale);
	const cwd = cwdFor(`${base(locale)}/projects`);
	const systems = content.systems.map((system, index) => ({
		...system,
		n: index + 1,
		name: `${system.title.toLowerCase()}/`,
		external: isExternal(system.href),
	}));

	return (
		<div className="pg-projects">
			<TermPrompt cwd={cwd} command="cd ~/projects && cat .about" />
			<p className="pg-projects__crumb">
				<AppLink href={base(locale) || '/'}>~</AppLink>
				<span className="pg-projects__sep" aria-hidden="true">
					/
				</span>
				projects
			</p>
			<div className="pg-projects__hero">
				<p className="term-eyebrow text-crt-green">{copy.eyebrow}</p>
				<div className="term-worn pg-projects__h1">
					<h1 className="term-ttl">{copy.title}</h1>
				</div>
				<p className="pg-projects__intro">{copy.intro}</p>
			</div>

			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="ls -l" flags="--index" />
			<div className="pg-projects__ls">
				<p className="text-crt-faint" aria-hidden="true">
					total {systems.length}
				</p>
				<div className="pg-projects__lshead" aria-hidden="true">
					<span />
					<span>type</span>
					<span>name</span>
					<span>kicker</span>
					<span>target</span>
				</div>
				{systems.map((system) => (
					<SystemLink key={system.name} href={system.href} className="pg-projects__lsrow">
						<span className="pg-projects__n" aria-hidden="true">
							[{system.n}]
						</span>
						<span className="pg-projects__ty">{system.external ? 'ext' : 'int'}</span>
						<span className="pg-projects__nm">{system.name}</span>
						<span className="pg-projects__kk">{system.kicker}</span>
						<span className="pg-projects__tg">
							→ {system.href}
							{system.external ? <span className="text-crt-faint"> ↗</span> : null}
						</span>
					</SystemLink>
				))}
			</div>

			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="cat */README" flags="--with-preview" />
			{systems.map((system) => (
				<SystemLink key={system.name} href={system.href} className="term-frame pg-projects__card">
					<span className="term-frame__title">
						[{system.n}] {system.name}{' '}
						<span className="dim">· {system.external ? 'ext ↗' : 'int'}</span>
					</span>
					<span className="pg-projects__grid">
						<span className="term-worn pg-projects__thumb">
							<img src={system.image} alt={system.alt} width="1200" height="630" loading="lazy" />
						</span>
						<span className="pg-projects__info">
							<span className="term-eyebrow pg-projects__kicker">{system.kicker}</span>
							<h2 className="term-sub pg-projects__title">{system.title}</h2>
							<span className="pg-projects__bd">{system.body}</span>
							<span className="pg-projects__go">
								<span className="text-crt-faint">open</span> {system.href}
								{system.external ? <span className="text-crt-faint"> ↗</span> : null}
							</span>
							<span className="pg-projects__src" aria-hidden="true">
								img: {system.image}
							</span>
						</span>
					</span>
				</SystemLink>
			))}
		</div>
	);
}

export default ProjectsPage;
