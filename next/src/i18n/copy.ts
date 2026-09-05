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
 */
const SLICE_1_SCAFFOLDING = {
	en: {
		brandLabel: 'Brandon Wie home',
		article: 'Article',
		footer: 'Site footer',
		footerText: 'Engineering notes by Brandon Wie.',
		breadcrumb: 'Breadcrumb',
		readingTime: 'min read',
		category: 'Category',
		switchLabel: 'Read this article in Korean',
		switchText: '한국어',
		commentsStatus: 'Comments will load here when the Giscus runtime is migrated.',
	},
	ko: {
		brandLabel: 'Brandon Wie 홈',
		article: '글',
		footer: '사이트 하단',
		footerText: 'Brandon Wie의 엔지니어링 기록.',
		breadcrumb: '현재 위치',
		readingTime: '분 읽기',
		category: '카테고리',
		switchLabel: '이 글을 영어로 읽기',
		switchText: 'English',
		commentsStatus: 'Giscus 런타임을 마이그레이션하면 이곳에 댓글이 표시됩니다.',
	},
} as const;

export function shellCopy(locale: Locale) {
	const scaffold = SLICE_1_SCAFFOLDING[locale];
	return {
		skip: m.skip_to_content({}, { locale }),
		navigation: m.primary_navigation({}, { locale }),
		home: m.palette_nav_home({}, { locale }),
		brandLabel: scaffold.brandLabel,
		article: scaffold.article,
		footer: scaffold.footer,
		footerText: scaffold.footerText,
	};
}

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
