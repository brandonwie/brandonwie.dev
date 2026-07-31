<script lang="ts">
	import Stepper from '$lib/components/study/Stepper.svelte';
	import type { PatternMatchCopy } from '$lib/data/study';

	let { copy }: { copy: PatternMatchCopy } = $props();

	let step = $state(0);

	type CellRole = 'idle' | 'match' | 'mismatch' | 'shift' | 'skip' | 'found';
	type ActiveRole = Exclude<CellRole, 'idle'>;

	interface BmFrame {
		/** Text index the pattern currently starts at. */
		align: number;
		/** Pattern indices already compared equal at this alignment (back to front). */
		matched: number[];
		/** Pattern index whose comparison failed, when this frame is a mismatch. */
		mismatch: number | null;
		/** Text indices the shift moved past for good. */
		skipped: number[];
		/** Pattern index the shift parked under the mismatched text character. */
		aligned: number | null;
		/** True once every pattern character matched at this alignment. */
		found: boolean;
		/** The table only exists after the preprocessing pass. */
		tableBuilt: boolean;
		/** Last occurrence entry this frame consulted. */
		tableKey: string | null;
		/** Badge drawn beside the pattern row. */
		role: ActiveRole | null;
	}

	// Worked example: pattern abacab (m = 6) inside text abacadbaabacab (n = 14).
	const TEXT = 'abacadbaabacab';
	const PATTERN = 'abacab';
	const FALLBACK_KEY = '*';

	const textChars = TEXT.split('');
	const patternChars = PATTERN.split('');

	// The O(m) preprocessing pass: last index of every character in the pattern.
	// Repeated keys keep the later index, so the Map constructor already encodes
	// "last occurrence" without a mutation pass.
	const lastOccurrence = new Map<string, number>(
		patternChars.map((char, index): [string, number] => [char, index]),
	);

	const tableEntries = [
		...[...lastOccurrence.entries()].map(([key, value]) => ({ key, value })),
		{ key: FALLBACK_KEY, value: -1 },
	];

	const LEGEND: ActiveRole[] = ['match', 'mismatch', 'shift', 'skip', 'found'];

	const frames: BmFrame[] = [
		{
			align: 0,
			matched: [],
			mismatch: null,
			skipped: [],
			aligned: null,
			found: false,
			tableBuilt: false,
			tableKey: null,
			role: null,
		},
		{
			align: 0,
			matched: [],
			mismatch: null,
			skipped: [],
			aligned: null,
			found: false,
			tableBuilt: true,
			tableKey: null,
			role: null,
		},
		// i = 0: text[5] = d vs pattern[5] = b.
		{
			align: 0,
			matched: [],
			mismatch: 5,
			skipped: [],
			aligned: null,
			found: false,
			tableBuilt: true,
			tableKey: null,
			role: 'mismatch',
		},
		// last(d) = -1, shift 5 - (-1) = 6, so the whole window is skipped.
		{
			align: 6,
			matched: [],
			mismatch: null,
			skipped: [0, 1, 2, 3, 4, 5],
			aligned: null,
			found: false,
			tableBuilt: true,
			tableKey: FALLBACK_KEY,
			role: 'shift',
		},
		// i = 6: text[11] = c vs pattern[5] = b.
		{
			align: 6,
			matched: [],
			mismatch: 5,
			skipped: [],
			aligned: null,
			found: false,
			tableBuilt: true,
			tableKey: null,
			role: 'mismatch',
		},
		// last(c) = 3, shift 5 - 3 = 2, so pattern[3] lands under text[11].
		{
			align: 8,
			matched: [],
			mismatch: null,
			skipped: [6, 7],
			aligned: 3,
			found: false,
			tableBuilt: true,
			tableKey: 'c',
			role: 'shift',
		},
		// i = 8: text[13], text[12], text[11] match pattern[5], pattern[4], pattern[3].
		{
			align: 8,
			matched: [5, 4, 3],
			mismatch: null,
			skipped: [],
			aligned: null,
			found: false,
			tableBuilt: true,
			tableKey: null,
			role: 'match',
		},
		// text[10], text[9], text[8] match pattern[2], pattern[1], pattern[0].
		{
			align: 8,
			matched: [5, 4, 3, 2, 1, 0],
			mismatch: null,
			skipped: [],
			aligned: null,
			found: true,
			tableBuilt: true,
			tableKey: null,
			role: 'found',
		},
		// Shift by one to i = 9, which is past n - m = 8, so the search stops.
		{
			align: 9,
			matched: [],
			mismatch: null,
			skipped: [],
			aligned: null,
			found: false,
			tableBuilt: true,
			tableKey: null,
			role: 'shift',
		},
	];

	const frame = $derived(frames[step]);
	const matches = $derived(
		frames
			.slice(0, step + 1)
			.filter((item) => item.found)
			.map((item) => item.align),
	);
	const matchesText = $derived(matches.length > 0 ? matches.join(', ') : '—');
	const roleBadge = $derived(frame.role === null ? '' : copy.roleLabels[frame.role]);

	const CELL = 18;
	const PITCH = 20;
	const ORIGIN_X = 34;
	const TEXT_Y = 16;
	const PATTERN_Y = 54;

	function cellX(index: number): number {
		return ORIGIN_X + index * PITCH;
	}

	function inMatchWindow(index: number): boolean {
		return matches.some((start) => index >= start && index < start + PATTERN.length);
	}

	function textRole(index: number): CellRole {
		if (inMatchWindow(index)) return 'found';
		if (frame.mismatch !== null && index === frame.align + frame.mismatch) return 'mismatch';
		if (frame.matched.includes(index - frame.align)) return 'match';
		if (frame.aligned !== null && index === frame.align + frame.aligned) return 'shift';
		if (frame.skipped.includes(index)) return 'skip';
		return 'idle';
	}

	function patternRole(index: number): CellRole {
		if (frame.found) return 'found';
		if (frame.mismatch === index) return 'mismatch';
		if (frame.matched.includes(index)) return 'match';
		if (frame.aligned === index) return 'shift';
		return 'idle';
	}

	function cellClass(role: CellRole): string {
		if (role === 'match') return 'fill-bg stroke-foam';
		if (role === 'mismatch') return 'fill-bg stroke-gold';
		if (role === 'shift') return 'fill-highlight-med stroke-gold';
		if (role === 'skip') return 'fill-highlight-med stroke-line';
		if (role === 'found') return 'fill-highlight-med stroke-accent';
		return 'fill-bg stroke-line';
	}

	function charClass(role: CellRole): string {
		if (role === 'match') return 'fill-foam';
		if (role === 'mismatch' || role === 'shift') return 'fill-gold';
		if (role === 'skip') return 'fill-faint';
		if (role === 'found') return 'fill-accent';
		return 'fill-muted';
	}

	function legendClass(role: ActiveRole): string {
		if (role === 'match') return 'border-foam text-foam';
		if (role === 'mismatch') return 'border-gold text-gold';
		if (role === 'shift') return 'border-gold bg-highlight-med text-gold';
		if (role === 'skip') return 'border-line border-dashed bg-highlight-med text-faint';
		return 'border-accent bg-highlight-med text-accent';
	}

	function entryClass(key: string): string {
		if (!frame.tableBuilt) return 'border-line text-faint';
		if (frame.tableKey === key) return 'border-gold text-gold';
		return 'border-accent bg-highlight-med text-accent';
	}
