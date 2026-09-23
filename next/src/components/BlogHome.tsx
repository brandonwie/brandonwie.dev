import { AppLink } from '@/components/AppLink';
import { postListing, type PostCardPost } from '@/components/PostCard';
import { RecentPosts } from '@/components/RecentPosts';
import { TypedText } from '@/components/TypedText';
import { base } from '@/data/nav';
import { homeCopy } from '@/i18n/copy';
import type { Locale } from '@/i18n/locale';
import { homeJsonLd } from '@/seo/metadata';
import { TermPrompt } from '@/shell/TermPrompt';
import { cwdFor } from '@/shell/terminal-path';
import { SITE_AUTHOR } from '../../../src/lib/seo';

export interface BlogHomeProps {
	posts: PostCardPost[];
	basePath?: string;
}

/**
 * BlogHome — `/` and `/ko` as one Phosphor Fade terminal session.
 *
 * The old TerminalHero window is folded into the session as
 * `$ whoami --verbose` (typed tagline, the 32/40 h1 under the worn crossline —
 * the D5 exception — bio, calls to action, the stats `<dl>`); the work cards
 * become `$ ls -l ~/work` rows and the ten recent cards become
 * `$ ls -lt ~/posts | head -10` with a preview pane (RecentPosts). A server
 * component: only TypedText and RecentPosts hydrate.
 */
export function BlogHome({ posts, basePath = '/' }: BlogHomeProps) {
	const locale: Locale = basePath === '/ko' ? 'ko' : 'en';
	const copy = homeCopy(locale);
	const cwd = cwdFor(base(locale) || '/');
	const postCount = posts.length;

	const withBase = (path: string) => `${base(locale)}${path}`;
	const allPostsHref = withBase('/posts');
	const recentRows = posts.slice(0, 10).map((post) => ({
		...postListing(post, locale),
		href: withBase(`/posts/${post.slug}`),
	}));

	return (
		<div className="pg-home">
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: homeJsonLd(locale) }} />

			<p className="pg-home__motd">brandonwie.dev — {copy.pageDescription}</p>

			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="whoami" flags="--verbose" />
			<p className="pg-home__out">
				<TypedText text={copy.tagline} />
			</p>
			<div className="term-worn pg-home__h1">
				<h1 className="term-ttl pg-home__name" aria-label={SITE_AUTHOR}>
					{SITE_AUTHOR}
				</h1>
			</div>
			<p className="pg-home__bio">{copy.bio}</p>
			<p className="pg-home__cta">
				<AppLink className="term-lnk pg-home__go" href={withBase('/projects')}>
					{copy.projects} →
				</AppLink>
				<AppLink className="term-lnk" href={allPostsHref}>
					{copy.posts}
				</AppLink>
				<AppLink className="term-lnk" href={withBase('/about')}>
					{copy.about}
				</AppLink>
			</p>

			<div className="term-frame pg-home__stats-frame">
				<span className="term-frame__title" aria-hidden="true">
					{copy.heroStatsLabel}
				</span>
				<dl className="pg-home__stats" aria-label={copy.heroStatsLabel}>
					<div>
						<dt>{copy.heroStatEventsLabel}</dt>
						<dd>
							7<span className="text-crt-amber">M</span>
						</dd>
					</div>
					<div>
						<dt>{copy.heroStatPostsLabel}</dt>
						<dd>{postCount}</dd>
					</div>
					<div>
						<dt>{copy.heroStatServicesLabel}</dt>
						<dd>6</dd>
					</div>
					<div>
						<dt>{copy.heroStatLanguagesLabel}</dt>
						<dd>EN/KR</dd>
					</div>
				</dl>
			</div>

			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="ls -l ~/work" />
			<div className="term-frame pg-home__work">
				<h2 className="term-frame__title">
					{copy.workSection} <span className="dim">· 3</span>
				</h2>
				<a
					className="pg-home__row"
					href="https://www.archcalendar.com"
					target="_blank"
					rel="noopener noreferrer"
				>
					<span className="pg-home__perm" aria-hidden="true">
						lrwxr-xr-x
					</span>
					<span className="pg-home__ix" aria-hidden="true">
						01
					</span>
					<h3 className="pg-home__nm">
						Arch Calendar <span className="pg-home__sub">· {copy.archcalendarSubtitle}</span>
					</h3>
					<span className="pg-home__visit">visit ↗</span>
					<span className="pg-home__desc">{copy.archcalendarDescription}</span>
				</a>
				<AppLink className="pg-home__row" href={withBase('/system/3b')}>
					<span className="pg-home__perm" aria-hidden="true">
						drwxr-xr-x
					</span>
					<span className="pg-home__ix" aria-hidden="true">
						02
					</span>
					<h3 className="pg-home__nm">
						{copy.system3bTitle} <span className="pg-home__sub">· {copy.system3bCardSubtitle}</span>
					</h3>
					<span className="pg-home__visit">system map →</span>
					<span className="pg-home__desc">{copy.system3bCardDescription}</span>
				</AppLink>
				<a
					className="pg-home__row"
					href="https://crucio.brandonwie.dev"
					target="_blank"
					rel="noopener noreferrer"
				>
					<span className="pg-home__perm" aria-hidden="true">
						lrwxr-xr-x
					</span>
					<span className="pg-home__ix" aria-hidden="true">
						03
					</span>
					<h3 className="pg-home__nm">
						Project Crucio <span className="pg-home__sub">· {copy.portfolioSubtitle}</span>
					</h3>
					<span className="pg-home__visit">visit ↗</span>
					<span className="pg-home__desc">{copy.portfolioDescription}</span>
				</a>
			</div>

			<div className="term-gap" />
			<TermPrompt cwd={cwd} command="ls -lt ~/posts | head -10" />
			<RecentPosts
				rows={recentRows}
				heading={copy.recentPosts}
				total={postCount}
				seeAllLabel={copy.seeAllPosts(postCount)}
				seeAllHref={allPostsHref}
				emptyText={copy.noPosts}
			/>
		</div>
	);
}
