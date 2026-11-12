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
 * it: a breadcrumb label, a reading-time suffix. Adding permanent catalogue
 * keys for strings that Slice 3 deletes when it ports the real shell would
 * leave dead keys behind, so they stay here, named, until the surface that
 * owns them arrives.
 *
 * FOUR OF THOSE KEYS ARE NOW GONE. Slice 3 PR 2a ported the real header and
 * footer, so `brandLabel`, `article`, `footer` and `footerText` were deleted
 * rather than migrated: the header's brand label, the Slice 1 article link, and
 * the placeholder footer they described no longer exist. The chrome resolves
 * from the catalogue instead — every message the Svelte header, footer,
 * language toggle and nav reference already resolves in both `messages/en.json`
 * and `messages/ko.json`, so this cost no catalogue expansion. `commentsStatus`
 * was deleted in Slice 5: it told no-JS readers the Giscus runtime was still
 * unmigrated, which was no longer true once `Giscus.tsx` shipped — and the
 * baseline renders no status text at all. The remaining scaffolding keys
 * belong to the article surface.
 */
const SLICE_1_SCAFFOLDING = {
	en: {
		breadcrumb: 'Breadcrumb',
		readingTime: 'min read',
		category: 'Category',
		switchLabel: 'Read this article in Korean',
		switchText: '한국어',
	},
	ko: {
		breadcrumb: '현재 위치',
		readingTime: '분 읽기',
		category: '카테고리',
		switchLabel: '이 글을 영어로 읽기',
		switchText: 'English',
	},
} as const;

/**
 * Locale-resolved copy for the site frame: header, footer, language and theme
 * switches, and the shortcut list. One call site per message, each carrying
 * `{ locale }` for the reason this module's header gives.
 *
 * `nav` is keyed by `NavKey` so `@/data/nav` can stay pure path logic with no
 * message imports. The keys are static property references, not `m[key]`, so
 * every one resolves at build time — the same rule `graph-copy.ts` follows.
 */
export function shellCopy(locale: Locale) {
	return {
		skip: m.skip_to_content({}, { locale }),
		navigation: m.primary_navigation({}, { locale }),
		search: m.search_title({}, { locale }),
		nav: {
			posts: m.nav_posts({}, { locale }),
			study: m.nav_study({}, { locale }),
			system: m.nav_system({}, { locale }),
			about: m.nav_about({}, { locale }),
		},
		switchToEnglish: m.language_switch_to_english({}, { locale }),
		switchToKorean: m.language_switch_to_korean({}, { locale }),
		theme: m.theme_toggle({}, { locale }),
		footerNavigation: m.footer_navigation_label({}, { locale }),
		feed: m.social_feed_title({}, { locale }),
		shortcuts: {
			title: m.shortcuts_title({}, { locale }),
			rows: m.shortcuts_rows({}, { locale }),
			open: m.shortcuts_open({}, { locale }),
			help: m.shortcuts_help({}, { locale }),
			close: m.close({}, { locale }),
		},
	};
}

export type ShellCopy = ReturnType<typeof shellCopy>;

/**
 * Copy for the post index on the home page. The count and tag templates keep
 * their `{…}` slots: the filter fills them in the browser, where the numbers
 * change.
 */
export function indexCopy(locale: Locale) {
	return {
		bio: m.blog_bio({}, { locale }),
		aboutMore: m.about_more({}, { locale }),
		minutes: (minutes: number) => m.minutes_short({ minutes }, { locale }),
		filter: {
			searchLabel: m.search_posts({}, { locale }),
			searchHint: m.search_hint({}, { locale }),
			categories: m.category_filter({}, { locale }),
			all: m.all_categories({}, { locale }),
			count: m.posts_count({ count: '{count}' }, { locale }),
			countFiltered: m.posts_count_filtered({ shown: '{shown}', total: '{total}' }, { locale }),
			none: m.posts_none({}, { locale }),
			clear: m.clear_filters({}, { locale }),
			removeTag: m.tag_filter_remove({ tag: '{tag}' }, { locale }),
			fullTextUnavailable: m.full_text_unavailable({}, { locale }),
		},
	};
}

export type IndexCopy = ReturnType<typeof indexCopy>;

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

export function aboutCopy(locale: Locale) {
	return {
		backToHome: m.back_to_home({}, { locale }),
		navAbout: m.nav_about({}, { locale }),
		terminalSignal: m.about_terminal_signal({}, { locale }),
		terminalLoading: m.about_terminal_loading({}, { locale }),
		portraitCaption: m.about_portrait_caption({}, { locale }),
	};
}

export type AboutCopy = ReturnType<typeof aboutCopy>;

export function projectsCopy(locale: Locale) {
	return {
		pageTitle: `${m.projects_meta_title({}, { locale })} | Brandon Wie`,
		metaDescription: m.projects_meta_description({}, { locale }),
		eyebrow: m.projects_eyebrow({}, { locale }),
		title: m.projects_title({}, { locale }),
		intro: m.projects_intro({}, { locale }),
	};
}

export type ProjectsCopy = ReturnType<typeof projectsCopy>;

export function contactCopy(locale: Locale) {
	return {
		pageTitle: `${m.contact_meta_title({}, { locale })} | Brandon Wie`,
		metaDescription: m.contact_meta_description({}, { locale }),
		eyebrow: m.contact_eyebrow({}, { locale }),
		title: m.contact_title({}, { locale }),
		intro: m.contact_intro({}, { locale }),
		channelsHeading: m.contact_channels_heading({}, { locale }),
	};
}

export type ContactCopy = ReturnType<typeof contactCopy>;

export function systemCopy(locale: Locale) {
	return {
		pageTitle: `${m.system_3b_title({}, { locale })} | Brandon Wie`,
		pageDescription: m.system_3b_meta_description({}, { locale }),
		subtitle: m.system_3b_subtitle({}, { locale }),
		title: m.system_3b_title({}, { locale }),
		indexIntro: m.system_3b_index_intro({}, { locale }),
		openHub: m.system_3b_open_hub({}, { locale }),
	};
}

export type SystemCopy = ReturnType<typeof systemCopy>;
