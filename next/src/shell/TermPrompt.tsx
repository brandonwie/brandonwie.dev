import type { ReactNode } from 'react';

/**
 * One shell prompt line: `brandon@seoul:<cwd> $ <command> <flags>`.
 *
 * Pages introduce each section with one of these instead of a `#` heading. It
 * carries no hooks, so server pages render it with the cwd they already know
 * (`cwdFor(route)`); the shell's trailing prompt wraps it in a client reader.
 *
 * The line is a visual echo of the route and never the only label for content,
 * so it is hidden from assistive tech unless a page opts in with `announce`.
 */
export function TermPrompt({
	cwd,
	command,
	flags,
	cursor = false,
	announce = false,
	className,
	children,
}: {
	cwd: string;
	command?: ReactNode;
	flags?: ReactNode;
	/** Trailing block cursor (blinks only when motion is allowed). */
	cursor?: boolean;
	/** Expose the line to screen readers (default: decorative). */
	announce?: boolean;
	className?: string;
	/** Output rendered after the command on the same line. */
	children?: ReactNode;
}) {
	return (
		<p
			className={className ? `term-ps1 ${className}` : 'term-ps1'}
			aria-hidden={announce ? undefined : true}
		>
			<span className="u">brandon@seoul</span>
			<span className="s">:</span>
			<span className="p">{cwd}</span>
			<span className="s"> $ </span>
			{command ? <span className="cmd">{command}</span> : null}
			{flags ? (
				<>
					{' '}
					<span className="flag">{flags}</span>
				</>
			) : null}
			{children}
			{cursor ? <span className="term-cursor" /> : null}
		</p>
	);
}
