/**
 * End-to-end guard for the one-way contract (brandonwie/brandonwie.dev#76):
 * the sync reads a 3B checkout and writes posts in the blog checkout only.
 * No mode may change a byte under the 3B root.
 *
 * The test builds a throwaway 3B root and blog root in a temp dir, runs the
 * real script as a subprocess with the same permissions `pnpm sync` grants
 * (write access to the blog's src/content/posts only), and compares the 3B
 * tree before and after.
 *
 * The symlink tests cover the layouts where the Deno write grant alone is not
 * enough: Deno checks the pathname and follows a symlink below the posts root.
 *
 * Run: deno test --no-check --allow-read --allow-write --allow-env --allow-run scripts/sync-from-3b.test.ts
 * (--no-check: deno.json sets browser libs, so a type-checked run cannot see the
 * Deno namespace; `deno run` does not type-check either.)
 */
import { assert, assertEquals } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { walk } from 'https://deno.land/std@0.220.0/fs/walk.ts';
import { dirname, fromFileUrl, join } from 'https://deno.land/std@0.220.0/path/mod.ts';

const SCRIPT = join(dirname(fromFileUrl(import.meta.url)), 'sync-from-3b.ts');

// A publishable note in the shape of a real knowledge entry, legacy state
// fields included: the sync must leave them exactly as written.
const NOTE = `---
tags: [devops, transferable]
created: 2026-05-24
updated: 2026-05-24
status: completed
references:
  - url: "https://example.com/docs"
    type: official
    title: "Example docs"
blog:
  publishable: true
  ready: true
  published_at: null
  last_synced: null
  exclude_reason: null
  needs_resync: true
---

# Sample Note

A one-line description of the sample note.

## Details

Body text.
`;

async function snapshot(root: string): Promise<Record<string, string>> {
	const files: Record<string, string> = {};
	for await (const entry of walk(root, { includeDirs: false })) {
		files[entry.path] = await Deno.readTextFile(entry.path);
	}
	return files;
}

async function runSync(threeB: string, blog: string, args: string[]) {
	const out = await new Deno.Command(Deno.execPath(), {
		args: [
			'run',
			'--allow-read',
			`--allow-write=${join(blog, 'src', 'content', 'posts')}`,
			'--allow-env',
			SCRIPT,
			...args,
		],
		env: { B3_PATH: threeB, BLOG_ROOT: blog },
		stdout: 'piped',
		stderr: 'piped',
	}).output();
	const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
	return { code: out.code, text };
}

Deno.test('sync and --check never change the 3B checkout', async () => {
	const tmp = await Deno.makeTempDir({ prefix: 'sync-one-way-' });
	try {
		const threeB = join(tmp, 'b3');
		const blog = join(tmp, 'blog');
		const notePath = join(threeB, 'knowledge', 'devops', 'sample-note.md');
		const postPath = join(blog, 'src', 'content', 'posts', 'en', 'devops', 'sample-note.md');
		await Deno.mkdir(dirname(notePath), { recursive: true });
		await Deno.mkdir(join(blog, 'src', 'content', 'posts'), { recursive: true });
		await Deno.writeTextFile(notePath, NOTE);

		// First sync: the post appears in the blog; the 3B tree is unchanged.
		const before = await snapshot(threeB);
		const synced = await runSync(threeB, blog, ['--allow-missing-terms']);
		assertEquals(synced.code, 0, synced.text);
		const post = await Deno.readTextFile(postPath);
		assert(/^source_content_hash: /m.test(post), 'post carries the source hash');
		assertEquals(await snapshot(threeB), before);

		// The author expands the post and the note later gains content. The hash
		// check reports the post as behind, from blog-side state alone.
		await Deno.writeTextFile(postPath, post.replace(/^lang: en$/m, 'lang: en\nexpanded: true'));
		await Deno.writeTextFile(notePath, NOTE + '\nA new paragraph.\n');
		const changed = await snapshot(threeB);
		const check = await runSync(threeB, blog, ['--check']);
		assertEquals(check.code, 1, check.text);
		assert(check.text.includes('HASH MISMATCH: devops/sample-note.md'), check.text);

		// A re-sync protects the expanded post and still leaves 3B untouched.
		const resynced = await runSync(threeB, blog, ['--allow-missing-terms']);
		assertEquals(resynced.code, 0, resynced.text);
		assertEquals(await snapshot(threeB), changed);
	} finally {
		await Deno.remove(tmp, { recursive: true });
	}
});

