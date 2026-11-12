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

/**
 * A colour token's value in the theme on screen, as written in `src/app.css`.
 * Diagram libraries do colour maths and need a literal, not `light-dark()`.
 */
export function tokenColor(name: string): string {
	const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
	const pair = raw.match(/^light-dark\(\s*([^,\s]+)\s*,\s*([^,\s)]+)\s*\)$/);
	return pair ? pair[currentTheme() === 'dark' ? 2 : 1] : raw;
}

/**
 * Run `listener` when the theme on screen changes: the reader used the toggle,
 * or the system preference changed while no choice is stored.
 *
 * @returns a function that stops listening
 */
export function onThemeChange(listener: () => void): () => void {
	const system = window.matchMedia('(prefers-color-scheme: dark)');
	window.addEventListener(THEME_CHANGE_EVENT, listener);
	system.addEventListener('change', listener);
	return () => {
		window.removeEventListener(THEME_CHANGE_EVENT, listener);
		system.removeEventListener('change', listener);
	};
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
