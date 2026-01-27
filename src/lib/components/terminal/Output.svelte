<!--
  Output.svelte - Terminal Output Display Component
  =================================================

  WHAT: Renders terminal output lines with appropriate styling.
  WHY:  Different output types (errors, success, links) need different colors.
  HOW:  Maps line types to CSS classes and handles special cases (links, HTML).

  DESIGN PATTERN: Presentation Component
  - No state of its own (stateless)
  - Receives data via props
  - Pure rendering logic
  - Easy to test and reason about

  OUTPUT LINE TYPES:
  - text: Default terminal text (white)
  - error: Error messages (red)
  - success: Success messages (green)
  - directory: Directory names (yellow)
  - file: File names (green)
  - link: Clickable links (cyan)
  - html: Raw HTML content (rendered with {@html})
  - markdown: Markdown content (passed through)
  - purple: Special highlight (orange - used for ASCII art)
-->
<script lang="ts">
	// TYPE IMPORT
	// -----------
	// Import the type definition for output lines.
	// `import type` is TypeScript syntax - stripped at compile time.
	// WHY: Type safety without runtime overhead.
	import type { OutputLine } from '$lib/stores/terminal';

	// PROPS - Simple component with single prop
	interface Props {
		lines: OutputLine[];
	}

	let { lines }: Props = $props();

	// HELPER: Map line type to Tailwind CSS classes
	// ----------------------------------------------
	// PATTERN: Type-safe switch for exhaustive handling.
	// Each output type gets specific terminal-themed colors.
	function getLineClass(type: OutputLine['type']): string {
		switch (type) {
			case 'error':
				return 'text-terminal-accent-red';
			case 'success':
				return 'text-terminal-accent-green';
			case 'directory':
				return 'text-terminal-accent-yellow';
			case 'file':
				return 'text-terminal-accent-green';
			case 'link':
				// Links are cyan with hover underline and pointer cursor
				return 'text-terminal-accent-cyan hover:underline cursor-pointer';
			case 'purple':
				// Note: Despite the name, uses orange for ASCII art (historical naming)
				return 'text-terminal-accent-orange';
			default:
				return 'text-terminal-text-primary';
		}
	}

	// HELPER: Process link href
	// -------------------------
	// For external links (http/mailto), use as-is.
	// For internal paths, use as-is (SvelteKit handles routing).
	function getLinkHref(link: string): string {
		if (link.startsWith('http') || link.startsWith('mailto')) {
			return link;
		}
		return link;
	}

	// HELPER: Determine link target
	// -----------------------------
	// External links open in new tab (_blank).
	// Internal links navigate in same tab (undefined).
	function getLinkTarget(link: string): string | undefined {
		if (link.startsWith('http') || link.startsWith('mailto')) {
			return '_blank';
		}
		return undefined;
	}
</script>

<!--
  OUTPUT CONTAINER
  ----------------
  space-y-0.5: Small gap between lines (2px with default Tailwind config)
-->
<div class="space-y-0.5">
	<!--
	  {#each} WITH KEY
	  ----------------
	  SYNTAX: {#each array as item, index (key)}

	  WHY use index as key here?
	  - Output lines can repeat (same content)
	  - Lines are append-only (no reordering)
	  - Index is stable for this use case

	  BETTER KEYS: Use unique IDs when:
	  - Items can be reordered
	  - Items can be removed from middle
	  - Items have inherent identity
	-->
	{#each lines as line, i (i)}
		<!--
		  CONDITIONAL RENDERING: Multiple branches
		  ----------------------------------------
		  {#if} / {:else if} / {:else} chain for different line types.
		  Order matters - more specific checks first.
		-->
		{#if line.type === 'html'}
			<!--
			  {@html} - RAW HTML RENDERING
			  ----------------------------
			  WHAT: Renders string as raw HTML (not escaped).
			  WHY: Some output (like ASCII art) needs HTML formatting.
			  ⚠️ SECURITY WARNING: Only use with trusted content!
			  Never use with user input - XSS vulnerability risk.

			  REFERENCE: https://svelte.dev/docs/svelte/html
			-->
			<div class="prose-terminal prose max-w-none">
				{@html line.content}
			</div>
		{:else if line.type === 'markdown'}
			<!--
			  MARKDOWN OUTPUT
			  ---------------
			  Note: This just passes through content.
			  For actual markdown rendering, you'd use a markdown parser
			  or mdsvex component. Currently treated as plain text.
			-->
			<div class="prose-terminal prose max-w-none">
				{line.content}
			</div>
		{:else if line.link}
			<!--
			  LINK OUTPUT
			  -----------
			  Lines with a `link` property become clickable anchors.

			  ACCESSIBILITY:
			  - rel="noopener noreferrer" for external links
			    - noopener: Prevents new page from accessing window.opener
			    - noreferrer: Doesn't send referrer header
			  - Target _blank for external, undefined for internal

			  CONDITIONAL ATTRIBUTE: `rel={condition ? value : undefined}`
			  When undefined, Svelte omits the attribute entirely.
			-->
			<a
				href={getLinkHref(line.link)}
				target={getLinkTarget(line.link)}
				rel={line.link.startsWith('http') ? 'noopener noreferrer' : undefined}
				class={getLineClass(line.type)}
			>
				<!--
				  <pre> FOR TERMINAL TEXT
				  -----------------------
				  WHY pre: Preserves whitespace and uses monospace font.
				  m-0: Removes default pre margin.
				  whitespace-pre-wrap: Preserves spaces but allows wrapping.
				  break-words: Breaks long words to prevent overflow.
				-->
				<pre class="m-0 whitespace-pre-wrap break-words font-mono">{line.content}</pre>
			</a>
		{:else}
			<!--
			  DEFAULT TEXT OUTPUT
			  -------------------
			  Regular terminal output with type-based coloring.
			-->
			<div class={getLineClass(line.type)}>
				<pre class="m-0 whitespace-pre-wrap break-words font-mono">{line.content}</pre>
			</div>
		{/if}
	{/each}
</div>
