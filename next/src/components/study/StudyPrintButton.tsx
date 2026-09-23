'use client';

/**
 * Print button for the AWS study page. Isolated as the page's only client
 * boundary: everything else on the page renders statically, so the page
 * itself stays a server component and `window.print()` lives here alone.
 * Styled as the full-width `[ Print ]` study-btn at the foot of the pane
 * (`.sa-print`, study-aws.css).
 */
export default function StudyPrintButton({ label }: { label: string }) {
	return (
		<button type="button" className="study-btn sa-print" onClick={() => window.print()}>
			{label}
		</button>
	);
}
