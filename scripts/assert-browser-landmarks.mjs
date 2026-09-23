/**
 * migration:browser:landmarks — navigation landmarks as Chrome exposes them.
 *
 * Reviewer round 3: at 375px Chrome exposed the tmux status line
 * (`<nav class="term-status" role="none">`) as an UNNAMED navigation landmark.
 * A presentational role is ignored on an element that is focusable or, as
 * here, a keyboard scroller once it overflows, so the markup looked fine and
 * the markup suites passed while screen readers heard a second nav. Only the
 * accessibility tree shows that, so this probe reads it
 * (`Accessibility.getFullAXTree`) at a phone and a desktop viewport and
 * requires, per route:
 *
 *   LM-01 named     every exposed navigation landmark has a non-empty name
 *   LM-02 unique    no two navigation landmarks share a name
 *   LM-03 primary   exactly one is named `primary_navigation` (EN/KO from
 *                   messages/), it sits in `header.term-bar` and holds the 8
 *                   header links
 *   LM-04 status    `.term-status` exists, and neither it nor any ancestor is
 *                   a navigation landmark
 *   LM-05 windows   the status-line links are in the tree, not ignored, and
 *                   focusable (at least the 5 fixed windows)
 *   LM-06 scroll    375px, `/`: the line overflows, and Tab onto its last
 *                   window scrolls that window into view inside the line
 *
 * `/talks/my-career` is measured in the browsing view (after Escape), where the
 * shell chrome is shown.
 *
 * Positive controls (must FAIL), driven by assert-browser-landmarks-controls.mjs:
 *   --nav-none   swaps `.term-status` for `<nav role="none">` with the same
 *                class and children (the reviewed defect)
 *   --dup-label  gives another nav the primary label
 *
 * Exit 0 pass, 1 assertion failed, 2 harness error, 3 SKIPPED (no browser).
 */
import { readFileSync } from 'node:fs';

import { launch, serve, ready, evaluate, findBrowser, until, EXIT } from './browser-probe.mjs';

const PRIMARY = {
	en: JSON.parse(readFileSync('messages/en.json', 'utf8')).primary_navigation,
	ko: JSON.parse(readFileSync('messages/ko.json', 'utf8')).primary_navigation,
};
const DECK = '/talks/my-career';
const ROUTES = [
	'/',
	'/ko/posts',
	'/posts/sync-token-invalidation-recovery',
	'/study/dsa-ii',
	'/system/3b',
	DECK,
	'/this-route-does-not-exist',
];
const VIEWPORTS = [
	{ width: 375, height: 812, mobile: true },
	{ width: 1280, height: 800, mobile: false },
];
const HEADER_LINKS = 8;
const FIXED_WINDOWS = 5;

const NAV_NONE = process.argv.includes('--nav-none');
const DUP_LABEL = process.argv.includes('--dup-label');

const locale = (route) => (route === '/ko' || route.startsWith('/ko/') ? 'ko' : 'en');

/** The defects, applied in-page after hydration (and after Escape on the deck). */
function defectScript(route) {
	const parts = [];
	if (NAV_NONE) {
		parts.push(`{
			const old = document.querySelector('.term-status');
			if (old) {
				const nav = document.createElement('nav');
				for (const a of old.attributes) nav.setAttribute(a.name, a.value);
				nav.setAttribute('role', 'none');
				while (old.firstChild) nav.appendChild(old.firstChild);
				old.replaceWith(nav);
			}
		}`);
	}
	if (DUP_LABEL) {
		parts.push(`{
			let other = [...document.querySelectorAll('nav')].find((n) => !n.closest('header.term-bar') && !n.matches('.term-status'));
			if (!other) {
				other = document.createElement('nav');
				other.innerHTML = '<a href="/">~</a>';
				document.querySelector('main')?.appendChild(other);
			}
			other.setAttribute('aria-label', ${JSON.stringify(PRIMARY[locale(route)])});
		}`);
	}
	return parts.length
		? `(() => { ${parts.join('\n')} return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))); })()`
		: null;
}

/** DOM facts about the node an AX node came from; `this` is the element. */
const DOM_FACTS = `function () {
	return JSON.stringify({
		tag: this.tagName ? this.tagName.toLowerCase() : '',
		cls: typeof this.className === 'string' ? this.className : '',
		inHeader: !!(this.closest && this.closest('header.term-bar')),
		status: !!(this.matches && (this.matches('.term-status') || this.closest('.term-status') || this.querySelector('.term-status'))),
		inStatus: !!(this.closest && this.closest('.term-status')),
	});
}`;

