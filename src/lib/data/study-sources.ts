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

export const DSA_II_SOURCE_ROOT_LABEL = 'personal/study/gt-dsa/dsa-ii';

export const DSA_II_SOURCE_FILES: StudySourceFile[] = [
	{
		path: '_index.md',
		sha256: 'e7b7d633685a807232b08a203f141b06a12c9f58197d045cb37189a5dd903af9',
		role: 'index',
	},
	{
		path: 'm0-intro-and-review.md',
		sha256: '1630ece008cea1b6e753ff8f7d2285d8c0689b0d25868cfe6406d1517a7dca46',
		role: 'primary-note',
	},
	{
		path: 'm4-bst-introduction.md',
		sha256: '0a9d4560d43c76212bb8c690e5c860761b9f889aea03dda456f3a8707a031fa3',
		role: 'primary-note',
	},
	{
		path: 'm5-bst-operations-and-skiplists.md',
		sha256: '34950b50066fcbbc449f3e2ce1350ce24d2cffb5f0ca01225c20d75b48ba9c50',
		role: 'primary-note',
	},
	{
		path: 'm6-heaps.md',
		sha256: '01d3779798deb4b5d905bc80631da682859d3c936fc7dab9601a11565b595e17',
		role: 'primary-note',
	},
	{
		path: 'm7-hashmaps.md',
		sha256: '07714ac64bdacc5c28f3b5b84ab2c73159dda2133444dd37315e304285f6254d',
		role: 'primary-note',
	},
	{
		path: 'refs/m4-trees-summary.md',
		sha256: '15ac22b3a2c31d38832ad8a3b79742378eb862c70b55c3f15f08e357cc9953c6',
		role: 'slide-summary',
	},
	{
		path: 'refs/m6-buildheap-summary.md',
		sha256: 'd31ce149fe5d40b77186135dea980cd814aab550432fa630dfe240bc14e7f170',
		role: 'slide-summary',
	},
	{
		path: 'refs/m6-heaps-priority-queues-summary.md',
		sha256: 'fb4674d11d1afab5b82cc22a2a121ef881de9facbac69f450792a6b1a4b8081c',
		role: 'slide-summary',
	},
];

export const DSA_III_SOURCE_ROOT_LABEL = 'personal/study/gt-dsa/dsa-iii';

export const DSA_III_SOURCE_FILES: StudySourceFile[] = [
	{
		path: '_index.md',
		sha256: '33130c9c300a28f99083f4f2dc5c9a386eb36cb1f44f1fa5b72e766ecc01b5e4',
		role: 'index',
	},
	{
		path: 'm8-avl-trees.md',
		sha256: 'c9a188135831788d2bd0b7a0539953861a7be6aab280094dda3b8661ae645904',
		role: 'primary-note',
	},
	{
		path: 'm9-2-4-trees.md',
		sha256: '6c9c9958f09a3488c688b1d67a1e074542b1e49aa01dad89f5973322047dbb5e',
		role: 'primary-note',
	},
	{
		path: 'm10-iterative-sorts.md',
		sha256: '479429343405464f8cb8a54e31e2e9b9ffeec886145989a9f8d9eae15c6028fd',
		role: 'primary-note',
	},
	{
		path: 'm11-divide-conquer-sorts.md',
		sha256: 'a6aba4bb0435579b2d6646306adf4de40c509c4ddcb4d4f3308aa4f842b035a7',
		role: 'primary-note',
	},
	{
		path: 'refs/m0-analysis-of-algorithms-summary.md',
		sha256: '383b0178fa1306008e00d4620da417a1ddb9ddd09948fa7f3cb2bda0c6706fb6',
		role: 'slide-summary',
	},
	{
		path: 'refs/m0-iterators-summary.md',
		sha256: 'a1990f5815366b47d6ae4322541f9a4d1c85f3b110f3090621c94f68fe7df637',
		role: 'slide-summary',
	},
	{
		path: 'refs/m8-binary-search-trees-summary.md',
		sha256: '831d64cc99344312785f843a75f5ca69cc633714b69ebd31599cbde34741c44f',
		role: 'slide-summary',
	},
	{
		path: 'refs/m8-avl-trees-summary.md',
		sha256: 'd673460522f67feeed09985d2cf99380654a53e75c2f4723cff26001bdafbef1',
		role: 'slide-summary',
	},
	{
		path: 'refs/m8-pfaff-bst-performance-summary.md',
		sha256: '699f3eaeb893fafc5c8c5b779f486391986f6f835c795ad83cfc2b56b7293986',
		role: 'slide-summary',
	},
	{
		path: 'refs/m9-2-4-trees-slides-summary.md',
		sha256: 'dbee34f5e427643ce0da7da2fbf0abc4cdac1c0f0396b9e7e6f9a5179db967a7',
		role: 'slide-summary',
	},
	{
		path: 'refs/m10-iterative-sorts-summary.md',
		sha256: '0cc79e028280ea762acf55c5ab6f3477918b2645c09df8dcd8317907c269d534',
		role: 'slide-summary',
	},
];
