import { DEFAULT_COVER, coverImage, heroImage } from '../../../src/lib/seo';

/**
 * The post hero block, emitted as HTML rather than JSX.
 *
 * Three attributes and one behavior on this element are load-bearing, and the
 * first port of the article lost all four:
 *
 *  - `width`/`height` are `2400`x`1260`, the intrinsic size of the generated
 *    file. They are what reserves the box before the bytes arrive. The `2000`x
 *    `800` first shipped here came from a stale docstring on `heroImage`, not
 *    from the markup that actually renders (`PostDetail.svelte:222-230`).
 *  - `fetchpriority="high"` and `decoding="async"` are the loading hints the
 *    baseline sets on its only above-the-fold image.
 *  - `onerror` walks a three-stage fallback: hero -> cover -> default cover,
 *    then stops. A post whose hero has not been generated yet still shows an
 *    image instead of a broken-image glyph, and that is a content-authoring
 *    affordance, not a nicety.
 *
 * It is a string because React cannot express the last one. An `onError` prop
 * belongs to a client component and renders NOTHING into static HTML, so the
 * fallback would not exist until hydration -- and a missing hero fails long
 * before that, during the initial image fetch. Lowercase `onerror` as a JSX
 * prop is dropped by React with a warning rather than emitted. An inline
 * handler in the served HTML runs without hydration and without shipping a
 * client bundle, which is strictly closer to the baseline's behavior than the
 * component version: SvelteKit's own `onerror="this.__e=event"` stub exists to
 * REPLAY exactly the pre-hydration error this handler acts on directly.
 *
 * The site serves no `Content-Security-Policy` (there is no `static/_headers`),
 * and the baseline already ships an inline handler on this same element, so
 * this introduces no new inline-script surface.
 */
export function heroBlockHtml(slug: string): string {
	const onError = [
		`var i=this,s=i.dataset.stage;`,
		`if(s==='default'){i.onerror=null;return}`,
		`if(s==='cover'){i.dataset.stage='default';i.src='${DEFAULT_COVER}';return}`,
		`i.dataset.stage='cover';i.src='${coverImage(slug)}'`,
	].join('');
	const img = [
		`<img src="${heroImage(slug)}"`,
		`alt=""`,
		`width="2400"`,
		`height="1260"`,
		`fetchpriority="high"`,
		`decoding="async"`,
		`onerror="${onError}"/>`,
	].join(' ');
	return `<div class="post__hero" data-pagefind-ignore="">${img}</div>`;
}
