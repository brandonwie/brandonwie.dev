import { AppLink } from '@/components/AppLink';
import type { Locale } from '@/i18n/locale';
import { getAboutContent } from '../../../src/lib/data/about';

/**
 * `/about`: who writes this site, in text only. It also holds what the former
 * Projects and Contact pages held, as the `#projects` and `#contact` sections;
 * `public/_redirects` sends the old addresses there.
 */
export function AboutPage({ locale }: { locale: Locale }) {
	const content = getAboutContent(locale);

	return (
		<div className="about">
			<header className="about__head">
				<p className="eyebrow">{content.eyebrow}</p>
				<h1>{content.title}</h1>
				<p className="about__lede">{content.subtitle}</p>
			</header>

			<div className="prose">
				{content.intro.map((paragraph) => (
					<p key={paragraph}>{paragraph}</p>
				))}
			</div>

			<dl className="about__facts">
				{content.metrics.map((metric) => (
					<div key={metric.label}>
						<dt>{metric.label}</dt>
						<dd>{metric.value}</dd>
					</div>
				))}
			</dl>

			<section aria-labelledby="career">
				<h2 id="career">{content.sections.arc}</h2>
				<ol className="about__rows">
					{content.timeline.map((item) => (
						<li key={item.year}>
							<span className="about__when">{item.year}</span>
							<div>
								<h3>{item.title}</h3>
								<p>{item.body}</p>
							</div>
						</li>
					))}
				</ol>
			</section>

			<section aria-labelledby="now">
				<h2 id="now">{content.sections.now}</h2>
				<ul className="about__items">
					{content.now.map((item) => (
						<li key={item.title}>
							<h3>{item.title}</h3>
							<p>{item.body}</p>
						</li>
					))}
				</ul>
			</section>

			<section aria-labelledby="projects">
				<h2 id="projects">{content.sections.systems}</h2>
				<p className="about__note">{content.systemsIntro}</p>
				<ul className="about__rows">
					{content.systems.map((system) => (
						<li key={system.title}>
							<span className="about__when">{system.kicker}</span>
							<div>
								<h3>
									{system.href.startsWith('http') ? (
										<a
											className="text-link"
											href={system.href}
											target="_blank"
											rel="noopener noreferrer"
										>
											{system.title}
										</a>
									) : (
										<AppLink className="text-link" href={system.href}>
											{system.title}
										</AppLink>
									)}
								</h3>
								<p>{system.body}</p>
							</div>
						</li>
					))}
				</ul>
			</section>

			<section aria-labelledby="principles">
				<h2 id="principles">{content.sections.principles}</h2>
				<ul className="about__items">
					{content.principles.map((principle) => (
						<li key={principle.title}>
							<h3>{principle.title}</h3>
							<p>{principle.body}</p>
						</li>
					))}
				</ul>
			</section>

			<section aria-labelledby="learning">
				<h2 id="learning">{content.sections.learning}</h2>
				<p className="eyebrow">{content.learning.kicker}</p>
				<h3 className="about__claim">{content.learning.title}</h3>
				<p className="about__note">{content.learning.body}</p>
				<ul className="about__list">
					{content.learning.items.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
			</section>

			<section aria-labelledby="contact">
				<h2 id="contact">{content.sections.contact}</h2>
				<p className="about__note">{content.contactIntro}</p>
				<ul className="about__contact">
					{content.links.map((link) => (
						<li key={link.href}>
							<span className="about__when">{link.label}</span>
							{link.href.startsWith('mailto:') ? (
								<a className="text-link" href={link.href}>
									{link.href.slice('mailto:'.length)}
								</a>
							) : (
								<a className="text-link" href={link.href} target="_blank" rel="noopener noreferrer">
									{link.href.replace('https://', '')}
								</a>
							)}
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
