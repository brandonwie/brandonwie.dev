import { AppLink } from '@/components/AppLink';
import { base } from '@/data/nav';
import { systemCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';

export interface SystemPageProps {
	locale?: Locale;
}

/**
 * /system landing page: the title and intro, then one row linking to its only
 * child route (the B3 hub) with that hub's description.
 *
 * The shell owns `<main id="main-content">`, so this renders a plain wrapper.
 */
export function SystemPage({ locale = 'en' }: SystemPageProps) {
	const copy = systemCopy(locale);
	const hubHref = `${base(locale)}/system/b3`;

	return (
		<div className="system">
			<header className="system__head">
				<p className="eyebrow">{copy.subtitle}</p>
				<h1>{copy.title}</h1>
				<p className="system__lede">{copy.indexIntro}</p>
			</header>

			<ul className="system__list">
				<li>
					<AppLink href={hubHref} className="system__row" data-row>
						<span className="system__name">
							{copy.openHub} <span aria-hidden="true">→</span>
						</span>
						<span className="system__desc">{copy.pageDescription}</span>
					</AppLink>
				</li>
			</ul>
		</div>
	);
}

export default SystemPage;
