<script lang="ts">
	/**
	 * AwsAiPractitionerStudyPage — shared EN/KO page for the AWS Certified AI
	 * Practitioner cram sheet. Static comparison cards with section jump links
	 * and a print stylesheet; all copy comes from `study-aws-ai-practitioner.ts`.
	 */
	import StudyPageShell from '$lib/components/study/StudyPageShell.svelte';
	import StudySeoHead from '$lib/components/study/StudySeoHead.svelte';
	import type { StudyLocale } from '$lib/data/study';
	import {
		getAwsAiPractitionerContent,
		type AwsCard,
		type AwsTerm,
		type AwsTone,
	} from '$lib/data/study-aws-ai-practitioner';

	let { locale = 'en' }: { locale?: StudyLocale } = $props();

	const content = $derived(getAwsAiPractitionerContent(locale));
	const pageTitle = $derived(`${content.metaTitle} | Brandon Wie`);
	const basePath = $derived(locale === 'ko' ? '/ko' : '');
	const insideLinks = $derived(
		[...content.sections, content.traps].map((section) => ({
			href: `#${section.id}`,
			label: section.kicker,
		})),
	);

	// Literal class strings so Tailwind can see every variant.
	const span: Record<AwsCard['span'], string> = {
		4: 'lg:col-span-4',
		5: 'lg:col-span-5',
		6: 'lg:col-span-6',
		7: 'lg:col-span-7',
		8: 'lg:col-span-8',
		12: 'lg:col-span-12',
	};
	const columns: Record<2 | 3 | 4, string> = {
		2: 'sm:grid-cols-2',
		3: 'sm:grid-cols-3',
		4: 'sm:grid-cols-2 xl:grid-cols-4',
	};
	const toneBorder: Record<AwsTone | 'base', string> = {
		base: 'border-foam',
		warn: 'border-gold',
		violet: 'border-iris',
		teal: 'border-pine',
	};
	const toneText: Record<AwsTone | 'base', string> = {
		base: 'text-foam',
		warn: 'text-gold',
		violet: 'text-iris',
		// NOTE: 'teal' uses text-foam (not text-pine) because text-pine fails WCAG AA
		// contrast on dark bg. Un-toned cards use text-ink, so text-foam still distinguishes teal cards.
		teal: 'text-foam',
	};
	const tagTone: Record<AwsTone | 'base', string> = {
		base: 'border-line text-muted',
		warn: 'border-gold/50 text-gold',
		violet: 'border-iris/50 text-iris',
		teal: 'border-foam/50 text-foam',
	};
</script>

<StudySeoHead
	{pageTitle}
	description={content.metaDescription}
	basePath="/study/aws-ai-practitioner"
	{locale}
/>

