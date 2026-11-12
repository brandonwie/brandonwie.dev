/** localStorage key that holds a reader's explicit theme choice. */
export const THEME_STORAGE_KEY = 'theme';

/** Event fired on `window` after the reader flips the theme. */
export const THEME_CHANGE_EVENT = 'themechange';

export type Theme = 'light' | 'dark';

/** The theme the page renders in now: the stored choice, else the system preference. */
export function currentTheme(): Theme {
	const chosen = document.documentElement.dataset.theme;
	if (chosen === 'light' || chosen === 'dark') return chosen;
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Flip the theme, remember the choice and tell listeners (diagrams, comments). */
export function toggleTheme(): Theme {
	const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
	document.documentElement.dataset.theme = next;
	try {
		localStorage.setItem(THEME_STORAGE_KEY, next);
	} catch {
		// Storage can be blocked (private mode). The choice still holds for this page.
	}
	window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: next }));
	return next;
}
