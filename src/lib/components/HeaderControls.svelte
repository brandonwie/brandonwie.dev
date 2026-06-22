<script lang="ts">
	/**
	 * HeaderControls — shared control cluster (language only).
	 *
	 * Single source of truth for the header control row. The theme toggle was
	 * removed in the terminal redesign (dark-only); language is the lone control.
	 */
	import LanguageToggle from '$lib/components/LanguageToggle.svelte';
</script>

<div class="flex items-center gap-2">
	<LanguageToggle />
</div>
