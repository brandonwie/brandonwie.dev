/**
 * Theme store — dark/light with localStorage persistence.
 *
 * Dark is the default. The no-FOUC script in app.html sets
 * `document.documentElement.dataset.theme` before first paint; this store keeps
 * the reactive UI (ThemeToggle, palette command) in sync and writes changes
 * back to both the DOM and localStorage.
 */
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'theme';

function readStored(): Theme {
	if (!browser) return 'dark';
	try {
		return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
	} catch {
		return 'dark';
	}
}

export const theme = writable<Theme>(readStored());

/** Reflect a theme onto <html> + persist it. Safe to call only in the browser. */
function applyTheme(next: Theme): void {
	if (!browser) return;
	const root = document.documentElement;
	if (next === 'light') root.dataset.theme = 'light';
	else delete root.dataset.theme;
	try {
		localStorage.setItem(STORAGE_KEY, next);
	} catch {
		/* persistence is best-effort */
	}
}

/** Re-sync the store from the DOM/localStorage (call once on mount). */
export function initTheme(): void {
	if (!browser) return;
	theme.set(document.documentElement.dataset.theme === 'light' ? 'light' : readStored());
}

export function toggleTheme(): void {
	theme.update((current) => {
		const next: Theme = current === 'light' ? 'dark' : 'light';
		applyTheme(next);
		return next;
	});
}
