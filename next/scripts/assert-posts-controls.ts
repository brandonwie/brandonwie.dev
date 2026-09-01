import assert from 'node:assert/strict';
import {
	mkdtempSync,
	mkdirSync,
	rmSync,
	statSync,
	symlinkSync,
	unlinkSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const NEXT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const POSTS_MODULE = resolve(NEXT_ROOT, 'src/content/posts.ts');
const CHILD_ENV = 'POSTS_CONTROLS_CHILD';
const MODULE_ENV = 'POSTS_CONTROLS_MODULE';
const SLUG = 'shared-fixture';
const INITIAL_MTIME = new Date('2026-01-01T00:00:00.000Z');
const UPDATED_MTIME = new Date('2026-01-01T00:01:00.000Z');

function postSource(title: string, body: string, draft = false): string {
	return `---
title: ${title}
description: Fixture post
date: 2026-01-01
updated: '2026-01-02'
tags:
  - test
category: test${draft ? '\ndraft: true' : ''}
---

${body}
`;
}

const INITIAL_SOURCE = postSource('Alpha', 'Old body.');
const MTIME_SOURCE = postSource('Bravo', 'New body.');
const SIZE_SOURCE = postSource('Delta', 'New body with a size change.');

async function runChild(): Promise<void> {
	type CjsLoad = (this: unknown, request: string, parent: unknown, isMain: boolean) => unknown;
	type GrayMatter = typeof import('gray-matter');
	type NodeFs = typeof import('node:fs');
	type PostsApi = typeof import('../src/content/posts');

	const cjsModule = require('node:module') as unknown as { _load: CjsLoad };
	const originalLoad = cjsModule._load;
	const modulePath = process.env[MODULE_ENV];
	assert.ok(modulePath, `${MODULE_ENV} must point at posts.ts`);
	let matterCalls = 0;
	let directoryReads = 0;
	let statCalls = 0;

	cjsModule._load = function (this: unknown, request, parent, isMain) {
		const loaded = originalLoad.call(this, request, parent, isMain);
		const parentFilename =
			typeof parent === 'object' && parent !== null && 'filename' in parent
				? String((parent as { filename?: unknown }).filename ?? '')
				: '';
		if (request === 'node:fs' && parentFilename === modulePath) {
			const nodeFs = loaded as NodeFs;
			const countedReaddirSync = ((...args: unknown[]) => {
				directoryReads += 1;
				return Reflect.apply(nodeFs.readdirSync, nodeFs, args);
			}) as NodeFs['readdirSync'];
			const countedStatSync = ((...args: unknown[]) => {
				statCalls += 1;
				return Reflect.apply(nodeFs.statSync, nodeFs, args);
			}) as NodeFs['statSync'];
			return new Proxy(nodeFs, {
				get(target, property, receiver) {
					if (property === 'readdirSync') return countedReaddirSync;
					if (property === 'statSync') return countedStatSync;
					return Reflect.get(target, property, receiver);
				},
			});
		}
		if (request !== 'gray-matter' || typeof loaded !== 'function') return loaded;

		const grayMatter = loaded as GrayMatter;
		const counted = ((...args: Parameters<GrayMatter>) => {
			matterCalls += 1;
			return grayMatter(...args);
		}) as GrayMatter;
		Object.assign(counted, grayMatter);
		return counted;
	};

	const { listPostSlugs, loadPost } = require(modulePath) as PostsApi;
	const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
	const contentRoot = resolve(process.cwd(), '..', 'src/content/posts');
	const englishFile = join(contentRoot, 'en', `${SLUG}.md`);

	assert.deepEqual(listPostSlugs('en'), [SLUG]);
	assert.equal(matterCalls, 2, 'listing parses the published and draft fixtures once each');
	assert.equal(directoryReads, 1, 'the first English listing reads its locale root once');
	assert.equal(
		statCalls,
		3,
		'the first listing stats its root and two parsed files, not tree entries',
	);

	const english = await loadPost(SLUG, 'en');
	assert.ok(english);
	assert.equal(matterCalls, 2, 'loading a listed post reuses its parsed source');
	assert.equal(
		directoryReads,
		2,
		'loading a listed post reuses English files and warms Korean once',
	);
	assert.ok(english.frontmatter.date instanceof Date, 'unquoted YAML dates stay Date objects');
	assert.equal(typeof english.frontmatter.updated, 'string', 'quoted YAML dates stay strings');
	assert.equal(english.hasKoreanTranslation, true);
	assert.match(renderToStaticMarkup(english.content), /Old body\./);

	assert.equal(await loadPost('draft-fixture', 'en'), null, 'drafts cannot be loaded directly');
	assert.equal(matterCalls, 2, 'the draft parsed during listing is reused for direct rejection');

	const korean = await loadPost(SLUG, 'ko');
	assert.ok(korean);
	assert.equal(matterCalls, 3, 'the same slug in another locale has a distinct cache entry');
	assert.ok(await loadPost(SLUG, 'ko'));
	assert.equal(matterCalls, 3, 'a second locale load reuses its parsed source');
	assert.equal(await loadPost('missing-fixture', 'en'), null);
	assert.equal(matterCalls, 3, 'a missing slug never invokes gray-matter');
	assert.equal(directoryReads, 2, 'warm locale listings avoid repeated directory walks');

	assert.equal(Buffer.byteLength(INITIAL_SOURCE), Buffer.byteLength(MTIME_SOURCE));
	writeFileSync(englishFile, MTIME_SOURCE);
	utimesSync(englishFile, UPDATED_MTIME, UPDATED_MTIME);
	const refreshedByMtime = await loadPost(SLUG, 'en');
	assert.ok(refreshedByMtime);
	assert.equal(matterCalls, 4, 'changed mtime invalidates a same-size cached source');
	assert.equal(refreshedByMtime.frontmatter.title, 'Bravo');
	assert.match(renderToStaticMarkup(refreshedByMtime.content), /New body\./);

	const cachedMtime = statSync(englishFile).mtime;
	writeFileSync(englishFile, SIZE_SOURCE);
	utimesSync(englishFile, cachedMtime, cachedMtime);
	const refreshedBySize = await loadPost(SLUG, 'en');
	assert.ok(refreshedBySize);
	assert.equal(matterCalls, 5, 'changed size invalidates a source with preserved mtime');
	assert.equal(refreshedBySize.frontmatter.title, 'Delta');
	assert.match(renderToStaticMarkup(refreshedBySize.content), /size change/);

	const englishRoot = join(contentRoot, 'en');
	if (process.platform !== 'win32') {
		const linkedRoot = resolve(contentRoot, '..', '..', 'linked-posts');
		const linkedPath = join(englishRoot, 'linked');
		mkdirSync(linkedRoot);
		writeFileSync(join(linkedRoot, 'linked-fixture.md'), postSource('Linked', 'Linked body.'));
		symlinkSync(linkedRoot, linkedPath, 'dir');
		assert.deepEqual(listPostSlugs('en'), ['linked-fixture', SLUG]);
		unlinkSync(linkedPath);
		rmSync(linkedRoot, { recursive: true });
		assert.deepEqual(listPostSlugs('en'), [SLUG]);
	}

	const nestedRoot = join(englishRoot, 'nested');
	mkdirSync(nestedRoot);
	writeFileSync(join(nestedRoot, 'nested-one.md'), postSource('Nested one', 'Nested body.'));
	utimesSync(nestedRoot, INITIAL_MTIME, INITIAL_MTIME);
	const readsBeforeNestedAdd = directoryReads;
	assert.deepEqual(listPostSlugs('en'), ['nested-one', SLUG]);
	assert.equal(
		directoryReads,
		readsBeforeNestedAdd + 2,
		'a nested addition rewalks both directories',
	);

	const rootBeforeNestedFile = statSync(englishRoot);
	writeFileSync(join(nestedRoot, 'nested-two.md'), postSource('Nested two', 'Another body.'));
	utimesSync(nestedRoot, UPDATED_MTIME, UPDATED_MTIME);
	const rootAfterNestedFile = statSync(englishRoot);
	assert.equal(rootAfterNestedFile.mtimeMs, rootBeforeNestedFile.mtimeMs);
	assert.equal(rootAfterNestedFile.ctimeMs, rootBeforeNestedFile.ctimeMs);
	const readsBeforeNestedFile = directoryReads;
	assert.deepEqual(listPostSlugs('en'), ['nested-one', 'nested-two', SLUG]);
	assert.equal(
		directoryReads,
		readsBeforeNestedFile + 2,
		'nested metadata invalidates a warm root',
	);

	rmSync(nestedRoot, { recursive: true });
	const readsBeforeNestedDelete = directoryReads;
	assert.deepEqual(listPostSlugs('en'), [SLUG]);
	assert.equal(
		directoryReads,
		readsBeforeNestedDelete + 1,
		'a nested deletion rewalks the locale root',
	);

	console.log('posts controls: list -> load parse reuse');
	console.log('posts controls: locale/path cache separation');
	console.log('posts controls: locale directory cache + nested invalidation');
	console.log('posts controls: Dirent walk avoids per-entry stat calls');
	if (process.platform !== 'win32') {
		console.log('posts controls: POSIX directory symlink traversal preserved');
	}
	console.log('posts controls: mtime + size freshness invalidation');
	console.log('posts controls: draft and missing-post rejection');
	console.log('posts controls: Date/string frontmatter preservation');
}

function runParent(): void {
	const fixtureRoot = mkdtempSync(join(tmpdir(), 'posts-controls-'));
	const fixtureNext = join(fixtureRoot, 'next');
	const englishRoot = join(fixtureRoot, 'src/content/posts/en');
	const koreanRoot = join(fixtureRoot, 'src/content/posts/ko');

	try {
		mkdirSync(fixtureNext, { recursive: true });
		mkdirSync(englishRoot, { recursive: true });
		mkdirSync(koreanRoot, { recursive: true });

		const fixtures = [
			[join(englishRoot, `${SLUG}.md`), INITIAL_SOURCE],
			[join(englishRoot, 'draft-fixture.md'), postSource('Draft', 'Hidden body.', true)],
			[join(koreanRoot, `${SLUG}.md`), postSource('Korean', 'Korean body.')],
		] as const;
		for (const [file, source] of fixtures) {
			writeFileSync(file, source);
			utimesSync(file, INITIAL_MTIME, INITIAL_MTIME);
		}

		const child = spawnSync(process.execPath, ['--import', require.resolve('tsx'), SCRIPT_PATH], {
			cwd: fixtureNext,
			encoding: 'utf8',
			env: {
				...process.env,
				[CHILD_ENV]: '1',
				[MODULE_ENV]: POSTS_MODULE,
				TSX_TSCONFIG_PATH: resolve(NEXT_ROOT, 'tsconfig.json'),
			},
		});

		if (child.status !== 0) {
			throw new Error(
				`posts control child failed (${child.status ?? child.signal}):\n${child.stdout}${child.stderr}`,
			);
		}
		process.stdout.write(child.stdout);
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
}

if (process.env[CHILD_ENV] === '1') await runChild();
else runParent();