async function domFacts(page, backendNodeId) {
	if (!backendNodeId) return null;
	try {
		const { object } = await page.send('DOM.resolveNode', { backendNodeId });
		const { result } = await page.send('Runtime.callFunctionOn', {
			objectId: object.objectId,
			functionDeclaration: DOM_FACTS,
			returnByValue: true,
		});
		return JSON.parse(result.value);
	} catch {
		return null;
	}
}

async function snapshot(page) {
	await page.send('DOM.getDocument', { depth: -1 });
	const { nodes } = await page.send('Accessibility.getFullAXTree', {});
	const byId = new Map(nodes.map((n) => [n.nodeId, n]));
	const role = (n) => n?.role?.value ?? '';
	const exposed = (n) => n && !n.ignored;
	const descendants = (n) => {
		const out = [];
		const stack = [...(n.childIds ?? [])];
		while (stack.length) {
			const c = byId.get(stack.pop());
			if (!c) continue;
			out.push(c);
			stack.push(...(c.childIds ?? []));
		}
		return out;
	};

	const navs = [];
	for (const n of nodes) {
		if (!exposed(n) || role(n) !== 'navigation') continue;
		const facts = await domFacts(page, n.backendDOMNodeId);
		const links = descendants(n).filter((d) => exposed(d) && role(d) === 'link').length;
		navs.push({ name: (n.name?.value ?? '').trim(), links, facts });
	}

	// Does `.term-status` exist? (Its own AX node may be pruned when it is a
	// plain generic, so its ancestry is read from its links below.)
	const statusInDom = await evaluate(page, "!!document.querySelector('.term-status')");

	// Status-line links as exposed in the tree.
	const windows = [];
	let firstWindow = null;
	for (const n of nodes) {
		if (role(n) !== 'link') continue;
		const facts = await domFacts(page, n.backendDOMNodeId);
		if (!facts?.inStatus) continue;
		const focusable = (n.properties ?? []).some(
			(p) => p.name === 'focusable' && p.value?.value === true,
		);
		windows.push({ name: (n.name?.value ?? '').trim(), ignored: Boolean(n.ignored), focusable });
		firstWindow ??= n;
	}
	// Exposed roles from a status window up to the root: the line itself (when
	// exposed) and every ancestor.
	const chain = [];
	for (let cur = firstWindow?.parentId ? byId.get(firstWindow.parentId) : null; cur;) {
		if (exposed(cur)) chain.push(role(cur));
		cur = cur.parentId ? byId.get(cur.parentId) : null;
	}
	const status = statusInDom ? { found: Boolean(firstWindow), chain } : null;
	const domWindows = await evaluate(page, "document.querySelectorAll('.term-status a').length");
	return { navs, status, windows, domWindows };
}

function check(route, vp, s) {
	const rows = [];
	const row = (id, ok, detail) => rows.push({ id, ok, detail });
	const tag = `${route} @${vp.width}`;
	const list = s.navs.map((n) => `"${n.name}"(${n.facts?.tag}.${n.facts?.cls || '-'})`).join(', ');

	const unnamed = s.navs.filter((n) => !n.name);
	row('LM-01', unnamed.length === 0, `${tag} navigation landmarks: ${list || 'none'}`);

	const names = s.navs.map((n) => n.name).filter(Boolean);
	const dups = names.filter((n, i) => names.indexOf(n) !== i);
	row('LM-02', dups.length === 0, `${tag} duplicate names: ${dups.join(', ') || 'none'}`);

	const want = PRIMARY[locale(route)];
	const primary = s.navs.filter((n) => n.name === want);
	const p = primary[0];
	row(
		'LM-03',
		primary.length === 1 && Boolean(p.facts?.inHeader) && p.links === HEADER_LINKS,
		`${tag} ${primary.length} named "${want}"` +
			(p ? `, in header=${Boolean(p.facts?.inHeader)}, ${p.links} link(s)` : ''),
	);

	const navHoldsStatus = s.navs.filter((n) => n.facts?.status);
	row(
		'LM-04',
		Boolean(s.status?.found) &&
			!s.status.chain.includes('navigation') &&
			navHoldsStatus.length === 0,
		`${tag} status line ${s.status ? (s.status.found ? `roles above its windows: ${s.status.chain.join(' < ')}` : 'windows not in the AX tree') : 'missing'}` +
			(navHoldsStatus.length
				? `; inside nav landmark(s): ${navHoldsStatus.map((n) => `"${n.name}"`).join(', ')}`
				: ''),
	);

	const live = s.windows.filter((w) => !w.ignored && w.focusable);
	row(
		'LM-05',
		s.domWindows >= FIXED_WINDOWS && live.length === s.domWindows,
		`${tag} ${live.length}/${s.domWindows} status links exposed and focusable [${s.windows.map((w) => w.name).join(' ')}]`,
	);
	return rows;
}

