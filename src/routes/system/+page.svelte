<script lang="ts">
	import { m } from '$lib/paraglide/messages';
</script>

<svelte:head>
	<title>{m.system_3b_title()} | Brandon Wie</title>
	<meta name="description" content={m.system_3b_meta_description()} />
</svelte:head>

<main class="min-h-screen bg-terminal-bg-primary text-terminal-text-primary">
	<section class="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-16 sm:px-6">
		<p class="mb-3 text-xs uppercase text-terminal-text-dim">{m.system_3b_subtitle()}</p>
		<h1 class="mb-4 text-2xl font-semibold text-terminal-accent-orange">{m.system_3b_title()}</h1>
		<p class="mb-8 max-w-xl text-sm leading-6 text-terminal-text-muted">
			{m.system_3b_index_intro()}
		</p>
		<a
			href="/system/3b"
			class="text-sm font-semibold text-terminal-text-primary no-underline transition-colors hover:text-terminal-accent-orange"
		>
			{m.system_3b_open_hub()} →
		</a>
	</section>
</main>
