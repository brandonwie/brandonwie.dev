import { AppLink } from '@/components/AppLink';
import { contactCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
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

export function ContactPage({ locale = 'en' }: ContactPageProps) {
	const content = getAboutContent(locale);
	const copy = contactCopy(locale);
	const basePath = locale === 'ko' ? '/ko' : '';

	const channels = content.links.filter(
		(l: AboutLink) => l.external || l.href.startsWith('mailto:'),
	);

	return (
		<main id="main-content" className="mx-auto max-w-3xl px-6 py-12 lg:py-16">
			{/* Header */}
			<section>
				<div className="mb-5 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.12em] text-faint">
					<AppLink href={basePath || '/'} className="transition-colors hover:text-foam">
						~
					</AppLink>
					<span className="text-line2">/</span>
					<span>contact</span>
				</div>
				<p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-foam">
					{copy.eyebrow}
				</p>
				<h1 className="mt-4 font-sans text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
					{copy.title}
				</h1>
				<p className="mt-6 font-sans text-lg leading-8 text-muted">{copy.intro}</p>
			</section>

			{/* Channels */}
			<section className="mt-12">
				<div className="mb-5 flex items-center gap-3.5">
					<span className="font-mono font-bold text-foam">#</span>
					<h2 className="font-sans text-xl font-semibold tracking-tight text-ink">
						{copy.channelsHeading}
					</h2>
					<span className="h-px flex-1 bg-line2" />
				</div>
				<ul className="grid gap-3">
					{channels.map((channel) => {
						const external = isExternal(channel.href);

						return (
							<li key={channel.href}>
								<a
									href={channel.href}
									target={external ? '_blank' : undefined}
									rel={external ? 'noopener noreferrer' : undefined}
									className="group flex items-center justify-between gap-4 rounded-lg border border-line2 bg-surface px-5 py-4 no-underline transition-colors hover:border-foam"
								>
									<span className="flex min-w-0 flex-col gap-1">
										<span className="font-mono text-xs uppercase tracking-[0.14em] text-faint">
											{channel.label}
										</span>
										<span className="truncate font-sans text-sm text-ink">
											{channelValue(channel.href)}
										</span>
									</span>
									<span
										className="font-mono text-faint transition-colors group-hover:text-foam"
										aria-hidden="true"
									>
										{external ? '↗' : '✉'}
									</span>
								</a>
							</li>
						);
					})}
				</ul>
			</section>
		</main>
	);
}

export default ContactPage;
