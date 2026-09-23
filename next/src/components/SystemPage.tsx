import { AppLink } from '@/components/AppLink';
import { base } from '@/data/nav';
import { systemCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { TermPrompt } from '@/shell/TermPrompt';
import { cwdFor } from '@/shell/terminal-path';

export interface SystemPageProps {
	locale?: Locale;
}

/**
 * /system landing page as a terminal session: `cat index` prints the eyebrow,
 * title and intro, `ls -l` lists the one child route (the 3B hub), and
 * `cat 3b/.description` prints the existing meta description.
 *
 * The shell owns `<main id="main-content">`, so this renders a plain wrapper.
 * Prompt commands and the `ls -l` columns are terminal syntax and stay English
 * in both locales; every sentence comes from `systemCopy`.
 */
export function SystemPage({ locale = 'en' }: SystemPageProps) {
	const copy = systemCopy(locale);
	const root = `${base(locale)}/system`;
	const hubHref = `${root}/3b`;
	const cwd = cwdFor(root);

	return (
		<div className="pg-system">
			<TermPrompt cwd={cwd} command="cat index" flags={`--lang ${locale}`} />
			<div className="pg-system__intro">
				<p className="term-eyebrow">{copy.subtitle}</p>
				<div className="term-worn pg-system__ttl">
					<h1 className="term-ttl">{copy.title}</h1>
				</div>
				<p className="pg-system__lede">{copy.indexIntro}</p>
			</div>

			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="ls -l" />
			<div className="term-frame pg-system__ls">
				<span className="term-frame__title" aria-hidden="true">
					{cwd}/ <span className="dim">· 1 entry</span>
				</span>
				<p className="pg-system__total" aria-hidden="true">
					total 1
				</p>
				<div className="pg-system__row">
					<span className="pg-system__perm" aria-hidden="true">
						drwxr-xr-x
					</span>
					<span className="pg-system__own" aria-hidden="true">
						brandon
					</span>
					<span className="pg-system__name" aria-hidden="true">
						3b/
					</span>
					<AppLink href={hubHref} className="term-lnk pg-system__cta">
						<span className="n" aria-hidden="true">
							[1]
						</span>
						{copy.openHub}{' '}
						<span className="pg-system__arr" aria-hidden="true">
							→
						</span>
					</AppLink>
				</div>
			</div>

			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="cat 3b/.description" />
			<p className="pg-system__desc">{copy.pageDescription}</p>
		</div>
	);
}

export default SystemPage;
