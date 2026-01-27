<script lang="ts">
	/**
	 * Error Page (+error.svelte)
	 *
	 * Handles both 404 and 500 errors with terminal theme.
	 * SvelteKit automatically renders this for unhandled errors.
	 */
	import { page } from '$app/state';

	const status = $derived(page.status);
	const message = $derived(page.error?.message || 'Unknown error');

	const errorMessages: Record<number, { title: string; ascii: string; hint: string }> = {
		404: {
			title: 'Page Not Found',
			ascii: `
  ┌─────────────────────────────────┐
  │                                 │
  │   404   FILE NOT FOUND          │
  │                                 │
  │   $ cat /page                   │
  │   cat: /page: No such file      │
  │                                 │
  └─────────────────────────────────┘`,
			hint: 'The page you are looking for does not exist.'
		},
		500: {
			title: 'Server Error',
			ascii: `
  ┌─────────────────────────────────┐
  │                                 │
  │   500   INTERNAL ERROR          │
  │                                 │
  │   $ ./server                    │
  │   Segmentation fault (core      │
  │   dumped)                       │
  │                                 │
  └─────────────────────────────────┘`,
			hint: 'Something went wrong on our end.'
		}
	};

	const errorInfo = $derived(
		errorMessages[status] || {
			title: `Error ${status}`,
			ascii: `
  ┌─────────────────────────────────┐
  │                                 │
  │   ${status}   ERROR                   │
  │                                 │
  │   $ echo $?                     │
  │   ${status}                            │
  │                                 │
  └─────────────────────────────────┘`,
			hint: message
		}
	);
</script>

<svelte:head>
	<title>{errorInfo.title} | Brandon Wie</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center bg-terminal-bg-primary p-4 font-mono">
	<!-- ASCII art error box -->
	<pre class="text-terminal-accent-red text-sm md:text-base">{errorInfo.ascii}</pre>

	<!-- Error message -->
	<p class="mt-6 text-terminal-text-muted">{errorInfo.hint}</p>

	<!-- Navigation options -->
	<div class="mt-8 flex gap-4">
		<a
			href="/"
			class="rounded border border-terminal-border bg-terminal-bg-secondary px-4 py-2 text-terminal-text-primary transition-colors hover:border-terminal-accent-green hover:text-terminal-accent-green"
		>
			cd ~
		</a>
		<button
			onclick={() => history.back()}
			class="rounded border border-terminal-border bg-terminal-bg-secondary px-4 py-2 text-terminal-text-primary transition-colors hover:border-terminal-accent-orange hover:text-terminal-accent-orange"
		>
			cd -
		</button>
	</div>

	<!-- Terminal prompt hint -->
	<p class="mt-8 text-xs text-terminal-text-dim">
		<span class="text-terminal-accent-green">visitor@brandonwie.dev</span>:<span class="text-terminal-accent-blue">~</span>$
		<span class="animate-pulse">_</span>
	</p>
</div>
