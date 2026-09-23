import { Fragment } from 'react';

import { NotFoundEcho } from '@/components/NotFoundEcho';
import ShellPalette from '@/components/palette/ShellPalette';
import { shellCopy } from '@/i18n/copy';
import { palettePosts } from '@/palette/server-posts';
import { DocumentShell } from '@/shell/document';
import { SiteShell } from '@/shell/site-shell';

/** Block-letter 404: `█` in amber, `░` in the off ink. Decorative art. */
const ART = [
	'██░░░░██░░  ░░██████░░  ██░░░░██░░',
	'██░░░░██░░  ██░░░░░░██  ██░░░░██░░',
	'██████████  ██░░░░░░██  ██████████',
	'░░░░░░██░░  ██░░░░░░██  ░░░░░░██░░',
	'░░░░░░██░░  ░░██████░░  ░░░░░░██░░',
];

function artLine(line: string, row: number) {
	return line.split(/(░+)/).map((run, index) =>
		run.startsWith('░') ? (
			<span className="off" key={`${row}-${index}`}>
				{run}
			</span>
		) : (
			<Fragment key={`${row}-${index}`}>{run}</Fragment>
		),
	);
}

export default function GlobalNotFound() {
	return (
		<DocumentShell lang="en" title="Page not found | Brandon Wie" standaloneHead>
			{/* B3: the palette is mounted here on purpose. This is a server component,
			   so the controller is a deliberate addition to the 404's client code;
			   global-error stays palette-free. The title-bar props keep the
			   errorRoute contract (cwd `~`, no window, plain `en`). */}
			<SiteShell
				locale="en"
				errorRoute
				header={
					<ShellPalette
						locale="en"
						copy={shellCopy('en')}
						posts={palettePosts('en')}
						pinnedCwd="~"
						suppressLocaleToggle
					/>
				}
			>
				<div className="pg-nf">
					<NotFoundEcho />
					<div className="term-gap" />
					<section className="term-frame pg-nf__fail" aria-labelledby="not-found-title">
						<span className="term-frame__title" aria-hidden="true">
							stderr <span className="dim">· exit 404</span>
						</span>
						<div className="term-worn pg-nf__art-wrap">
							<pre className="pg-nf__art" role="img" aria-label="404">
								{ART.map((line, row) => (
									<Fragment key={row}>
										{artLine(line, row)}
										{row < ART.length - 1 ? '\n' : null}
									</Fragment>
								))}
							</pre>
						</div>
						<div className="pg-nf__text">
							<p className="term-eyebrow">404</p>
							<div className="term-worn pg-nf__ttl">
								<h1 id="not-found-title" className="term-ttl">
									Page not found
								</h1>
							</div>
							<p className="pg-nf__why">The requested page is not part of this static export.</p>
							<ul className="pg-nf__ways">
								<li>
									<a className="pg-nf__row" href="/">
										<span className="car" aria-hidden="true">
											&gt;
										</span>
										<span className="n" aria-hidden="true">
											[1]
										</span>
										<span className="pg-nf__name">Return home</span>
										<span className="arr" aria-hidden="true">
											-&gt;
										</span>
										<span className="val" aria-hidden="true">
											/
										</span>
									</a>
								</li>
							</ul>
							<p className="pg-nf__hint" aria-hidden="true">
								enter to open · or pick a window from the status line
							</p>
						</div>
					</section>
				</div>
			</SiteShell>
		</DocumentShell>
	);
}
