'use client';

import type { MouseEvent } from 'react';

import { AppLink } from '@/components/AppLink';
import { PostCard, type PostCardPost } from '@/components/PostCard';
import { TerminalHero } from '@/components/TerminalHero';
import { TypedText } from '@/components/TypedText';
import { homeCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { homeJsonLd } from '@/seo/metadata';
import { SITE_AUTHOR } from '../../../src/lib/seo';

export interface BlogHomeProps {
	posts: PostCardPost[];
	basePath?: string;
}

function handleCardGlow(event: MouseEvent<HTMLElement>) {
	const rect = event.currentTarget.getBoundingClientRect();
	event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
}

export function BlogHome({ posts, basePath = '/' }: BlogHomeProps) {
	const recentPosts = posts.slice(0, 10);
	const locale: Locale = basePath === '/ko' ? 'ko' : 'en';
	const copy = homeCopy(locale);
	const authorNameParts = SITE_AUTHOR.split(' ');
	const postCount = posts.length;

	function withBase(path: string): string {
		const base = basePath === '/' ? '' : basePath;
		return `${base}${path}`;
	}

	const postHref = (slug: string) => withBase(`/posts/${slug}`);
	const allPostsHref = withBase('/posts');
	const aboutHref = withBase('/about');
	const projectsHref = withBase('/projects');
	const systemHref = withBase('/system/3b');

	return (
		<main id="main-content" className="home">
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: homeJsonLd(locale) }} />

			{/* HERO — terminal window panel */}
			<section className="home__hero">
				<TerminalHero title="brandon@moba: ~/whoami" prompt="whoami --verbose">
					<div className="hero__typed">
						<TypedText text={copy.tagline} />
					</div>
					<h1 className="hero__name" aria-label={SITE_AUTHOR}>
						{authorNameParts.map((namePart) => (
							<span key={namePart} className="hero__name-gradient" aria-hidden="true">
								{namePart}
							</span>
						))}
					</h1>
					<p className="hero__desc">{copy.bio}</p>
					<div className="hero__cta">
						<AppLink className="hero__btn hero__btn--solid" href={projectsHref}>
							{copy.projects} →
						</AppLink>
						<AppLink className="hero__btn" href={allPostsHref}>
							{copy.posts}
						</AppLink>
						<AppLink className="hero__btn" href={aboutHref}>
							{copy.about}
						</AppLink>
					</div>
					<dl className="hero-stats" aria-label={copy.heroStatsLabel}>
						<div className="hero-stat">
							<dt className="hero-stat__label">{copy.heroStatEventsLabel}</dt>
							<dd className="hero-stat__value">
								7<span className="hero-stat__accent">M</span>
							</dd>
						</div>
						<div className="hero-stat">
							<dt className="hero-stat__label">{copy.heroStatPostsLabel}</dt>
							<dd className="hero-stat__value">{postCount}</dd>
						</div>
						<div className="hero-stat">
							<dt className="hero-stat__label">{copy.heroStatServicesLabel}</dt>
							<dd className="hero-stat__value">6</dd>
						</div>
						<div className="hero-stat">
							<dt className="hero-stat__label">{copy.heroStatLanguagesLabel}</dt>
							<dd className="hero-stat__value">EN/KR</dd>
						</div>
					</dl>
				</TerminalHero>
			</section>

			{/* WORK */}
			<section className="home__sec">
				<div className="sec-head">
					<span className="sec-head__hash">#</span>
					<h2 className="sec-head__title">{copy.workSection}</h2>
					<span className="sec-head__grow" />
				</div>
				<div className="work-grid">
					<a
						className="work-card"
						href="https://www.archcalendar.com"
						target="_blank"
						rel="noopener noreferrer"
						onMouseMove={handleCardGlow}
					>
						<div className="work-card__top">
							<span className="work-card__eyebrow">{copy.archcalendarSubtitle}</span>
							<span className="work-card__ix">01</span>
						</div>
						<h3 className="work-card__title">Arch Calendar</h3>
						<p className="work-card__desc">{copy.archcalendarDescription}</p>
						<span className="work-card__go">visit ↗</span>
					</a>

					<AppLink className="work-card" href={systemHref} onMouseMove={handleCardGlow}>
						<div className="work-card__top">
							<span className="work-card__eyebrow">{copy.system3bCardSubtitle}</span>
							<span className="work-card__ix">02</span>
						</div>
						<h3 className="work-card__title">{copy.system3bTitle}</h3>
						<p className="work-card__desc">{copy.system3bCardDescription}</p>
						<span className="work-card__go">system map →</span>
					</AppLink>

					<a
						className="work-card"
						href="https://crucio.brandonwie.dev"
						target="_blank"
						rel="noopener noreferrer"
						onMouseMove={handleCardGlow}
					>
						<div className="work-card__top">
							<span className="work-card__eyebrow">{copy.portfolioSubtitle}</span>
							<span className="work-card__ix">03</span>
						</div>
						<h3 className="work-card__title">Project Crucio</h3>
						<p className="work-card__desc">{copy.portfolioDescription}</p>
						<span className="work-card__go">visit ↗</span>
					</a>
				</div>
			</section>

			{/* RECENT POSTS */}
			<section className="home__sec">
				<div className="sec-head">
					<span className="sec-head__hash">#</span>
					<h2 className="sec-head__title">{copy.recentPosts}</h2>
					<span className="sec-head__grow" />
					{posts.length > 10 ? (
						<AppLink className="sec-head__meta" href={allPostsHref}>
							{copy.seeAllPosts(posts.length)} →
						</AppLink>
					) : null}
				</div>

				{recentPosts.length === 0 ? (
					<p className="home__empty">{copy.noPosts}</p>
				) : (
					<div className="card-grid">
						{recentPosts.map((post) => (
							<PostCard key={post.slug} post={post} href={postHref(post.slug)} locale={locale} />
						))}
					</div>
				)}
			</section>
		</main>
	);
}
