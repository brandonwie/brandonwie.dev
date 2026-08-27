/**
 * Slice 0 responsive probe — injected verbatim into /__viewport?w=&h=&u=.
 *
 * Chrome's window cannot be resized from the automation surface in use
 * (resize_window reports success; innerWidth does not change), so a responsive
 * state is captured in a same-origin iframe sized in exact CSS pixels. Media
 * queries inside a frame evaluate against the frame's own box, which is the
 * property under test. Documented in verification/thresholds.md.
 *
 * Reports what the frame actually rendered, so a claim about a breakpoint is
 * backed by the frame's own matchMedia result rather than by a screenshot.
 */
globalThis.__frameProbe = async () => {
	const frame = document.getElementById('frame');
	if (!frame) throw new Error('no #frame — is this /__viewport?');
	if (!frame.contentWindow?.document || frame.contentWindow.document.readyState !== 'complete') {
		await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
	}
	const view = frame.contentWindow;
	const doc = view.document;
	const mq = (query) => view.matchMedia(query).matches;

	return {
		frameBox: [frame.clientWidth, frame.clientHeight],
		frameViewport: [view.innerWidth, view.innerHeight],
		url: view.location.pathname,
		title: doc.title,
		lang: doc.documentElement.lang,
		colorScheme: getComputedStyle(doc.documentElement).colorScheme,
		theme: doc.documentElement.getAttribute('data-theme'),
		breakpoints: {
			'max-640': mq('(max-width: 640px)'),
			'min-768': mq('(min-width: 768px)'),
			'min-1024': mq('(min-width: 1024px)'),
			'min-1280': mq('(min-width: 1280px)'),
		},
		horizontalOverflow: doc.documentElement.scrollWidth > view.innerWidth + 1,
		scrollWidth: doc.documentElement.scrollWidth,
		headings: [...doc.querySelectorAll('h1,h2,h3')]
			.slice(0, 12)
			.map((h) => h.tagName + ' ' + h.textContent.trim().slice(0, 60)),
		focusableCount: doc.querySelectorAll(
			'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
		).length,
		imagesMissingAlt: [...doc.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length,
		images: (() => {
			const all = [...doc.querySelectorAll('img')];
			return {
				total: all.length,
				loaded: all.filter((i) => i.complete && i.naturalWidth > 0).length,
				lazy: all.filter((i) => i.loading === 'lazy').length,
			};
		})(),
		fonts: doc.fonts ? doc.fonts.status : null,
		// A control is named by aria-label, aria-labelledby, title, its own text,
		// the alt text of an image inside it, OR an associated <label>. The last
		// one was missing in the first run and reported /search's named input as
		// unnamed: a false positive against the site, found by chasing the count.
		controlsMissingName: [...doc.querySelectorAll('a[href],button,input,select,textarea')].filter(
			(el) => {
				const name = (
					el.getAttribute('aria-label') ||
					el.getAttribute('title') ||
					el.textContent ||
					''
				).trim();
				const labelled = el.getAttribute('aria-labelledby');
				const alt = el.querySelector?.('img[alt]')?.getAttribute('alt')?.trim();
				const labelText = [...(el.labels ?? [])]
					.map((l) => l.textContent.trim())
					.filter(Boolean)
					.join(' ');
				return !name && !labelled && !alt && !labelText;
			},
		).length,
	};
};