Deno.test('the removed --reconcile mode is refused and writes nothing', async () => {
	const tmp = await Deno.makeTempDir({ prefix: 'sync-one-way-' });
	try {
		const threeB = join(tmp, 'b3');
		const blog = join(tmp, 'blog');
		const notePath = join(threeB, 'knowledge', 'devops', 'sample-note.md');
		await Deno.mkdir(dirname(notePath), { recursive: true });
		await Deno.mkdir(join(blog, 'src', 'content', 'posts'), { recursive: true });
		await Deno.writeTextFile(notePath, NOTE);

		const before = await snapshot(threeB);
		const run = await runSync(threeB, blog, ['--reconcile']);
		assertEquals(run.code, 1, run.text);
		assert(run.text.includes('--reconcile was removed'), run.text);
		assertEquals(await snapshot(threeB), before);
		assertEquals(await snapshot(blog), {});
	} finally {
		await Deno.remove(tmp, { recursive: true });
	}
});

// --- Symlink layouts (PR 77 review, round 1) ---------------------------------
// Each test plants a symlink under the posts root that leads out of the posts
// tree, runs the real script with the production write grant, and requires a
// refusal (exit 1, "refused to write") and a byte-identical tree on the far
// side of the link.

/** A temp 3B root with one publishable note, and a blog root with an empty posts tree. */
async function fixture() {
	const tmp = await Deno.makeTempDir({ prefix: 'sync-one-way-' });
	const threeB = join(tmp, 'b3');
	const blog = join(tmp, 'blog');
	const notePath = join(threeB, 'knowledge', 'devops', 'sample-note.md');
	const posts = join(blog, 'src', 'content', 'posts');
	await Deno.mkdir(dirname(notePath), { recursive: true });
	await Deno.mkdir(posts, { recursive: true });
	await Deno.writeTextFile(notePath, NOTE);
	return { tmp, threeB, blog, notePath, posts };
}

function assertRefused(run: { code: number; text: string }) {
	assertEquals(run.code, 1, run.text);
	assert(run.text.includes('refused to write'), run.text);
	assert(!run.text.includes('Synced:'), run.text);
}

Deno.test('sync refuses a post file that is a symlink into 3B', async () => {
	const f = await fixture();
	try {
		const postDir = join(f.posts, 'en', 'devops');
		await Deno.mkdir(postDir, { recursive: true });
		await Deno.symlink(f.notePath, join(postDir, 'sample-note.md'));

		const before = await snapshot(f.threeB);
		assertRefused(await runSync(f.threeB, f.blog, ['--allow-missing-terms']));
		assertEquals(await snapshot(f.threeB), before);
	} finally {
		await Deno.remove(f.tmp, { recursive: true });
	}
});

Deno.test('sync refuses a posts/en directory that is a symlink into 3B', async () => {
	const f = await fixture();
	try {
		await Deno.symlink(join(f.threeB, 'knowledge'), join(f.posts, 'en'));

		const before = await snapshot(f.threeB);
		assertRefused(await runSync(f.threeB, f.blog, ['--allow-missing-terms']));
		assertEquals(await snapshot(f.threeB), before);
	} finally {
		await Deno.remove(f.tmp, { recursive: true });
	}
});

Deno.test('sync refuses a posts root that resolves into 3B', async () => {
	const f = await fixture();
	try {
		// The posts root itself is a link to a folder inside the 3B checkout, so
		// the real destination overlaps 3B although no component below it is a link.
		const inside = join(f.threeB, 'personal', 'posts');
		await Deno.mkdir(inside, { recursive: true });
		await Deno.remove(f.posts);
		await Deno.symlink(inside, f.posts);

		const before = await snapshot(f.threeB);
		assertRefused(await runSync(f.threeB, f.blog, ['--allow-missing-terms']));
		assertEquals(await snapshot(f.threeB), before);
	} finally {
		await Deno.remove(f.tmp, { recursive: true });
	}
});

Deno.test('--rehash refuses a post file that is a symlink out of the posts tree', async () => {
	const f = await fixture();
	try {
		// An expanded post with a stale hash, stored outside the posts tree and
		// linked into it. --rehash would rewrite its hash line through the link.
		const outside = join(f.tmp, 'outside');
		const linked = join(outside, 'sample-note.md');
		await Deno.mkdir(outside, { recursive: true });
		await Deno.writeTextFile(
			linked,
			`---\ntitle: 'Sample Note'\nlang: en\nexpanded: true\nsource_content_hash: ${'0'.repeat(64)}\n---\n\nExpanded body.\n`,
		);
		const postDir = join(f.posts, 'en', 'devops');
		await Deno.mkdir(postDir, { recursive: true });
		await Deno.symlink(linked, join(postDir, 'sample-note.md'));
		const allow = join(f.tmp, 'allow.txt');
		await Deno.writeTextFile(allow, 'devops/sample-note.md\n');

		const beforeOutside = await snapshot(outside);
		const beforeThreeB = await snapshot(f.threeB);
		const run = await runSync(f.threeB, f.blog, ['--rehash', `--allow=${allow}`]);
		assertEquals(run.code, 1, run.text);
		assert(run.text.includes('refused to write'), run.text);
		assertEquals(await snapshot(outside), beforeOutside);
		assertEquals(await snapshot(f.threeB), beforeThreeB);
	} finally {
		await Deno.remove(f.tmp, { recursive: true });
	}
});
