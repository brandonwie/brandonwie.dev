import type { Metadata } from 'next';

import System3bGraph from '../components/System3bGraph';
import snapshot from '../data/system-snapshot';
import * as m from '../paraglide/messages.js';
import type { Locale } from '../i18n/locale';
import { absoluteUrl } from '../../../src/lib/seo';

/**
 * The /system/3b page, at the graph altitude only.
 *
 * SCOPE. This is a PARTIAL port and says so. The Svelte System3bPage also
 * carries stats, a subsystems table, an evolution section and a blog-series
 * list; those are Slice 4 cohort work, so the parity comparator will report
 * field differences on this route until Slice 4 closes them. That is expected
 * progress, not a regression, and is deliberately NOT ledgered — a ledger entry
 * would approve a difference that is supposed to disappear.
 *
 * KO is also out of scope here: behavior-matrix.md assigns /ko/system and
 * /ko/system/3b to Slice 4, so C11 closes on the EN route alone.
 */
export function generateSystem3bMetadata(locale: Locale): Metadata {
	const path = locale === 'ko' ? '/ko/system/3b' : '/system/3b';
	return {
		title: m.system_3b_title({}, { locale }),
		description: m.system_3b_meta_description({}, { locale }),
		alternates: { canonical: absoluteUrl(path) },
	};
}

export function System3bPage({ locale }: { locale: Locale }) {
	return (
		<div className="page-frame">
			<h1>{m.system_3b_title({}, { locale })}</h1>
			<p className="lede">{m.system_3b_subtitle({}, { locale })}</p>
			<System3bGraph
				nodes={snapshot.nodes}
				edges={snapshot.edges}
				layers={snapshot.layers}
				locale={locale}
			/>
		</div>
	);
}
