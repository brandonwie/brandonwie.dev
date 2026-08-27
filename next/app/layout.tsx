import type { ReactNode } from 'react';

export const metadata = {
	title: 'Brandon Wie',
	description: 'Migration scaffold — the real document shell lands with C13.',
};

/**
 * Slice 1 scaffold shell.
 *
 * The real shell is contract C13 (document shell + locale `lang` surface) and
 * is ported with the layout slice. This exists so `output: 'export'` has a root
 * layout to build against; it deliberately asserts nothing about parity yet.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
