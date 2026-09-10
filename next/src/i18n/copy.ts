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
		backToPosts: m.back_to_posts({}, { locale }),
		readingProgress: m.reading_progress({}, { locale }),
		copyLink: m.copy_link({}, { locale }),
		copied: m.copied({}, { locale }),
		codeCopy: locale === 'ko' ? '복사' : 'Copy',
		codeCopied: m.copied({}, { locale }),
		readingTimeWithMinutes: (minutes: number) => m.reading_time({ minutes }, { locale }),
		alsoPublishedOn: m.also_published_on({}, { locale }),
	};
}

export type ArticleCopy = ReturnType<typeof articleCopy>;

export function homeCopy(locale: Locale) {
	return {
		pageTitle: m.site_title({}, { locale }),
		pageDescription: m.site_description({}, { locale }),
		tagline: m.blog_tagline({}, { locale }),
		bio: m.blog_bio({}, { locale }),
		projects: m.palette_nav_projects({}, { locale }),
		posts: m.palette_nav_posts({}, { locale }),
		about: m.palette_nav_about({}, { locale }),
		heroStatsLabel: m.hero_stats_label({}, { locale }),
		heroStatEventsLabel: m.hero_stat_events_label({}, { locale }),
		heroStatPostsLabel: m.hero_stat_posts_label({}, { locale }),
		heroStatServicesLabel: m.hero_stat_services_label({}, { locale }),
		heroStatLanguagesLabel: m.hero_stat_languages_label({}, { locale }),
		workSection: m.work_section({}, { locale }),
		archcalendarSubtitle: m.archcalendar_subtitle({}, { locale }),
		archcalendarDescription: m.archcalendar_description({}, { locale }),
		system3bCardSubtitle: m.system_3b_card_subtitle({}, { locale }),
		system3bTitle: m.system_3b_title({}, { locale }),
		system3bCardDescription: m.system_3b_card_description({}, { locale }),
		portfolioSubtitle: m.portfolio_subtitle({}, { locale }),
		portfolioDescription: m.portfolio_description({}, { locale }),
		recentPosts: m.recent_posts({}, { locale }),
		seeAllPosts: (count: number) => m.see_all_posts({ count }, { locale }),
		noPosts: m.no_posts({}, { locale }),
	};
}

export type HomeCopy = ReturnType<typeof homeCopy>;

export function postsListCopy(locale: Locale) {
	return {
		pageTitle: `${m.posts_title({}, { locale })} | Brandon Wie`,
		pageHeading: m.posts_title({}, { locale }),
		pageDescription: m.posts_description({}, { locale }),
		categoryFilter: m.category_filter({}, { locale }),
		allCategories: m.all_categories({}, { locale }),
		noPosts: m.no_posts({}, { locale }),
	};
}

export type PostsListCopy = ReturnType<typeof postsListCopy>;

export function tagsCopy(locale: Locale) {
	return {
		pageTitle: `${m.tags_meta_title({}, { locale })} | Brandon Wie`,
		pageDescription: m.tags_meta_description({}, { locale }),
		eyebrow: m.tags_eyebrow({}, { locale }),
		title: m.tags_title({}, { locale }),
		intro: (tags: number, posts: number) => m.tags_intro({ tags, posts }, { locale }),
		empty: m.tags_empty({}, { locale }),
		cloudHeading: m.tags_cloud_heading({}, { locale }),
		allHeading: m.tags_all_heading({}, { locale }),
		count: (count: number) => m.tags_count({ count }, { locale }),
	};
}

export type TagsCopy = ReturnType<typeof tagsCopy>;

export function searchCopy(locale: Locale) {
	return {
		pageTitle: `${m.search_title({}, { locale })} | Brandon Wie`,
		pageHeading: m.search_title({}, { locale }),
		pageDescription: m.site_description({}, { locale }),
		searchPlaceholder: m.search_placeholder({}, { locale }),
		resultsCount: (count: number) => m.search_results_count({ count }, { locale }),
		noResults: (query: string) => m.search_no_results({ query }, { locale }),
		devNotice: m.search_dev_notice({}, { locale }),
		loading: m.search_loading({}, { locale }),
		resultsStatus: m.search_results_status({}, { locale }),
		loadError:
			locale === 'ko' ? '검색 인덱스를 불러오지 못했습니다.' : 'Failed to load search index.',
		queryError:
			locale === 'ko' ? '검색 중 오류가 발생했습니다.' : 'An error occurred while searching.',
	};
}

export type SearchCopy = ReturnType<typeof searchCopy>;