{#snippet secHead(kicker: string, title: string, note: string)}
	<div class="mb-5 flex flex-wrap items-end gap-x-3.5 gap-y-2">
		<div>
			<p class="font-mono text-xs uppercase tracking-wider text-foam">{kicker}</p>
			<h2 class="mt-1 font-sans text-xl font-semibold tracking-tight text-ink">{title}</h2>
		</div>
		<span class="mb-2.5 hidden h-px flex-1 bg-line2 sm:block"></span>
		<p class="font-mono text-xs text-faint">{note}</p>
	</div>
{/snippet}

{#snippet term(item: AwsTerm)}
	<div class="min-w-0 border-l-2 bg-bg px-3 py-2.5 {toneBorder[item.tone ?? 'base']}">
		<p class="font-sans text-sm font-semibold text-ink">{item.term}</p>
		{#if item.detail}
			<p class="mt-0.5 text-xs leading-5 text-muted">{item.detail}</p>
		{/if}
		{#if item.signal}
			<p class="mt-1 font-mono text-[11px] leading-5 {toneText[item.tone ?? 'base']}">
				{item.signal}
			</p>
		{/if}
		{#if item.example}
			<p class="mt-1 text-xs italic leading-5 text-faint">{item.example}</p>
		{/if}
	</div>
{/snippet}

{#snippet layer(layers: AwsTerm[], index: number)}
	<div class="border border-line2 bg-bg p-3">
		<p class="text-sm leading-6">
			<span class="font-mono font-bold text-foam">{layers[index].term}</span>
			<span class="text-xs text-muted">{layers[index].detail}</span>
		</p>
		{#if index + 1 < layers.length}
			<div class="mt-2">{@render layer(layers, index + 1)}</div>
		{/if}
	</div>
{/snippet}

<StudyPageShell>
	<div data-aws-study>
		<div
			class="mb-8 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.12em] text-faint"
		>
			<a href={basePath || '/'} class="transition-colors hover:text-foam">~</a>
			<span class="text-line2">/</span>
			<a href="{basePath}/study" class="transition-colors hover:text-foam">study</a>
			<span class="text-line2">/</span>
			<span>aws-ai-practitioner</span>
		</div>

		<section class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
			<div>
				<p class="font-mono text-xs font-semibold uppercase tracking-wider text-faint">
					{content.eyebrow}
				</p>
				<h1
					class="mt-4 max-w-4xl font-sans text-3xl font-bold leading-tight tracking-tight text-ink sm:text-5xl"
				>
					{content.title}
				</h1>
				<p class="mt-6 max-w-3xl font-sans text-lg leading-8 text-muted">{content.subtitle}</p>
				<p
					class="mt-5 inline-flex items-center gap-2 border border-foam/50 px-2.5 py-1 font-mono text-xs text-foam"
				>
					<span aria-hidden="true">✓</span>{content.passNote}
				</p>
			</div>
			<aside class="study-card p-5" data-print-hide>
				<p class="font-mono text-xs uppercase tracking-wider text-faint">
					{content.labels.inside}
				</p>
				<ul class="mt-4 grid gap-2">
					{#each insideLinks as link (link.href)}
						<li>
							<a
								href={link.href}
								class="flex items-center gap-2 font-mono text-sm text-muted no-underline transition-colors hover:text-foam"
							>
								<span class="text-foam">▸</span>{link.label}
							</a>
						</li>
					{/each}
				</ul>
				<button
					type="button"
					class="study-btn focus-terminal mt-5 w-full font-mono"
					onclick={() => window.print()}
				>
					{content.labels.print}
				</button>
			</aside>
		</section>

		{#each content.sections as section (section.id)}
			<section id={section.id} class="mt-16 scroll-mt-24">
				{@render secHead(section.kicker, section.title, section.note)}
				<div class="grid gap-4 lg:grid-cols-12">
					{#each section.cards as card (card.title)}
						<article class="study-card min-w-0 p-5 {span[card.span]}">
							<h3
								class="font-sans text-lg font-semibold {card.tone
									? toneText[card.tone]
									: 'text-ink'}"
							>
								{card.title}
							</h3>
							{#if card.subtitle}
								<p class="mt-1 font-mono text-xs text-faint">{card.subtitle}</p>
							{/if}
							{#if card.definition}
								<p class="mt-2 text-sm leading-6 text-muted">{card.definition}</p>
							{/if}
							<div class="mt-4 grid gap-3">
								{#each card.blocks as block, blockIndex (blockIndex)}
									{#if block.kind === 'hierarchy'}
										{@render layer(block.layers, 0)}
									{:else if block.kind === 'compare'}
										<div class="grid gap-2 {columns[block.columns]}">
											{#each block.items as item, itemIndex (itemIndex)}
												{@render term(item)}
											{/each}
										</div>
									{:else if block.kind === 'services'}
										<div
											class="grid gap-2 {block.columns === 4
												? 'sm:grid-cols-2 xl:grid-cols-4'
												: 'sm:grid-cols-2'}"
										>
											{#each block.items as service (service.name)}
												<div class="min-w-0 border border-line bg-bg p-3">
													<p class="text-sm font-semibold text-ink">{service.name}</p>
													<p class="text-xs leading-5 text-muted">{service.role}</p>
													<p class="mt-2 font-mono text-[11px] leading-5 text-foam">
														▸ {service.trigger}
													</p>
													<p class="mt-1 text-xs italic leading-5 text-faint">{service.example}</p>
												</div>
											{/each}
										</div>
									{:else if block.kind === 'flow'}
										<ol class="flex flex-wrap items-center gap-2">
											{#each block.steps as step, stepIndex (stepIndex)}
												<li class="flex min-w-0 items-center gap-2">
													<div class="min-w-0 border border-line bg-bg px-3 py-2">
														<p class="text-sm font-semibold text-ink">{step.term}</p>
														{#if step.detail}
															<p class="text-xs leading-5 text-muted">{step.detail}</p>
														{/if}
													</div>
													{#if block.joins[stepIndex]}
														<span aria-hidden="true" class="font-mono text-faint">
															{block.joins[stepIndex]}
														</span>
													{/if}
												</li>
											{/each}
										</ol>
									{:else if block.kind === 'tags'}
										<ul class="flex flex-wrap gap-2">
											{#each block.tags as tag (tag.text)}
												<li
													class="border px-2 py-1 font-mono text-[11px] leading-5 {tagTone[
														tag.tone ?? 'base'
													]}"
												>
													{tag.text}
												</li>
											{/each}
										</ul>
									{:else if block.kind === 'note'}
										<p class="font-mono text-xs leading-5 text-faint">{block.text}</p>
									{/if}
								{/each}
							</div>
						</article>
					{/each}
				</div>
			</section>
		{/each}

		<section id={content.traps.id} class="mt-16 scroll-mt-24">
			{@render secHead(content.traps.kicker, content.traps.title, content.traps.note)}
			<dl class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each content.traps.items as trap (trap.signal)}
					<div class="study-card flex min-w-0 flex-col gap-1 p-3">
						<dt class="text-sm leading-6 text-muted">{trap.signal}</dt>
						<dd class="font-mono text-sm leading-6 text-foam">→ {trap.pick}</dd>
					</div>
				{/each}
			</dl>
		</section>

		<section class="mt-16 study-card p-5">
			<p class="font-mono text-xs uppercase tracking-wider text-faint">{content.labels.sources}</p>
			<p class="mt-3 max-w-3xl text-sm leading-7 text-muted">{content.sourceNote}</p>
		</section>
	</div>
</StudyPageShell>

<style>
	/* Print: light, ink-friendly tokens; site chrome and the jump/print aside hidden. */
	@media print {
		:global(html:has([data-aws-study])) {
			--bg: #ffffff !important;
			--surface: #ffffff !important;
			--ink: #111111 !important;
			--muted: #333333 !important;
			--faint: #555555 !important;
			--line: #cccccc !important;
			--line2: #cccccc !important;
			--foam: #286983 !important;
			--pine: #286983 !important;
			--gold: #8a5300 !important;
			--iris: #5f4b82 !important;
			color-scheme: light;
		}
		:global(body:has([data-aws-study]) .site-nav),
		:global(body:has([data-aws-study]) .site-footer),
		:global([data-aws-study] [data-print-hide]) {
			display: none !important;
		}
		:global([data-aws-study] article),
		:global([data-aws-study] dl > div) {
			break-inside: avoid;
		}
	}
</style>
