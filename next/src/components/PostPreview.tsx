import { PostCover, type PostListing } from '@/components/PostCard';

/**
 * PostPreview — the fzf-style preview pane beside the home `ls -lt` rows: the
 * post's cover (under the worn crossline), category, date, title and full
 * description.
 *
 * `aria-hidden` because it repeats the row it previews and the row links stay
 * the accessible path; for the same reason it holds no link or focusable
 * element (a focusable node inside `aria-hidden` is an a11y fault, and a second
 * `/posts/<slug>` href would also change the page's link order). The pane is
 * hidden below 768px.
 */
export function PostPreview({ post, index }: { post: PostListing; index: number }) {
	const ix = String(index + 1).padStart(2, '0');
	return (
		<div className="term-frame pg-home__pv" aria-hidden="true" data-preview-slug={post.slug}>
			<span className="term-frame__title">
				fzf --preview <span className="dim">· {ix}</span>
			</span>
			<PostCover key={post.slug} post={post} className="pg-home__cover term-worn" />
			<p className="pg-home__pv-meta">
				<span className="text-crt-amber">{post.category}</span>{' '}
				<span className="text-crt-faint">· {post.dateLabel}</span>
			</p>
			<p className="pg-home__pv-ti">{post.title}</p>
			{post.description ? <p className="pg-home__pv-ds">{post.description}</p> : null}
		</div>
	);
}
