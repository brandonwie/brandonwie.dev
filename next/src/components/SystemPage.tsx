import { AppLink } from '@/components/AppLink';
import { systemCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';

export interface SystemPageProps {
	locale?: Locale;
}

export function SystemPage({ locale = 'en' }: SystemPageProps) {
	const copy = systemCopy(locale);
	const hubHref = locale === 'ko' ? '/ko/system/3b' : '/system/3b';

	return (
		<main
			id="main-content"
			className="min-h-screen bg-terminal-bg-primary text-terminal-text-primary"
		>
			<section className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-16 sm:px-6">
				<p className="mb-3 text-xs uppercase text-terminal-text-dim">{copy.subtitle}</p>
				<h1 className="mb-4 text-2xl font-semibold text-terminal-accent-orange">{copy.title}</h1>
				<p className="mb-8 max-w-xl text-sm leading-6 text-terminal-text-muted">
					{copy.indexIntro}
				</p>
				<AppLink
					href={hubHref}
					className="text-sm font-semibold text-terminal-text-primary no-underline transition-colors hover:text-terminal-accent-orange"
				>
					{copy.openHub} →
				</AppLink>
			</section>
		</main>
	);
}

export default SystemPage;
