import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';

import { AppLink } from '@/components/AppLink';
import { aboutCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { TermPrompt } from '@/shell/TermPrompt';
import { cwdFor } from '@/shell/terminal-path';
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

/**
 * `[██████████░░░░]` — the level drawn in block characters, the way `top`
 * would. Two widths: 50 cells (2% each) from `sm`, 25 cells (4% each) below,
 * where 50 cells cannot fit the pane. Decorative; the percentage beside it is
 * the text.
 */
function BlockMeter({ level }: { level: number }) {
	const bar = (cells: number) => {
		const on = Math.round((level / 100) * cells);
		return (
			<>
				{'█'.repeat(on)}
				<span className="off">{'░'.repeat(cells - on)}</span>
			</>
		);
	};
	return (
		<span className="ab-meter term-meter" aria-hidden="true">
			<span className="off">[</span>
			<span className="ab-meter__wide">{bar(50)}</span>
			<span className="ab-meter__narrow">{bar(25)}</span>
			<span className="off">]</span>
		</span>
	);
}

/** A link to a site route or out of it, with the external-tab rules kept. */
function AnyLink({
	href,
	external,
	className,
	children,
}: {
	href: string;
	external?: boolean;
	className: string;
	children: ReactNode;
}) {
	if (href.startsWith('mailto:')) {
		return (
			<a href={href} className={className}>
				{children}
			</a>
		);
	}
	return (external ?? isExternal(href)) ? (
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
 * AboutPage — `/about` as a session in the shared terminal shell: `whoami
 * --long` (portrait, h1, metrics), the intro, then `cat career.log`,
 * `ls ~/now`, `top --operating-surface`, `ls ~/systems`, `cat principles.txt`,
 * `cat learning.txt` and `links`. The shell owns the enclosure, title bar,
 * `<main id="main-content">`, idle prompt and status line, so the page's old
 * embedded chrome (crt-panel / crt-glass-inner / crt-film, its own title bar,
 * cursor and `<main>`) is gone.
 *
 * Every string is the page's existing copy (`getAboutContent`, `aboutCopy`).
 * Section headings keep their labels as `h2` text for assistive tech; the file
 * names drawn in frame titles and prompts are terminal syntax and stay English
 * in both locales. The v2 design's MOTD (`Last login: …`) is not ported: it
 * would be new copy with an invented timestamp.
 */
export function AboutPage({ locale = 'en' }: AboutPageProps) {
	const content = getAboutContent(locale);
	const copy = aboutCopy(locale);
	const cwd = cwdFor(locale === 'ko' ? '/ko/about' : '/about');
	// `loading profile ......... ok`: the trailing status word reads green.
	const loading = /^(.*?)(\s*ok)$/.exec(copy.terminalLoading);

	return (
		<div className="pg-about">
			<TermPrompt cwd={cwd} command="whoami" flags="--long" />
			<div className="ab-status">
				<p className="ab-out">
					{loading ? (
						<>
							{loading[1]}
							<span className="text-crt-green">{loading[2]}</span>
						</>
					) : (
						copy.terminalLoading
					)}
				</p>
				<p className="ab-signal">{copy.terminalSignal}</p>
			</div>

			<section className="ab-hero">
				<figure className="ab-portrait">
					<pre role="img" aria-label={copy.portraitCaption} className="term-worn">
						{portrait}
					</pre>
					<figcaption>{copy.portraitCaption}</figcaption>
				</figure>
				<div className="min-w-0">
					<p className="term-eyebrow">{content.eyebrow}</p>
					<h1 className="term-ttl term-worn">{content.title}</h1>
					<p className="ab-lede">{content.subtitle}</p>
					<dl className="ab-kv">
						{content.metrics.map((metric) => (
							<div key={metric.label}>
								<dt>{metric.label}</dt>
								<dd>{metric.value}</dd>
							</div>
						))}
					</dl>
				</div>
			</section>

			<section className="ab-intro">
				{content.intro.map((paragraph) => (
					<p key={paragraph}>{paragraph}</p>
				))}
			</section>

			<section className="ab-sec">
				<TermPrompt cwd={cwd} command="cat career.log" flags="--since 2004" />
				<div className="term-frame">
					<h2 className="term-frame__title">
						<span aria-hidden="true">career.log</span>
						<span className="sr-only">{content.sections.arc}</span>
						<span className="dim" aria-hidden="true">
							{' '}
							· {content.timeline.length} entries
						</span>
					</h2>
					<ol className="ab-log">
						{content.timeline.map((item) => (
							<li key={item.year}>
								<span className="ab-log__yr">[{item.year}]</span>
								<div className="min-w-0">
									<h3>{item.title}</h3>
									<p>{item.body}</p>
								</div>
							</li>
						))}
					</ol>
				</div>
			</section>

			<section className="ab-sec">
				<TermPrompt cwd={cwd} command="ls ~/now" />
				<h2 className="sr-only">{content.sections.now}</h2>
				<div className="ab-now">
					{content.now.map((item) => (
						<article key={item.title} className="term-frame">
							<h3>{item.title}</h3>
							<p>{item.body}</p>
						</article>
					))}
				</div>
			</section>

			<section className="ab-sec">
				<TermPrompt cwd={cwd} command="top" flags="--operating-surface" />
				<div className="term-frame">
					<h2 className="term-frame__title">
						{content.visualCaption}
						<span className="dim" aria-hidden="true">
							{' '}
							· {content.visualLayers.length} procs
						</span>
					</h2>
					<ul className="ab-top">
						{content.visualLayers.map((layer, index) => (
							<li key={layer}>
								<span className="ab-top__name">{layer}</span>
								<BlockMeter level={surfaceLevels[index]} />
								<span className="ab-top__pct">{surfaceLevels[index]}%</span>
							</li>
						))}
					</ul>
				</div>
			</section>

			<section className="ab-sec">
				<TermPrompt cwd={cwd} command="ls ~/systems" />
				<div className="term-frame">
					<h2 className="term-frame__title">{content.sections.systems}</h2>
					<ul className="ab-sys">
						{content.systems.map((system, index) => (
							<li key={system.title}>
								<AnyLink href={system.href} className="ab-sys__card">
									<img src={system.image} alt={system.alt} loading="lazy" />
									<span className="min-w-0">
										<span className="ab-sys__kick">
											<span className="ab-n" aria-hidden="true">
												[{index + 1}]
											</span>
											{system.kicker}
										</span>
										<h3>{system.title}</h3>
										<span className="ab-sys__body">{system.body}</span>
									</span>
								</AnyLink>
							</li>
						))}
					</ul>
				</div>
			</section>

			<section className="ab-sec">
				<TermPrompt cwd={cwd} command="cat principles.txt" />
				<div className="term-frame">
					<h2 className="term-frame__title">{content.sections.principles}</h2>
					<div className="ab-list">
						{content.principles.map((principle) => (
							<article key={principle.title}>
								<h3>{principle.title}</h3>
								<p>{principle.body}</p>
							</article>
						))}
					</div>
				</div>
			</section>

			<section className="ab-sec">
				<TermPrompt cwd={cwd} command="cat learning.txt" />
				<div className="term-frame">
					<h2 className="term-frame__title">{content.sections.learning}</h2>
					<p className="ab-kick">{content.learning.kicker}</p>
					<h3 className="ab-learn__h">{content.learning.title}</h3>
					<p className="ab-learn__body">{content.learning.body}</p>
					<ul className="ab-learn__items">
						{content.learning.items.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</div>
			</section>

			<section className="ab-sec">
				<TermPrompt cwd={cwd} command="links" />
				<ul className="ab-links">
					{content.links.map((link, index) => (
						<li key={link.href}>
							<AnyLink href={link.href} external={link.external} className="term-lnk">
								<span className="n" aria-hidden="true">
									[{index + 1}]
								</span>
								{link.label}
							</AnyLink>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}

export default AboutPage;
