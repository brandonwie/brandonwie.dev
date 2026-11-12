import { Fragment, type ReactNode } from 'react';

/**
 * A post title with its backtick spans as `<code>`. A title is plain text
 * otherwise, so no Markdown parser runs on it. An unpaired backtick leaves the
 * title as written.
 */
export function titleNodes(title: string): ReactNode {
	const parts = title.split('`');
	if (parts.length % 2 === 0) return title;
	return parts.map((part, index) =>
		index % 2 === 1 ? <code key={index}>{part}</code> : <Fragment key={index}>{part}</Fragment>,
	);
}
