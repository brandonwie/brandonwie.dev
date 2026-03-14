import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type ViewMode = 'blog' | 'terminal';

const STORAGE_KEY = 'brandonwie-view-mode';

function getInitial(): ViewMode {
	if (browser) {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === 'blog' || stored === 'terminal') return stored;
	}
	return 'blog';
}

export const viewMode = writable<ViewMode>(getInitial());

// Persist to localStorage on change
if (browser) {
	viewMode.subscribe((value) => {
		localStorage.setItem(STORAGE_KEY, value);
	});
}

export function toggleViewMode() {
	viewMode.update((current) => (current === 'blog' ? 'terminal' : 'blog'));
}
