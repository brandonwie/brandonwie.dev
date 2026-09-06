import * as m from '../paraglide/messages.js';
import type { Locale } from './locale';

/**
 * Locale-resolved UI copy for the Next candidate.
 *
 * WHY EVERY CALL PASSES `{ locale }`. Paraglide messages resolve as
 * `experimentalStaticLocale ?? options.locale ?? getLocale()`. Under
 * `output: 'export'` there is no request context and no async local storage, so
 * `getLocale()` cannot know which locale a page is being rendered for — and the
 * compile runs with `--strategy baseLocale`, so it would answer `en` for every
 * page, silently rendering English inside the Korean route group. The route
 * groups already know their locale, so it is passed explicitly at every call
 * site and this module is the only place messages are read.
 *
 * EDITING A MESSAGE DURING `pnpm dev` REQUIRES A RESTART. The compile step runs
 * once per invocation and there is no watcher, so the dev server sees the
 * compiled output under `src/paraglide/` but never the `messages/*.json` it came
 * from. That is the cost of the CLI form the Step 1 spike proved; the Vite
 * plugin the Svelte side uses has no Next equivalent.
 *
 * SLICE_1_SCAFFOLDING is copy that exists only in this temporary shell and has
 * no message key on the Svelte side, because the Svelte site does not render
 * it: a placeholder comments panel, a breadcrumb label, a reading-time suffix.
 * Adding permanent catalogue keys for strings that Slice 3 deletes when it
 * ports the real shell would leave dead keys behind, so they stay here, named,
 * until the surface that owns them arrives.
 *
 * FOUR OF THOSE KEYS ARE NOW GONE. Slice 3 PR 2a ported the real header and
 * footer, so `brandLabel`, `article`, `footer` and `footerText` were deleted
 * rather than migrated: the header's brand label, the Slice 1 article link, and
 * the placeholder footer they described no longer exist. The chrome resolves
 * from the catalogue instead — every message the Svelte header, footer,
 * language toggle and nav reference already resolves in both `messages/en.json`
 * and `messages/ko.json`, so this cost no catalogue expansion. The remaining
 * scaffolding keys belong to the article and comments surfaces, which are still
 * ported by later PRs.
 */
const SLICE_1_SCAFFOLDING = {
	en: {
		breadcrumb: 'Breadcrumb',
		readingTime: 'min read',
		category: 'Category',
		switchLabel: 'Read this article in Korean',
		switchText: '한국어',
		commentsStatus: 'Comments will load here when the Giscus runtime is migrated.',
	},
	ko: {
		breadcrumb: '현재 위치',
		readingTime: '분 읽기',
		category: '카테고리',
		switchLabel: '이 글을 영어로 읽기',
		switchText: 'English',
		commentsStatus: 'Giscus 런타임을 마이그레이션하면 이곳에 댓글이 표시됩니다.',
	},
} as const;

/**
 * Locale-resolved copy for the global chrome: header, nav, footer and the
 * language toggle. One call site per message, each carrying `{ locale }` for
 * the reason this module's header gives.
 *
 * `nav` is keyed by `NavKey` so `@/data/nav` can stay pure path logic with no
 * message imports. The keys are static property references, not `m[key]`, so
 * every one resolves at build time — the same rule `graph-copy.ts` follows.
 */
export function shellCopy(locale: Locale) {
	return {
		skip: m.skip_to_content({}, { locale }),
		navigation: m.primary_navigation({}, { locale }),
		home: m.palette_nav_home({}, { locale }),
		search: m.search_title({}, { locale }),
		nav: {
			about: m.nav_about({}, { locale }),
			posts: m.nav_posts({}, { locale }),
			study: m.nav_study({}, { locale }),
			system: m.nav_system({}, { locale }),
		},
		navProjects: m.nav_projects({}, { locale }),
		navTags: m.nav_tags({}, { locale }),
		navContact: m.nav_contact({}, { locale }),
		switchToEnglish: m.language_switch_to_english({}, { locale }),
		switchToKorean: m.language_switch_to_korean({}, { locale }),
		footerTagline: m.footer_tagline({}, { locale }),
		footerNavigation: m.footer_navigation_label({}, { locale }),
		footerColSite: m.footer_col_site({}, { locale }),
		footerColMore: m.footer_col_more({}, { locale }),
		footerColConnect: m.footer_col_connect({}, { locale }),
		footerCopyPrimary: m.footer_copy_primary({}, { locale }),
		footerCopySecondary: m.footer_copy_secondary({}, { locale }),
	};
}

export type ShellCopy = ReturnType<typeof shellCopy>;

export function articleCopy(locale: Locale) {
	const scaffold = SLICE_1_SCAFFOLDING[locale];
	return {
		home: m.palette_nav_home({}, { locale }),
		published: m.published({}, { locale }),
		updated: m.updated({}, { locale }),
		tags: m.nav_tags({}, { locale }),
		translationNotice: m.translation_notice({}, { locale }),
		viewInEnglish: m.view_in_english({}, { locale }),
		toc: m.on_this_page({}, { locale }),
		comments: m.comments_title({}, { locale }),
		breadcrumb: scaffold.breadcrumb,
		readingTime: scaffold.readingTime,
		category: scaffold.category,
		switchLabel: scaffold.switchLabel,
		switchText: scaffold.switchText,
		commentsStatus: scaffold.commentsStatus,
	};
}
