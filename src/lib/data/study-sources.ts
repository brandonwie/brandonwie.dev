/**
 * PRIVATE study source registry — build/maintenance only.
 *
 * This module records which 3B study notes back the public study pages and
 * their content hashes, so `scripts/validate-study-sources.ts` (`pnpm study:check`)
 * can flag drift before the public page is edited.
 *
 * IMPORTANT: Do NOT import this file into any Svelte component or route. It
 * intentionally contains private local paths, note filenames, and hashes that
 * must never render on the public site. Public-facing copy lives in `study.ts`.
 */

export interface StudySourceFile {
	path: string;
	sha256: string;
	role: 'index' | 'primary-note' | 'slide-summary';
}

export const DSA_I_SOURCE_ROOT_LABEL = 'personal/study/gt-dsa/dsa-i';

export const DSA_I_SOURCE_FILES: StudySourceFile[] = [
	{
		path: '_index.md',
		sha256: '73d4f27cd7f83f628bd2cbb5693abb9365bca62066fa72f0898c6a4f66bee595',
		role: 'index',
	},
	{
		path: 'm0-java-review.md',
		sha256: 'f27c8973edcbbc6edd6f05f68edb30407dbb830a832a465c6002ce61b8800434',
		role: 'primary-note',
	},
	{
		path: 'm0-iterable-comparable.md',
		sha256: 'b282186381e2a2823adc491d18f5efce82ec3854e477b20bf21665676f1b1d62',
		role: 'primary-note',
	},
	{
		path: 'm0-big-o-concepts.md',
		sha256: '90226695deeac36e4976f8536fb8265e3f93beb48e49b23de4151ec9677b57f9',
		role: 'primary-note',
	},
	{
		path: 'm1-arrays-and-arraylists.md',
		sha256: 'bfdeb22d06e9060adf1830fbd460b507cadfde776adf6694594d48eccf4f647d',
		role: 'primary-note',
	},
	{
		path: 'm1-recursion.md',
		sha256: 'f7f474841026693451544d2e213c5547193507df55b3f52b8eca4db3bd5f062f',
		role: 'primary-note',
	},
	{
		path: 'm2-linked-lists.md',
		sha256: '10e2ac72639a0d12e4fcd41004c5eaad3ae341a2cf56483d466169efe599af84',
		role: 'primary-note',
	},
	{
		path: 'm3-stacks-and-queues.md',
		sha256: '7ac6c8ec14bc3f9a893ad01c5049e84267fc4d2291b37513f3d1f14bf1a8f6c6',
		role: 'primary-note',
	},
	{
		path: 'refs/m0-analysis-of-algorithms-summary.md',
		sha256: 'e5177c1629647fa637488eafb9f7ee8b57304ae175ef341afe1d2c2d59398568',
		role: 'slide-summary',
	},
	{
		path: 'refs/m0-iterators-summary.md',
		sha256: 'd3af23e0bc26e52cf7b2ec5ba0fe124eae68e7bbe32f760bd3449b85ffa4623e',
		role: 'slide-summary',
	},
	{
		path: 'refs/m1-arrays-arraylist-summary.md',
		sha256: 'c69c36c0cedc15e679719b6e808ff5354e3d1f0b51931189f04ea498698c403e',
		role: 'slide-summary',
	},
	{
		path: 'refs/m1-recursion-summary.md',
		sha256: '716d4a7ba95648d607b6d99009f961a0f7cea85086e9eb75af39b8b345b3101f',
		role: 'slide-summary',
	},
	{
		path: 'refs/m2-iterators-summary.md',
		sha256: 'f20d6a73a10d0a60d3166fc1bd96de7dfbe771787706b77d787d829ba09471c4',
		role: 'slide-summary',
	},
	{
		path: 'refs/m2-linked-list-variations-summary.md',
		sha256: '1ce8d2a3bcf9d4d9d8b78280b561686e912fde48bca2a325444011f295a9e04b',
		role: 'slide-summary',
	},
	{
		path: 'refs/m2-singly-linked-lists-summary.md',
		sha256: '8b70103d86ad5dbb6ed95d9efa48d8995671e314e1335e461651ae0dc410d39f',
		role: 'slide-summary',
	},
];
