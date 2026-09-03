import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	DSA_I_SOURCE_FILES,
	DSA_I_SOURCE_ROOT_LABEL,
	DSA_II_SOURCE_FILES,
	DSA_II_SOURCE_ROOT_LABEL,
	DSA_III_SOURCE_FILES,
	DSA_III_SOURCE_ROOT_LABEL,
	DSA_IV_SOURCE_FILES,
	DSA_IV_SOURCE_ROOT_LABEL,
} from '../src/lib/data/study-sources.ts';

async function exists(path: string): Promise<boolean> {
	try {
		await Deno.stat(path);
		return true;
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) return false;
		throw error;
	}
}

async function findThreeBRoot(): Promise<string> {
	// C3 (dual-runtime evidence): THREEB_PATH is the one env var every 3B-reading
	// script honors; THREEB_ROOT stays accepted as the alias this script already had.
	const envRoot = Deno.env.get('THREEB_PATH') ?? Deno.env.get('THREEB_ROOT');
	if (envRoot) return envRoot;

	let current = dirname(fileURLToPath(import.meta.url));
	for (let depth = 0; depth < 10; depth += 1) {
		if (basename(current) === '3b' && (await exists(join(current, DSA_I_SOURCE_ROOT_LABEL)))) {
			return current;
		}

		const sibling = join(current, '3b');
		if (await exists(join(sibling, DSA_I_SOURCE_ROOT_LABEL))) return sibling;

		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}

	// C3: explicit fallback chain — ~/dev/3b, then the legacy ~/dev/personal/3b.
	// Skipped entirely when HOME is unset: `join('', 'dev', '3b')` is the relative
	// path `dev/3b`, which resolves against the caller's cwd and turns a missing
	// env var into a mystery.
	const home = Deno.env.get('HOME');
	if (home) {
		for (const candidate of [join(home, 'dev', '3b'), join(home, 'dev', 'personal', '3b')]) {
			if (await exists(join(candidate, DSA_I_SOURCE_ROOT_LABEL))) return candidate;
		}
	}

	throw new Error(
		'Could not locate 3B root. Set THREEB_PATH=/absolute/path/to/3b (THREEB_ROOT is still accepted).',
	);
}

async function sha256(path: string): Promise<string> {
	const bytes = await Deno.readFile(path);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const threeBRoot = await findThreeBRoot();

const groups = [
	{ label: DSA_I_SOURCE_ROOT_LABEL, files: DSA_I_SOURCE_FILES },
	{ label: DSA_II_SOURCE_ROOT_LABEL, files: DSA_II_SOURCE_FILES },
	{ label: DSA_III_SOURCE_ROOT_LABEL, files: DSA_III_SOURCE_FILES },
	{ label: DSA_IV_SOURCE_ROOT_LABEL, files: DSA_IV_SOURCE_FILES },
];

const mismatches: string[] = [];
let verifiedCount = 0;

for (const group of groups) {
	const sourceRoot = join(threeBRoot, group.label);
	for (const source of group.files) {
		const path = join(sourceRoot, source.path);
		if (!(await exists(path))) {
			mismatches.push(`${group.label}/${source.path}: missing`);
			continue;
		}

		const actual = await sha256(path);
		if (actual !== source.sha256) {
			mismatches.push(
				`${group.label}/${source.path}: expected ${source.sha256.slice(0, 12)}, got ${actual.slice(0, 12)}`,
			);
		}
	}
	verifiedCount += group.files.length;
}

if (mismatches.length > 0) {
	console.error('Study source drift detected:');
	for (const mismatch of mismatches) console.error(`- ${mismatch}`);
	Deno.exit(1);
}

console.log(`Study sources verified: ${verifiedCount} files across ${groups.length} courses`);