/** Tab from the first window to the last; the last must end up inside the line. */
const TAB_SCROLL_SETUP = `(() => {
	const line = document.querySelector('.term-status');
	const links = line ? [...line.querySelectorAll('a')] : [];
	if (!line || links.length < 2) return null;
	line.scrollLeft = 0;
	links[0].focus();
	return JSON.stringify({ overflow: line.scrollWidth > line.clientWidth, sw: line.scrollWidth, cw: line.clientWidth, count: links.length });
})()`;
const TAB_SCROLL_READ = `(() => {
	const line = document.querySelector('.term-status');
	const links = [...line.querySelectorAll('a')];
	const last = links[links.length - 1];
	const a = last.getBoundingClientRect();
	const l = line.getBoundingClientRect();
	return JSON.stringify({
		focused: document.activeElement === last,
		inView: a.left >= l.left - 0.5 && a.right <= l.right + 0.5,
		scrollLeft: line.scrollLeft,
		pageX: window.scrollX,
	});
})()`;

async function tab(page) {
	const key = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 };
	await page.send('Input.dispatchKeyEvent', { ...key, type: 'rawKeyDown' });
	await page.send('Input.dispatchKeyEvent', { ...key, type: 'keyUp' });
	await evaluate(page, 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
}

async function tabScroll(page) {
	const setup = await evaluate(page, TAB_SCROLL_SETUP);
	if (!setup) return { ok: false, detail: 'status line or its links missing' };
	const s = JSON.parse(setup);
	for (let i = 1; i < s.count; i += 1) await tab(page);
	const r = JSON.parse(await evaluate(page, TAB_SCROLL_READ));
	return {
		ok: s.overflow && r.focused && r.inView && r.scrollLeft > 0 && r.pageX === 0,
		detail: `/ @375 line ${s.sw}/${s.cw}px overflow=${s.overflow}; after ${s.count - 1} Tab(s) last window focused=${r.focused} inView=${r.inView} scrollLeft=${r.scrollLeft} pageX=${r.pageX}`,
	};
}

async function open(page, port, route) {
	await page.send('Page.navigate', { url: `http://127.0.0.1:${port}${route}` });
	const hydrated =
		route === DECK
			? "location.search.includes('page=') && !!document.querySelector('.deck-count') && document.fonts.status === 'loaded'"
			: "document.querySelectorAll('header.term-bar a').length > 0 && document.fonts.status === 'loaded'";
	if (!(await ready(page, hydrated, { timeoutMs: 15000 }))) {
		throw new Error(`${route} never became ready`);
	}
	if (route === DECK) {
		await pressEscape(page);
		const left = await until(
			async () => !(await evaluate(page, "!!document.querySelector('.deck.is-presenting')")),
			{ timeoutMs: 3000 },
		);
		if (!left) throw new Error(`${DECK} did not leave presenting on Escape`);
	}
	// Let the status line's scroll-into-view effect and layout settle.
	await evaluate(page, 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
	const defect = defectScript(route);
	if (defect) await evaluate(page, defect);
}

async function pressEscape(page) {
	const key = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 };
	await page.send('Input.dispatchKeyEvent', { ...key, type: 'rawKeyDown' });
	await page.send('Input.dispatchKeyEvent', { ...key, type: 'keyUp' });
}

async function main() {
	if (!findBrowser()) {
		console.log('SKIPPED  no browser available');
		return EXIT.SKIPPED;
	}
	const server = await serve('next/build');
	let page;
	let failed = 0;
	let total = 0;
	const report = (r) => {
		total += 1;
		if (!r.ok) failed += 1;
		console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  ${r.detail}`);
	};
	try {
		page = await launch();
		await page.send('Page.enable');
		await page.send('Runtime.enable');
		await page.send('DOM.enable');
		await page.send('Accessibility.enable');
		for (const vp of VIEWPORTS) {
			await page.send('Emulation.setDeviceMetricsOverride', {
				width: vp.width,
				height: vp.height,
				deviceScaleFactor: 1,
				mobile: vp.mobile,
			});
			for (const route of ROUTES) {
				await open(page, server.port, route);
				for (const r of check(route, vp, await snapshot(page))) report(r);
				if (vp.width === 375 && route === '/') {
					const t = await tabScroll(page);
					report({ id: 'LM-06', ...t });
				}
			}
		}
		console.log(`\n${total - failed}/${total} rows passed`);
		return failed === 0 ? EXIT.PASS : EXIT.FAIL;
	} finally {
		await page?.close();
		await server.close();
	}
}

main()
	.then((code) => process.exit(code))
	.catch((error) => {
		console.error(`ERROR ${error.message}`);
		process.exit(EXIT.ERROR);
	});
