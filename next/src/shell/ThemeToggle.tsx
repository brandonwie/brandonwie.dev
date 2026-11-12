'use client';

import { toggleTheme } from './theme';

/** Header button that flips between the light and the dark theme. */
export function ThemeToggle({ label }: { label: string }) {
	return (
		<button
			type="button"
			className="site-tool theme-toggle"
			aria-label={label}
			title={label}
			data-hotkey="t"
			onClick={toggleTheme}
		>
			<span className="hotkey" aria-hidden="true">
				[T]
			</span>
			<span className="theme-toggle__icon" aria-hidden="true" />
		</button>
	);
}
