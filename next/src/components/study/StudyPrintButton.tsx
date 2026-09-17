'use client';

/**
 * Print button for the AWS study page. Isolated as the page's only client
 * boundary: everything else on the page renders statically, so the page
 * itself stays a server component and `window.print()` lives here alone.
 */
export default function StudyPrintButton({ label }: { label: string }) {
	return (
		<button
			type="button"
			className="study-btn focus-terminal mt-5 w-full font-mono"
			onClick={() => window.print()}
		>
			{label}
		</button>
	);
}
