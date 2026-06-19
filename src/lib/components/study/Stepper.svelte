<script lang="ts">
	import type { StepperCopy } from '$lib/data/study';

	let {
		length,
		step = $bindable(0),
		labels,
	}: { length: number; step?: number; labels: StepperCopy } = $props();

	function previous() {
		step = Math.max(0, step - 1);
	}

	function next() {
		step = Math.min(length - 1, step + 1);
	}

	function reset() {
		step = 0;
	}
</script>

<div class="mt-4 flex gap-2">
	<button class="study-btn" type="button" onclick={previous} aria-label={labels.previousAriaLabel}>
		← {labels.previousLabel}
	</button>
	<button class="study-btn" type="button" onclick={next} aria-label={labels.nextAriaLabel}>
		{labels.nextLabel} →
	</button>
	<button class="study-btn" type="button" onclick={reset} aria-label={labels.resetAriaLabel}>
		↺ {labels.resetLabel}
	</button>
</div>
