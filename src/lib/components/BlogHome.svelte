<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { PostMetadata } from '$lib/stores/posts';
	import { formatDateShort, effectiveDate } from '$lib/utils/date';
	import TerminalHero from '$lib/components/TerminalHero.svelte';
	import TypedText from '$lib/components/TypedText.svelte';
	import { cardGlow } from '$lib/actions/cardGlow';
	import {
		absoluteUrl,
		DEFAULT_OG_IMAGE,
		localeCode,
		SITE_AUTHOR,
		SITE_NAME,
		SITE_URL,
	} from '$lib/seo';

	let { posts, basePath = '/' }: { posts: PostMetadata[]; basePath?: string } = $props();

	const recentPosts = $derived(posts.slice(0, 10));
	const locale = $derived(basePath === '/ko' ? 'ko' : 'en');
	const canonicalHref = $derived(absoluteUrl(locale === 'ko' ? '/ko' : '/'));
	const pageTitle = $derived(m.site_title());
	const pageDescription = $derived(m.site_description());
	const authorNameParts = SITE_AUTHOR.split(' ');
	const postCount = $derived(posts.length);
	const jsonLd = $derived(
		JSON.stringify([
			{
				'@context': 'https://schema.org',
				'@type': 'WebSite',
				name: SITE_NAME,
				url: SITE_URL,
				description: pageDescription,
				inLanguage: locale === 'ko' ? 'ko-KR' : 'en-US',
				publisher: {
					'@type': 'Person',
					name: SITE_AUTHOR,
					url: SITE_URL,
				},
			},
			{
				'@context': 'https://schema.org',
				'@type': 'Person',
				name: SITE_AUTHOR,
				url: SITE_URL,
				jobTitle: 'Software Engineer',
				sameAs: [
					'https://github.com/brandonwie',
					'https://linkedin.com/in/brandonwie',
					'https://x.com/BrandonWie',
				],
			},
		]),
	);

	function withBase(path: string): string {
		const base = basePath === '/' ? '' : basePath;
		return `${base}${path}`;
	}
	const postHref = (slug: string) => withBase(`/posts/${slug}`);
	const allPostsHref = () => withBase('/posts');
	const aboutHref = () => withBase('/about');
	const projectsHref = () => withBase('/projects');
	const systemHref = () => withBase('/system/3b');
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={canonicalHref} />
	<link rel="alternate" hreflang="en" href={absoluteUrl('/')} />
	<link rel="alternate" hreflang="ko" href={absoluteUrl('/ko')} />
	<link rel="alternate" hreflang="x-default" href={absoluteUrl('/')} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:url" content={canonicalHref} />
	<meta property="og:image" content={DEFAULT_OG_IMAGE} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:locale" content={localeCode(locale)} />
	<meta property="og:locale:alternate" content={localeCode(locale === 'ko' ? 'en' : 'ko')} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
	<meta name="twitter:image" content={DEFAULT_OG_IMAGE} />
	<meta name="twitter:creator" content="@BrandonWie" />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<script type="application/ld+json">${jsonLd}\x3C/script>`}
</svelte:head>

<main id="main-content" class="home">
	<!-- HERO — terminal window panel -->
	<section class="home__hero">
		<TerminalHero title="brandon@moba: ~/whoami" prompt="whoami --verbose">
			<div class="hero__typed"><TypedText text={m.blog_tagline()} /></div>
			<h1 class="hero__name" aria-label={SITE_AUTHOR}>
				{#each authorNameParts as namePart (namePart)}
					<span class="hero__name-gradient" aria-hidden="true">{namePart}</span>
				{/each}
			</h1>
			<p class="hero__desc">{m.blog_bio()}</p>
			<div class="hero__cta">
				<a class="hero__btn hero__btn--solid" href={projectsHref()}>{m.palette_nav_projects()} →</a>
				<a class="hero__btn" href={allPostsHref()}>{m.palette_nav_posts()}</a>
				<a class="hero__btn" href={aboutHref()}>{m.palette_nav_about()}</a>
			</div>
			<dl class="hero-stats" aria-label={m.hero_stats_label()}>
				<div class="hero-stat">
					<dt class="hero-stat__label">{m.hero_stat_events_label()}</dt>
					<dd class="hero-stat__value">7<span class="hero-stat__accent">M</span></dd>
				</div>
				<div class="hero-stat">
					<dt class="hero-stat__label">{m.hero_stat_posts_label()}</dt>
					<dd class="hero-stat__value">{postCount}</dd>
				</div>
				<div class="hero-stat">
					<dt class="hero-stat__label">{m.hero_stat_services_label()}</dt>
					<dd class="hero-stat__value">6</dd>
				</div>
				<div class="hero-stat">
					<dt class="hero-stat__label">{m.hero_stat_languages_label()}</dt>
					<dd class="hero-stat__value">EN/KR</dd>
				</div>
			</dl>
		</TerminalHero>
	</section>

	<!-- WORK -->
	<section class="home__sec">
		<div class="sec-head">
			<span class="sec-head__hash">#</span>
			<h2 class="sec-head__title">{m.work_section()}</h2>
			<span class="sec-head__grow"></span>
		</div>
		<div class="work-grid">
			<a
				class="work-card"
				href="https://www.archcalendar.com"
				target="_blank"
				rel="noopener noreferrer"
				use:cardGlow
			>
				<div class="work-card__top">
					<span class="work-card__eyebrow">{m.archcalendar_subtitle()}</span>
					<span class="work-card__ix">01</span>
				</div>
				<h3 class="work-card__title">Arch Calendar</h3>
				<p class="work-card__desc">{m.archcalendar_description()}</p>
				<span class="work-card__go">visit ↗</span>
			</a>

			<a class="work-card" href={systemHref()} use:cardGlow>
				<div class="work-card__top">
					<span class="work-card__eyebrow">{m.system_3b_card_subtitle()}</span>
					<span class="work-card__ix">02</span>
				</div>
				<h3 class="work-card__title">{m.system_3b_title()}</h3>
				<p class="work-card__desc">{m.system_3b_card_description()}</p>
				<span class="work-card__go">system map →</span>
			</a>

			<a
				class="work-card"
				href="https://crucio.brandonwie.dev"
				target="_blank"
				rel="noopener noreferrer"
				use:cardGlow
			>
				<div class="work-card__top">
					<span class="work-card__eyebrow">{m.portfolio_subtitle()}</span>
					<span class="work-card__ix">03</span>
				</div>
				<h3 class="work-card__title">Project Crucio</h3>
				<p class="work-card__desc">{m.portfolio_description()}</p>
				<span class="work-card__go">visit ↗</span>
			</a>
		</div>
	</section>

	<!-- RECENT POSTS -->
	<section class="home__sec">
		<div class="sec-head">
			<span class="sec-head__hash">#</span>
			<h2 class="sec-head__title">{m.recent_posts()}</h2>
			<span class="sec-head__grow"></span>
			{#if posts.length > 10}
				<a class="sec-head__meta" href={allPostsHref()}
					>{m.see_all_posts({ count: posts.length })} →</a
				>
			{/if}
		</div>

		{#if recentPosts.length === 0}
			<p class="home__empty">{m.no_posts()}</p>
		{:else}
			<div class="log">
				{#each recentPosts as post (post.slug)}
					<a class="log-row" href={postHref(post.slug)}>
						<time class="log-row__date" datetime={effectiveDate(post.date, post.updated)}>
							{formatDateShort(effectiveDate(post.date, post.updated))}
						</time>
						<span class="log-row__title">{post.title}</span>
						<span class="log-row__tags">
							{#each (post.tags ?? []).slice(0, 2) as tag (tag)}
								<span class="log-row__tag">{tag}</span>
							{/each}
						</span>
					</a>
				{/each}
			</div>
		{/if}
	</section>
</main>

<style>
	.home {
		box-sizing: border-box;
		width: 100%;
		max-width: 72rem;
		margin: 0 auto;
		padding: 0 1.5rem;
	}

	/* hero */
	.home__hero {
		width: 100%;
		max-width: 100%;
		padding: 40px 0 16px;
	}
	.hero__typed {
		min-width: 0;
		max-width: 100%;
		min-height: 22px;
		margin-bottom: 26px;
		overflow-wrap: anywhere;
	}
	.hero__name {
		display: flex;
		flex-wrap: wrap;
		column-gap: 0.24em;
		margin: 6px 0 18px;
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: 72px;
		line-height: 1.08;
		letter-spacing: 0;
		color: var(--ink);
	}
	.hero__name-gradient {
		background: linear-gradient(100deg, var(--foam), var(--iris) 52%, var(--rose));
		-webkit-background-clip: text;
		background-clip: text;
		color: var(--ink);
		-webkit-box-decoration-break: clone;
		box-decoration-break: clone;
	}
	@supports ((background-clip: text) or (-webkit-background-clip: text)) {
		.hero__name-gradient {
			color: transparent;
			-webkit-text-fill-color: transparent;
		}
	}
	.hero__desc {
		min-width: 0;
		max-width: 60ch;
		font-family: var(--font-sans);
		font-size: clamp(16px, 2vw, 20px);
		line-height: 1.55;
		color: var(--muted);
		overflow-wrap: break-word;
	}
	.hero__cta {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 28px;
	}
	.hero__btn {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		padding: 12px 18px;
		border: 1px solid var(--line2);
		border-radius: 8px;
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--ink);
		text-decoration: none;
		transition:
			color 0.2s,
			border-color 0.2s,
			background-color 0.2s;
	}
	.hero__btn:hover {
		border-color: var(--foam);
		color: var(--foam);
	}
	.hero__btn--solid {
		border-color: var(--foam);
		background: var(--foam);
		color: var(--bg);
	}
	.hero__btn--solid:hover {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--bg);
	}
	.hero-stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 22px;
		margin: 34px 0 0;
		padding: 28px 0 0;
		border-top: 1px dashed var(--line2);
	}
	.hero-stat {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.hero-stat__value {
		order: -1;
		margin: 0;
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: 30px;
		line-height: 1;
		color: var(--ink);
	}
	.hero-stat__accent {
		color: var(--foam);
	}
	.hero-stat__label {
		margin-top: 7px;
		font-family: var(--font-mono);
		font-size: 11px;
		line-height: 1.35;
		letter-spacing: 0;
		text-transform: uppercase;
		color: var(--faint);
	}

	/* sections */
	.home__sec {
		width: 100%;
		max-width: 100%;
		padding: 48px 0;
		border-top: 1px solid var(--line);
	}
	.sec-head {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 28px;
	}
	.sec-head__hash {
		font-family: var(--font-mono);
		font-weight: 700;
		color: var(--foam);
	}
	.sec-head__title {
		font-family: var(--font-sans);
		font-weight: 600;
		font-size: clamp(20px, 3vw, 28px);
		letter-spacing: 0;
		color: var(--ink);
	}
	.sec-head__grow {
		flex: 1;
		height: 1px;
		background: var(--line2);
	}
	.sec-head__meta {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--muted);
		text-decoration: none;
	}
	.sec-head__meta:hover {
		color: var(--foam);
	}

	/* work cards */
	.work-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 18px;
	}
	.work-card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 12px;
		overflow: hidden;
		padding: 24px;
		border: 1px solid var(--line2);
		border-radius: 10px;
		background: color-mix(in srgb, var(--panel) 45%, transparent);
		text-decoration: none;
		transition:
			transform 0.3s,
			border-color 0.3s;
	}
	.work-card::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(
			420px circle at var(--mx, 50%) -10%,
			color-mix(in srgb, var(--foam) 10%, transparent),
			transparent 60%
		);
		opacity: 0;
		transition: opacity 0.3s;
		pointer-events: none;
	}
	.work-card:hover {
		transform: translateY(-4px);
		border-color: var(--foam);
	}
	.work-card:hover::before {
		opacity: 1;
	}
	.work-card__top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.work-card__eyebrow {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--iris);
	}
	.work-card__ix {
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--faint);
	}
	.work-card__title {
		font-family: var(--font-sans);
		font-weight: 600;
		font-size: 20px;
		line-height: 1.15;
		color: var(--ink);
	}
	.work-card__desc {
		flex: 1;
		font-family: var(--font-sans);
		font-size: 14px;
		line-height: 1.55;
		color: var(--muted);
	}
	.work-card__go {
		margin-top: auto;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--foam);
	}

	/* recent.log */
	.log {
		overflow: hidden;
		border: 1px solid var(--line2);
		border-radius: 10px;
		background: color-mix(in srgb, var(--bg2) 50%, transparent);
	}
	.log-row {
		display: grid;
		grid-template-columns: 104px 1fr auto;
		gap: 20px;
		align-items: center;
		padding: 16px 22px;
		border-top: 1px solid var(--line);
		text-decoration: none;
		transition: background-color 0.2s;
	}
	.log-row:first-child {
		border-top: none;
	}
	.log-row:hover {
		background: var(--overlay);
	}
	.log-row__date {
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--faint);
	}
	.log-row__title {
		font-family: var(--font-sans);
		font-size: 16px;
		font-weight: 500;
		color: var(--ink);
	}
	.log-row:hover .log-row__title {
		color: var(--foam);
	}
	.log-row__tags {
		display: flex;
		gap: 6px;
	}
	.log-row__tag {
		padding: 3px 7px;
		border: 1px solid var(--line);
		border-radius: 5px;
		font-family: var(--font-mono);
		font-size: 10px;
		white-space: nowrap;
		color: var(--faint);
	}

	.home__empty {
		color: var(--muted);
	}

	@media (max-width: 880px) {
		.hero__name {
			font-size: 56px;
		}
		.work-grid {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 720px) {
		.hero-stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.log-row {
			grid-template-columns: 1fr;
			gap: 6px;
		}
		.log-row__tags {
			display: none;
		}
	}
	@media (max-width: 560px) {
		.home {
			padding: 0 1rem;
		}
		.home__hero,
		.home__sec {
			max-width: calc(100vw - 2rem);
		}
		.hero__name {
			flex-direction: column;
			font-size: 42px;
			row-gap: 0;
		}
		.hero__name-gradient {
			width: fit-content;
		}
		.hero__typed,
		.hero__desc {
			max-width: 30ch;
		}
		.hero__cta {
			align-items: stretch;
			flex-direction: column;
			max-width: 20rem;
		}
		.hero__btn {
			justify-content: center;
			width: 100%;
		}
	}
	@media (max-width: 420px) {
		.hero-stats {
			grid-template-columns: 1fr;
		}
	}
</style>
