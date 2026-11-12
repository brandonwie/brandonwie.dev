import * as m from '../paraglide/messages.js';
import type { Locale } from './locale';

/**
 * Locale-resolved UI copy.
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
 * from.
 */

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

/** Copy for a post page. */
export function articleCopy(locale: Locale) {
	return {
		allPosts: m.all_posts({}, { locale }),
		published: m.published({}, { locale }),
		updated: m.updated({}, { locale }),
		readingTimeLabel: m.reading_time_label({}, { locale }),
		readingTime: (minutes: number) => m.reading_time({ minutes }, { locale }),
		category: m.category({}, { locale }),
		tags: m.tags({}, { locale }),
		translationNotice: m.translation_notice({}, { locale }),
		viewInEnglish: m.view_in_english({}, { locale }),
		toc: m.on_this_page({}, { locale }),
		readingProgress: m.reading_progress({}, { locale }),
		share: m.share({}, { locale }),
		email: m.email({}, { locale }),
		copyLink: m.copy_link({}, { locale }),
		copied: m.copied({}, { locale }),
		codeCopy: m.code_copy({}, { locale }),
		alsoPublishedOn: m.also_published_on({}, { locale }),
		postNavigation: m.post_navigation({}, { locale }),
		newer: m.newer_post({}, { locale }),
		older: m.older_post({}, { locale }),
		moreIn: (category: string) => m.more_in_category({ category }, { locale }),
		comments: m.comments_title({}, { locale }),
	};
}

export type ArticleCopy = ReturnType<typeof articleCopy>;

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
