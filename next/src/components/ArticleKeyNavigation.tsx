'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { postsHref } from '@/data/nav';
import type { Locale } from '@/i18n/locale';

/**
 * ArticleKeyNavigation — Backspace keyboard shortcut back to posts.
 *
 * Ported from `PostDetail.svelte:106-116`.
 * Skips navigation when user is focused inside an editable field.
 */
export function ArticleKeyNavigation({ locale }: { locale: Locale }) {
	const router = typeof useRouter === 'function' ? useRouter() : null;

	if (typeof useEffect === 'function') {
		useEffect(() => {
			function handleKeyDown(event: KeyboardEvent) {
				if (event.key === 'Backspace') {
					const target = event.target as HTMLElement | null;
					if (!target) return;
					const isEditable =
						target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
					if (!isEditable) {
						event.preventDefault();
						router?.push(postsHref(locale));
					}
				}
			}

			window.addEventListener('keydown', handleKeyDown);
			return () => window.removeEventListener('keydown', handleKeyDown);
		}, [locale, router]);
	}

	return null;
}
