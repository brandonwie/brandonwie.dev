import { base } from '@/data/nav';
import { contactCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { TermPrompt } from '@/shell/TermPrompt';
import { cwdFor } from '@/shell/terminal-path';
import { getAboutContent, type AboutLink } from '../../../src/lib/data/about';

export interface ContactPageProps {
	locale?: Locale;
}

function isExternal(href: string): boolean {
	return href.startsWith('http');
}

function channelValue(href: string): string {
	if (href.startsWith('mailto:')) return href.slice('mailto:'.length);
	return href.replace(/^https?:\/\//, '');
}

/**
 * ContactPage — `/contact` and `/ko/contact` in the Phosphor Fade shell.
 *
 * `cat README` (eyebrow, h1, intro), then `ls -l channels/` as one frame whose
 * `<ul>` is named by the frame title. Each channel is one `<a>` row; the
 * terminal columns (caret, number, perms, scheme, arrow, kind) are
 * `aria-hidden`, and the row's accessible name is `<label>: <value>`. External
 * rows keep `target="_blank" rel="noopener noreferrer"`; email stays a plain
 * `mailto:`. Data stays the about-page links with the existing filter.
 */
export function ContactPage({ locale = 'en' }: ContactPageProps) {
	const content = getAboutContent(locale);
	const copy = contactCopy(locale);
	const cwd = cwdFor(`${base(locale)}/contact`);

	const channels = content.links.filter(
		(l: AboutLink) => l.external || l.href.startsWith('mailto:'),
	);

	return (
		<div className="pg-contact">
			<TermPrompt cwd={cwd} command="cat README" />
			<section className="pg-contact__readme">
				<p className="term-eyebrow">{copy.eyebrow}</p>
				<div className="term-worn pg-contact__h1">
					<h1 className="term-ttl">{copy.title}</h1>
				</div>
				<p className="pg-contact__intro">{copy.intro}</p>
			</section>

			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="ls -l channels/" flags="--external --mailto" />
			<section className="term-frame" aria-labelledby="contact-channels">
				<h2 className="term-frame__title pg-contact__ft" id="contact-channels">
					{copy.channelsHeading}
					<span aria-hidden="true">
						/ <span className="dim">· {channels.length}</span>
					</span>
				</h2>
				<ul className="pg-contact__ls">
					<li className="pg-contact__total" aria-hidden="true">
						total {channels.length}
					</li>
					{channels.map((channel, index) => {
						const external = isExternal(channel.href);
						const value = channelValue(channel.href);
						return (
							<li key={channel.href}>
								<a
									className="pg-contact__row"
									href={channel.href}
									target={external ? '_blank' : undefined}
									rel={external ? 'noopener noreferrer' : undefined}
									aria-label={`${channel.label}: ${value}`}
								>
									<span className="pg-contact__car" aria-hidden="true">
										&gt;
									</span>
									<span className="pg-contact__n" aria-hidden="true">
										[{index + 1}]
									</span>
									<span className="pg-contact__perm" aria-hidden="true">
										lrwxr-xr-x
									</span>
									<span className="pg-contact__sch" aria-hidden="true">
										{external ? 'https' : 'mailto'}
									</span>
									<span className="pg-contact__name">{channel.label.toLowerCase()}</span>
									<span className="pg-contact__arr" aria-hidden="true">
										-&gt;
									</span>
									<span className="pg-contact__val">{value}</span>
									<span className="pg-contact__kind" aria-hidden="true">
										{external ? 'new-tab' : 'compose'}
									</span>
								</a>
							</li>
						);
					})}
				</ul>
			</section>
		</div>
	);
}

export default ContactPage;
