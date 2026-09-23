'use client';

import { DocumentShell } from '@/shell/document';
import { SiteShell } from '@/shell/site-shell';
import { TermPrompt } from '@/shell/TermPrompt';

export default function GlobalError({
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<DocumentShell lang="en" title="Something went wrong | Brandon Wie" standaloneHead>
			<SiteShell locale="en" errorRoute>
				<div className="pg-nf">
					<TermPrompt cwd="~" command="render" />
					<div className="term-gap" />
					<section
						className="term-frame pg-nf__fail pg-nf__fail--error"
						aria-labelledby="error-title"
					>
						<span className="term-frame__title" aria-hidden="true">
							stderr <span className="dim">· exit 1</span>
						</span>
						<div className="pg-nf__text">
							<p className="term-eyebrow">Error</p>
							<div className="term-worn pg-nf__ttl">
								<h1 id="error-title" className="term-ttl">
									Something went wrong
								</h1>
							</div>
							<p className="pg-nf__why">
								The page could not be rendered. Try again or return home.
							</p>
							<ul className="pg-nf__ways">
								<li>
									<button type="button" className="pg-nf__btn" onClick={reset}>
										<span className="n" aria-hidden="true">
											[1]
										</span>{' '}
										Try again
									</button>
								</li>
								<li>
									<a className="pg-nf__row" href="/">
										<span className="car" aria-hidden="true">
											&gt;
										</span>
										<span className="n" aria-hidden="true">
											[2]
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
						</div>
					</section>
				</div>
			</SiteShell>
		</DocumentShell>
	);
}