</script>

<article class="study-card min-w-0 p-5">
	<div class="flex items-center justify-between gap-4">
		<div>
			<h3 class="text-lg font-semibold text-ink">{copy.title}</h3>
			<p class="mt-2 text-sm leading-6 text-muted">{copy.description}</p>
		</div>
		<span class="font-mono text-xs text-faint">{step + 1}/{frames.length}</span>
	</div>

	<Stepper length={frames.length} bind:step labels={copy} />

	<div class="mt-5 overflow-x-auto">
		<svg viewBox="0 0 344 92" class="min-w-[20rem] max-w-full" role="img" aria-label={copy.title}>
			<text
				x={ORIGIN_X - 6}
				y={TEXT_Y + CELL / 2}
				text-anchor="end"
				dominant-baseline="central"
				class="fill-faint font-mono text-[8px] uppercase tracking-wider"
			>
				{copy.textLabel}
			</text>
			<text
				x={ORIGIN_X - 6}
				y={PATTERN_Y + CELL / 2}
				text-anchor="end"
				dominant-baseline="central"
				class="fill-faint font-mono text-[8px] uppercase tracking-wider"
			>
				{copy.patternLabel}
			</text>

			{#each textChars as char, index (index)}
				{@const role = textRole(index)}
				<g>
					<text
						x={cellX(index) + CELL / 2}
						y="11"
						text-anchor="middle"
						class="fill-faint font-mono text-[8px]"
					>
						{index}
					</text>
					<rect
						x={cellX(index)}
						y={TEXT_Y}
						width={CELL}
						height={CELL}
						rx="3"
						stroke-width="1.5"
						stroke-dasharray={role === 'skip' ? '3 3' : undefined}
						class={`transition-colors duration-200 motion-reduce:transition-none ${cellClass(role)}`}
					/>
					<text
						x={cellX(index) + CELL / 2}
						y={TEXT_Y + CELL / 2}
						text-anchor="middle"
						dominant-baseline="central"
						class={`font-mono text-[13px] ${charClass(role)}`}
					>
						{char}
					</text>
				</g>
			{/each}

			{#if roleBadge}
				<text
					x={cellX(frame.align)}
					y="47"
					text-anchor="start"
					class={`font-mono text-[8px] uppercase tracking-wider ${charClass(frame.role ?? 'idle')}`}
				>
					{roleBadge}
				</text>
			{/if}

			{#each patternChars as char, index (index)}
				{@const role = patternRole(index)}
				{@const x = cellX(frame.align + index)}
				<g>
					<rect
						{x}
						y={PATTERN_Y}
						width={CELL}
						height={CELL}
						rx="3"
						stroke-width="1.5"
						class={`transition-colors duration-200 motion-reduce:transition-none ${cellClass(role)}`}
					/>
					<text
						x={x + CELL / 2}
						y={PATTERN_Y + CELL / 2}
						text-anchor="middle"
						dominant-baseline="central"
						class={`font-mono text-[13px] ${charClass(role)}`}
					>
						{char}
					</text>
					<text
						x={x + CELL / 2}
						y="84"
						text-anchor="middle"
						class="fill-faint font-mono text-[8px]"
					>
						{index}
					</text>
				</g>
			{/each}
		</svg>
	</div>

	<div class="mt-5">
		<span class="font-mono text-xs uppercase tracking-wider text-faint">{copy.tableLabel}</span>
		<div class="mt-2 flex flex-wrap gap-2">
			{#each tableEntries as entry (entry.key)}
				<span class={`border px-2.5 py-1 font-mono text-sm ${entryClass(entry.key)}`}>
					{entry.key} → {entry.value}
				</span>
			{/each}
		</div>
	</div>

	<div class="mt-5">
		<span class="font-mono text-xs uppercase tracking-wider text-faint">{copy.legendLabel}</span>
		<div class="mt-2 flex flex-wrap gap-2">
			{#each LEGEND as role (role)}
				<span class={`border px-2.5 py-1 font-mono text-[11px] uppercase ${legendClass(role)}`}>
					{copy.roleLabels[role]}
				</span>
			{/each}
		</div>
	</div>

	<p class="mt-4 font-mono text-xs text-faint">
		{copy.matchesLabel}: {matchesText}
	</p>

	<p class="mt-5 border-l border-accent bg-bg px-3 py-2 text-sm leading-6 text-muted">
		{step + 1}. {copy.steps[step] ?? ''}
	</p>
</article>
