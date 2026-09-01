/**
 * Slice 0 capture helper — injected into /__viewport before a screenshot.
 *
 * The automation window never becomes visible (document.visibilityState stays
 * "hidden"), so Chrome does not run the lazy-load pass and every
 * loading="lazy" image stays unfetched: a screenshot of a card grid shows empty
 * boxes that are not what a real visitor sees. This flips lazy to eager inside
 * the frame and waits for the images to decode, so the screenshot shows the
 * rendered page.
 *
 * It changes the page under test on purpose, and only for the visual capture.
 * The counts it returns are the evidence that it did: `lazyBefore` is the
 * page's real lazy-image count, which is itself a migration contract (the
 * candidate must not regress it).
 */
globalThis.__forceImages = async (timeoutMs = 8000) => {
	const frame = document.getElementById('frame');
	if (!frame) throw new Error('no #frame — is this /__viewport?');
	const doc = frame.contentWindow.document;
	const images = [...doc.querySelectorAll('img')];
	const lazyBefore = images.filter((i) => i.loading === 'lazy').length;

	for (const image of images) {
		image.loading = 'eager';
		if (image.decoding === 'async') image.decoding = 'sync';
	}

	const settled = Promise.all(
		images.map(
			(image) =>
				new Promise((resolve) => {
					if (image.complete && image.naturalWidth > 0) return resolve();
					image.addEventListener('load', resolve, { once: true });
					image.addEventListener('error', resolve, { once: true });
				}),
		),
	);
	await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);

	const loaded = images.filter((i) => i.complete && i.naturalWidth > 0);
	return {
		total: images.length,
		lazyBefore,
		loaded: loaded.length,
		failed: images.length - loaded.length,
		bytesHint: loaded.length ? undefined : 'none loaded — check the server and the paths',
	};
};
