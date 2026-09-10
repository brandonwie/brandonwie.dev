import type { ReactNode } from 'react';

export interface TerminalHeroProps {
	title?: string;
	prompt?: string;
	children: ReactNode;
}

/**
 * TerminalHero — the signature terminal "window" panel from the design.
 *
 * A reusable chrome primitive: a title bar with traffic-light dots and a body
 * slot. Shared by the home hero and (later) about / contact / 404. Optionally
 * renders a shell `prompt` line above the body content.
 * Ports `src/lib/components/TerminalHero.svelte`.
 */
export function TerminalHero({ title = 'brandon@moba: ~', prompt, children }: TerminalHeroProps) {
	return (
		<div className="term">
			<div className="term__bar">
				<span className="term__light term__light--r" aria-hidden="true" />
				<span className="term__light term__light--y" aria-hidden="true" />
				<span className="term__light term__light--g" aria-hidden="true" />
				<span className="term__title">{title}</span>
			</div>
			<div className="term__body">
				{prompt ? (
					<div className="term__prompt">
						<span className="term__u">brandon</span>@<span className="term__p">moba</span>:~${' '}
						{prompt}
					</div>
				) : null}
				{children}
			</div>
		</div>
	);
}
