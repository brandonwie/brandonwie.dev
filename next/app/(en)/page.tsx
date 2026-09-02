import { SLICE_1_ARTICLE_SLUG, articlePath } from '../../src/content/article-contract';

export default function Home() {
	return (
		<section className="home-panel" aria-labelledby="home-title">
			<p>~/brandonwie.dev</p>
			<h1 id="home-title">Brandon Wie</h1>
			<p>Engineering notes on dependable software, AI systems, and the work between them.</p>
			<a className="home-link" href={articlePath(SLICE_1_ARTICLE_SLUG, 'en')}>
				Read the representative article
			</a>
		</section>
	);
}
