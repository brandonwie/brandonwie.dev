/**
 * Negative controls for the C11 harness.
 *
 *   pnpm migration:c11:controls
 *
 * `assert-c11-library-ports.ts` reports 28 green rows. This asks the only
 * question that makes that number mean anything: would any of them go red?
 *
 * Two kinds of control, paired per `verification/harness-negative-controls.md`:
 *
 *   DEFECT      induce the exact failure a row claims to catch, and require
 *               that THAT row fails -- not merely that the run exits 1, which
 *               any broken input achieves.
 *   INVARIANCE  make a change the row must NOT care about, and require the
 *               whole harness still exits 0. Without these, "goes red" and
 *               "goes red at everything" are the same measurement.
 *
 * Two injection surfaces, matching where each row gets its evidence:
 *
 *   sources     a scratch copy of one file with one mutation, handed to the
 *               harness through `sourceOverrides`. For the rows that READ code.
 *   seams       a substituted `graph` or `mermaid` implementation. For the rows
 *               that CALL code -- a source edit cannot reach a module the
 *               harness already imported.
 *   builds      a dereferenced copy of `next/build` with one file rewritten.
 *               For the rows that read the export.
 *
 * EVERY control is no-op guarded. A source mutation that changed no bytes, a
 * build mutation whose sentinel was never in the file, a seam that happens to
 * behave like the real thing: each turns an invariance control into a tautology
 * and a defect control into a coincidence. The guard runs before the harness
 * does and fails the control outright.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
	dimEdges,
	edgeStyleObject,
	buildDrilldown,
	buildOverview,
	hasFallback,
	type FlowEdge,
	type FlowModel,
} from '../next/src/graph/system3b-graph.ts';
import { mermaidView, renderMermaid } from '../next/src/components/Mermaid.tsx';
import {
	FLOW_RUNTIME_SENTINELS,
	FLOW_SENTINEL,
	FALLBACK_SENTINEL,
	LANE_COUNTS,
	REPORTER_SENTINEL,
	SHELL_CLAIMS,
	listChunks,
	referencedAssets,
	runAssertions,
	type C11Options,
	type GraphSeam,
	type RowResult,
} from './assert-c11-library-ports.ts';

const ROOT = process.cwd();
const SCRATCH = resolve(ROOT, 'tmp/c11-controls');

/** Files written outside the scratch tree (a tsconfig has to sit beside the
 *  one it extends) and removed when the run ends, pass or fail. */
const CLEANUP: string[] = [];

const REAL_GRAPH: GraphSeam = {
	edgeStyleObject,
	dimEdges,
	buildOverview,
	buildDrilldown,
	hasFallback,
};

interface Control {
	id: string;
	kind: 'defect' | 'invariance';
	/** The row this control is about. A defect must flip exactly this row. */
	row: string;
	what: string;
	/** Build the mutated inputs. Throwing here fails the control, which is what
	 *  a no-op guard does. */
	setup: (dir: string) => C11Options;
}

// ------------------------------------------------------------- mutation tools

/** Copy one repo file into scratch with a substitution applied, and PROVE the
 *  substitution changed something. */
function mutateSource(
	dir: string,
	rel: string,
	edit: (text: string) => string,
): Record<string, string> {
	const before = readFileSync(resolve(ROOT, rel), 'utf8');
	const after = edit(before);
	if (after === before) {
		throw new Error(
			`no-op mutation: editing ${rel} changed nothing, so any result is a coincidence`,
		);
	}
	const target = join(dir, rel);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, after);
	return { [rel]: target };
}

/** Dereferenced copy of the export, so a rewrite cannot reach the real build. */
function copyBuild(dir: string): string {
	const copy = join(dir, 'build');
	rmSync(copy, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	cpSync(resolve(ROOT, 'next/build'), copy, { recursive: true, dereference: true });
	return copy;
}

function mutateFile(path: string, edit: (text: string) => string): void {
	const before = readFileSync(path, 'utf8');
	const after = edit(before);
	if (after === before) {
		throw new Error(`no-op mutation: rewriting ${path} changed nothing`);
	}
	writeFileSync(path, after);
}

/** A graph seam with one behavior replaced. */
function graphWith(overrides: Partial<GraphSeam>): GraphSeam {
	return { ...REAL_GRAPH, ...overrides };
}

// ------------------------------------------------------------------- controls

const CONTROLS: Control[] = [
	// ---------------------------------------------------------------- P group
	{
		id: 'P1-defect',
		kind: 'defect',
		row: 'P1',
		what: 'a ported file is missing',
		setup: (dir) => ({
			sourceOverrides: { 'next/src/components/System3bFitView.tsx': join(dir, 'gone.tsx') },
			skipTypecheck: true,
		}),
	},
	{
		id: 'P2-defect',
		kind: 'defect',
		row: 'P2',
		what: 'the @xyflow/react pin gains a caret',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/package.json', (sourceText) =>
				sourceText.replace('"@xyflow/react": "12.11.6"', '"@xyflow/react": "^12.11.6"'),
			),
			skipTypecheck: true,
		}),
	},
	{
		id: 'P3-defect',
		kind: 'defect',
		row: 'P3',
		what: 'the band node takes a VALUE import from @xyflow',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/components/System3bBandNode.tsx', (sourceText) =>
				sourceText.replace(
					"import type { NodeProps } from '@xyflow/react';",
					"import { Handle } from '@xyflow/react';",
				),
			),
			skipTypecheck: true,
		}),
	},
	{
		id: 'P4-defect-loading',
		kind: 'defect',
		row: 'P4',
		what: 'the dynamic import loses its loading component — the one-word regression',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/components/System3bGraph.tsx', (sourceText) =>
				sourceText.replace(/\n\tloading: \(\) => <System3bFallback state="loading" \/>,/, ''),
			),
			skipTypecheck: true,
		}),
	},
	{
		id: 'P4-defect-ssr',
		kind: 'defect',
		row: 'P4',
		what: 'the dynamic import turns ssr back on',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/components/System3bGraph.tsx', (sourceText) =>
				sourceText.replace('ssr: false,', 'ssr: true,'),
			),
			skipTypecheck: true,
		}),
	},
	{
		id: 'P5-defect',
		kind: 'defect',
		row: 'P5',
		what: 'the wrapper imports the xyflow stylesheet, defeating the lazy boundary',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/components/System3bGraph.tsx', (sourceText) =>
				sourceText.replace(
					"import dynamic from 'next/dynamic';",
					"import '@xyflow/react/dist/style.css';\nimport dynamic from 'next/dynamic';",
				),
			),
			skipTypecheck: true,
		}),
	},
	{
		id: 'P4-invariance',
		kind: 'invariance',
		row: 'P4',
		what: 'the wrapper gains a comment',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/components/System3bGraph.tsx', (sourceText) =>
				sourceText.replace(
					'const Flow = dynamic(',
					'// a comment that changes nothing\nconst Flow = dynamic(',
				),
			),
			skipTypecheck: true,
		}),
	},

	{
		id: 'P6-defect-foreign',
		kind: 'defect',
		row: 'P6',
		what: "the graph CSS keeps the Svelte stack's class prefix — the review finding this row exists for",
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'next/app/globals.css', (sourceText) =>
				sourceText.split('.canvas .react-flow').join('.canvas .svelte-flow'),
			),
		}),
	},
	{
		id: 'P6-defect-dropped',
		kind: 'defect',
		row: 'P6',
		what: 'the graph CSS is dropped rather than ported',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'next/app/globals.css', (sourceText) =>
				sourceText.split('.canvas .react-flow').join('.canvas .no-such-flow'),
			),
		}),
	},
	{
		id: 'P6-invariance',
		kind: 'invariance',
		row: 'P6',
		what: 'the graph CSS gains a comment',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'next/app/globals.css', (sourceText) =>
				sourceText.replace('.canvas .react-flow {', '/* graph surface */\n.canvas .react-flow {'),
			),
		}),
	},

	// ---------------------------------------------------------------- A group
	{
		id: 'A1-defect',
		kind: 'defect',
		row: 'A1',
		what: 'edgeStyleObject returns a CSS declaration string again',
		setup: () => ({
			skipTypecheck: true,
			graph: graphWith({
				edgeStyleObject: (() => ({
					stroke: 'stroke:#fff;stroke-width:2',
				})) as GraphSeam['edgeStyleObject'],
			}),
		}),
	},
	{
		id: 'A2-defect-concat',
		kind: 'defect',
		row: 'A2',
		what: 'the hover dimmer CONCATENATES instead of merging — the exact predicted regression',
		setup: () => ({
			skipTypecheck: true,
			graph: graphWith({
				dimEdges: ((edges: FlowEdge[], hovered: string | null) =>
					edges.map((e) =>
						!hovered || e.source === hovered || e.target === hovered
							? e
							: { ...e, style: `${String(e.style)};opacity:0.1` },
					)) as unknown as GraphSeam['dimEdges'],
			}),
		}),
	},
	{
		id: 'A2-defect-drops-stroke',
		kind: 'defect',
		row: 'A2',
		what: 'the dimmer merges but REPLACES the style, dropping stroke and width',
		setup: () => ({
			skipTypecheck: true,
			graph: graphWith({
				dimEdges: ((edges: FlowEdge[], hovered: string | null) =>
					edges.map((e) =>
						!hovered || e.source === hovered || e.target === hovered
							? e
							: { ...e, style: { opacity: 0.1 }, animated: false },
					)) as unknown as GraphSeam['dimEdges'],
			}),
		}),
	},
	{
		id: 'A3-defect',
		kind: 'defect',
		row: 'A3',
		what: 'the dimmer rewrites incident edges too',
		setup: () => ({
			skipTypecheck: true,
			graph: graphWith({
				dimEdges: ((edges: FlowEdge[]) =>
					edges.map((e) => ({
						...e,
						style: { ...e.style, opacity: 1 },
					}))) as unknown as GraphSeam['dimEdges'],
			}),
		}),
	},
	{
		id: 'A4-defect',
		kind: 'defect',
		row: 'A4',
		what: 'edgeStyleString comes back as a real call',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'next/src/graph/system3b-graph.ts', (sourceText) =>
				sourceText.replace(
					'const s = edgeStyleTracked(kind, report);',
					'const s = edgeStyleTracked(kind, report);\n\tvoid edgeStyleString;',
				),
			),
		}),
	},
	{
		id: 'A4-defect-concat-string',
		kind: 'defect',
		row: 'A4',
		what: 'a CSS declaration STRING carrying opacity is built again — no control drove this clause before',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'next/src/graph/system3b-graph.ts', (sourceText) =>
				sourceText.replace(
					'export function dimEdges',
					"const dimmed = 'stroke:#fff;opacity: 0.1;';\nexport function dimEdges",
				),
			),
		}),
	},
	{
		id: 'A4-invariance',
		kind: 'invariance',
		row: 'A4',
		what: 'a COMMENT mentions edgeStyleString — the false positive this row first produced',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'next/src/graph/system3b-graph.ts', (sourceText) =>
				sourceText.replace(
					'export function dimEdges',
					'// edgeStyleString is gone; opacity: 0.1 is no longer built as a string.\nexport function dimEdges',
				),
			),
		}),
	},

	// ---------------------------------------------------------------- B group
	{
		id: 'B1-defect-value',
		kind: 'defect',
		row: 'B1',
		what: "the built edges carry markerEnd.type 'arrow'",
		setup: () => ({
			skipTypecheck: true,
			graph: graphWith({
				buildOverview: ((...args: Parameters<typeof buildOverview>) => {
					const model: FlowModel = buildOverview(...args);
					return {
						...model,
						edges: model.edges.map((e) => ({ ...e, markerEnd: { type: 'arrow', color: '#000' } })),
					} as FlowModel;
				}) as GraphSeam['buildOverview'],
			}),
		}),
	},
	{
		id: 'B1-defect-enum',
		kind: 'defect',
		row: 'B1',
		what: 'MarkerType.ArrowClosed appears in CODE',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'next/src/graph/system3b-graph.ts', (sourceText) =>
				sourceText.replace(
					'export function dimEdges',
					'const unused = MarkerType.ArrowClosed;\nexport function dimEdges',
				),
			),
		}),
	},
	{
		id: 'B1-invariance',
		kind: 'invariance',
		row: 'B1',
		what: 'MarkerType. appears only in a comment',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'next/src/graph/system3b-graph.ts', (sourceText) =>
				sourceText.replace(
					'export function dimEdges',
					'// never MarkerType.ArrowClosed: the contract is assignability.\nexport function dimEdges',
				),
			),
		}),
	},
	{
		id: 'B2-defect',
		kind: 'defect',
		row: 'B2',
		what: 'the assignability proof drops one of its two Edge[] bindings',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(
				dir,
				'next/src/graph/system3b-graph.types-check.ts',
				(sourceText) => sourceText.replace(/: Edge\[\] =/, ': unknown[] ='),
			),
		}),
	},
	{
		id: 'B3-defect-no-op',
		kind: 'defect',
		row: 'B3',
		what: 'markerEnd.type is ALREADY string, so the widening mutates nothing',
		setup: (dir) => ({
			sourceOverrides: mutateSource(dir, 'next/src/graph/system3b-graph.ts', (sourceText) =>
				sourceText.replace("markerEnd?: { type: 'arrowclosed'", 'markerEnd?: { type: string'),
			),
		}),
	},

	// ---------------------------------------------------------------- C group
	{
		id: 'C1-defect-widened',
		kind: 'defect',
		row: 'C1',
		what: 'a widened exclude keeps tsc GREEN while it reads none of the ported files',
		setup: () => {
			// Written beside the real tsconfig on purpose: `include`/`exclude` and
			// module resolution are both relative to the config's directory, so a
			// copy anywhere else would fail for the wrong reason.
			const path = resolve(ROOT, 'next/tsconfig.c11-control.json');
			writeFileSync(
				path,
				JSON.stringify(
					{
						extends: './tsconfig.json',
						// incremental OFF: it is inherited through `extends`, and an
						// incremental run drops a .tsbuildinfo beside the config that
						// outlives the control. The first version of this control left
						// three of them in the tree.
						compilerOptions: { incremental: false },
						include: ['next-env.d.ts'],
						exclude: ['node_modules', 'build', 'src', 'app'],
					},
					null,
					'\t',
				),
			);
			CLEANUP.push(path, `${path.replace(/\.json$/, '')}.tsbuildinfo`);
			return { tsconfigProject: 'next/tsconfig.c11-control.json' };
		},
	},
	{
		id: 'C1-invariance',
		kind: 'invariance',
		row: 'C1',
		what: 'the same program reached through a config that only extends the real one',
		setup: () => {
			const path = resolve(ROOT, 'next/tsconfig.c11-passthrough.json');
			writeFileSync(
				path,
				JSON.stringify(
					{ extends: './tsconfig.json', compilerOptions: { incremental: false } },
					null,
					'\t',
				),
			);
			CLEANUP.push(path, `${path.replace(/\.json$/, '')}.tsbuildinfo`);
			return { tsconfigProject: 'next/tsconfig.c11-passthrough.json' };
		},
	},

	// ---------------------------------------------------------------- H group
	{
		id: 'H1-defect',
		kind: 'defect',
		row: 'H1',
		what: 'flow elements reach the exported HTML',
		setup: (dir) => {
			const build = copyBuild(dir);
			mutateFile(join(build, 'system', '3b.html'), (sourceText) =>
				sourceText.replace('<body', `<body data-leak="${FLOW_SENTINEL}node"`),
			);
			return { buildDir: build, skipTypecheck: true };
		},
	},
	{
		id: 'H2-defect-fallback',
		kind: 'defect',
		row: 'H2',
		what: 'the no-JS fallback disappears from the export',
		setup: (dir) => {
			const build = copyBuild(dir);
			mutateFile(join(build, 'system', '3b.html'), (sourceText) =>
				sourceText.split(FALLBACK_SENTINEL).join('s3b-gone'),
			);
			return { buildDir: build, skipTypecheck: true };
		},
	},
	{
		id: 'H2-defect-counts',
		kind: 'defect',
		row: 'H2',
		what: 'one lane count moves',
		setup: () => ({
			skipTypecheck: true,
			laneCounts: LANE_COUNTS.map((n, i) => (i === 0 ? n + 1 : n)),
		}),
	},
	{
		id: 'H3-defect',
		kind: 'defect',
		row: 'H3',
		what: 'the page eagerly references the chunk carrying the flow code',
		setup: (dir) => {
			const build = copyBuild(dir);
			const page = join(build, 'system', '3b.html');
			const flowChunk = listChunks(build).find(
				(f) => f.endsWith('.js') && readFileSync(f, 'utf8').includes(FLOW_RUNTIME_SENTINELS[0]),
			);
			if (!flowChunk) throw new Error('no flow chunk in the copy to reference');
			const name = flowChunk.split('/').pop() as string;
			mutateFile(page, (sourceText) =>
				sourceText.replace(
					'</body>',
					`<script src="/_next/static/chunks/${name}"></script></body>`,
				),
			);
			return { buildDir: build, skipTypecheck: true };
		},
	},
	{
		id: 'H4-defect',
		kind: 'defect',
		row: 'H4',
		what: 'the boundary reporter is stripped from every eager chunk',
		setup: (dir) => {
			const build = copyBuild(dir);
			const referenced = referencedAssets(readFileSync(join(build, 'system', '3b.html'), 'utf8'));
			let stripped = 0;
			for (const chunk of listChunks(build)) {
				const name = chunk.split('/').pop() as string;
				if (!referenced.has(name)) continue;
				const text = readFileSync(chunk, 'utf8');
				if (!text.includes(REPORTER_SENTINEL)) continue;
				writeFileSync(chunk, text.split(REPORTER_SENTINEL).join('[silence]'));
				stripped += 1;
			}
			if (stripped === 0)
				throw new Error('no eager chunk carried the reporter, so stripping it proved nothing');
			return { buildDir: build, skipTypecheck: true };
		},
	},
	{
		id: 'H-invariance',
		kind: 'invariance',
		row: 'H1',
		what: 'an eager chunk gains a trailing comment',
		setup: (dir) => {
			const build = copyBuild(dir);
			const referenced = referencedAssets(readFileSync(join(build, 'system', '3b.html'), 'utf8'));
			const target = listChunks(build).find(
				(f) => f.endsWith('.js') && referenced.has(f.split('/').pop() as string),
			);
			if (!target) throw new Error('no eager js chunk to append to');
			mutateFile(target, (chunkText) => `${chunkText}\n// harmless`);
			return { buildDir: build, skipTypecheck: true };
		},
	},

	// ---------------------------------------------------------------- N group
	{
		id: 'N1-defect-wrong-key',
		kind: 'defect',
		row: 'N1',
		what: 'a shell approval claims a key that does not differ',
		setup: () => ({
			skipTypecheck: true,
			shellClaims: { ...SHELL_CLAIMS, '/system/3b': ['meta:description'] },
		}),
	},
	{
		id: 'N1-defect-extra-key',
		kind: 'defect',
		row: 'N1',
		what: 'a shell approval claims MORE differences than exist — the raw-vs-normalized mistake',
		setup: () => ({
			skipTypecheck: true,
			shellClaims: {
				...SHELL_CLAIMS,
				'/system/3b': ['body:preload-data', 'link:icon:/favicon.svg', 'link:<bundle>'],
			},
		}),
	},
	{
		id: 'N1-defect-unclaimed',
		kind: 'defect',
		row: 'N1',
		what: 'a route holds a shell approval with no recomputed claim at all',
		setup: () => {
			const claims = { ...SHELL_CLAIMS };
			delete claims['/system/3b'];
			return { skipTypecheck: true, shellClaims: claims };
		},
	},
	{
		id: 'N1-invariance',
		kind: 'invariance',
		row: 'N1',
		what: 'the claimed keys are listed in a different order',
		setup: () => ({
			skipTypecheck: true,
			shellClaims: {
				...SHELL_CLAIMS,
				'/404': ['meta:robots', 'body:preload-data', 'link:<bundle>'],
			},
		}),
	},

	// ---------------------------------------------------------------- S group
	{
		id: 'S6-defect',
		kind: 'defect',
		row: 'S6b',
		what: 'an unmapped kind is absorbed silently, as the Svelte original absorbed it',
		setup: () => ({
			skipTypecheck: true,
			graph: graphWith({
				buildDrilldown: ((...args: Parameters<typeof buildDrilldown>) => {
					const model = buildDrilldown(...args);
					return { ...model, fallbacks: { kinds: [], edgeKinds: [] } } as FlowModel;
				}) as GraphSeam['buildDrilldown'],
			}),
		}),
	},
	{
		id: 'S7-defect',
		kind: 'defect',
		row: 'S7b',
		what: 'a thrown layout falls back to insertion order without reporting it',
		setup: () => ({
			skipTypecheck: true,
			graph: graphWith({
				buildOverview: ((...args: Parameters<typeof buildOverview>) => {
					const model = buildOverview(...args);
					return { ...model, degraded: false, degradedReason: null } as FlowModel;
				}) as GraphSeam['buildOverview'],
			}),
		}),
	},
	{
		id: 'S8-defect',
		kind: 'defect',
		row: 'S8',
		what: 'the reporter ships ONLY inside the chunk it reports on',
		setup: (dir) => {
			const build = copyBuild(dir);
			const referenced = referencedAssets(readFileSync(join(build, 'system', '3b.html'), 'utf8'));
			let moved = 0;
			for (const chunk of listChunks(build)) {
				const text = readFileSync(chunk, 'utf8');
				if (!text.includes(REPORTER_SENTINEL)) continue;
				if (referenced.has(chunk.split('/').pop() as string)) {
					writeFileSync(chunk, text.split(REPORTER_SENTINEL).join('[silence]'));
					moved += 1;
				}
			}
			if (moved === 0) throw new Error('the reporter was in no eager chunk to begin with');
			// and put it where it cannot help: inside a flow chunk.
			const flow = listChunks(build).find(
				(f) => f.endsWith('.js') && readFileSync(f, 'utf8').includes(FLOW_SENTINEL),
			);
			if (!flow) throw new Error('no flow chunk to hide the reporter in');
			mutateFile(
				flow,
				(chunkText) => `${chunkText}\nconsole.error(${JSON.stringify(REPORTER_SENTINEL)});`,
			);
			return { buildDir: build, skipTypecheck: true };
		},
	},
	{
		id: 'S9a-defect',
		kind: 'defect',
		row: 'S9a',
		what: 'the export ships a diagram already marked failed',
		setup: (dir) => {
			const build = copyBuild(dir);
			mutateFile(join(build, 'migration-fixture', 'mermaid.html'), (sourceText) =>
				sourceText.replace('data-mermaid=""', 'data-mermaid-error=""'),
			);
			return { buildDir: build, skipTypecheck: true };
		},
	},
	{
		id: 'S9b-defect',
		kind: 'defect',
		row: 'S9b',
		what: 'the two mermaid states stop being distinguishable by attribute',
		setup: () => ({
			skipTypecheck: true,
			mermaid: {
				renderMermaid,
				mermaidView: ((args: { code: string; error: string | null }) => ({
					type: 'div',
					props: { 'data-mermaid': '', 'data-mermaid-error': '', children: args.code },
				})) as unknown as typeof mermaidView,
			},
		}),
	},
	{
		id: 'S9d-defect',
		kind: 'defect',
		row: 'S9d',
		what: 'a retry leaves the previous error in place, so a working diagram stays marked failed',
		setup: () => ({
			skipTypecheck: true,
			mermaid: {
				mermaidView,
				renderMermaid: (async (deps: Parameters<typeof renderMermaid>[0]) => {
					// Everything renderMermaid does EXCEPT the leading clear.
					try {
						const api = await deps.loadMermaid();
						const { svg } = await api.render(`mermaid-${deps.id}`, deps.code);
						deps.setSvg(svg);
					} catch (cause) {
						deps.setError(cause instanceof Error ? cause.message : String(cause));
					}
				}) as typeof renderMermaid,
			},
		}),
	},
	{
		id: 'S9c-defect',
		kind: 'defect',
		row: 'S9c',
		what: 'a rejected diagram is swallowed instead of reported',
		setup: () => ({
			skipTypecheck: true,
			mermaid: {
				mermaidView,
				renderMermaid: (async () => {
					/* swallow everything, report nothing */
				}) as typeof renderMermaid,
			},
		}),
	},

	// ---------------------------------------------------------------- M group
	{
		id: 'M1-defect-drift',
		kind: 'defect',
		row: 'M1',
		what: 'the Next mermaid config silently drops flowchart.curve',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'next/src/components/Mermaid.tsx', (sourceText) =>
				sourceText.replace("curve: 'basis',", "curve: 'linear',"),
			),
		}),
	},
	{
		id: 'M1-defect-stale-allowlist',
		kind: 'defect',
		row: 'M1',
		what: 'the allowlist declares a divergence the two configs do not have',
		setup: () => ({
			skipTypecheck: true,
			mermaidDivergences: {
				securityLevel: { svelte: 'loose', next: 'strict', why: 'real' },
				theme: { svelte: 'dark', next: 'forest', why: 'invented' },
			},
		}),
	},
	{
		id: 'M1-invariance',
		kind: 'invariance',
		row: 'M1',
		what: 'a themeVariables comment is reworded',
		setup: (dir) => ({
			skipTypecheck: true,
			sourceOverrides: mutateSource(dir, 'next/src/components/Mermaid.tsx', (sourceText) =>
				sourceText.replace('\t\t// Background\n', '\t\t// Backgrounds, carried over verbatim\n'),
			),
		}),
	},
	{
		id: 'M2-defect-count',
		kind: 'defect',
		row: 'M2',
		what: 'the declared fence census no longer matches the corpus',
		setup: () => ({
			skipTypecheck: true,
			mermaidCensus: {
				fences: 67,
				byType: { flowchart: 53, sequenceDiagram: 9, gantt: 3, graph: 2, 'stateDiagram-v2': 1 },
				fencesWithBr: 15,
			},
		}),
	},
	{
		id: 'M2-defect-click',
		kind: 'defect',
		row: 'M2',
		what: 'the corpus gains a click directive, which strict would silently drop',
		setup: (dir) => {
			const posts = join(dir, 'posts', 'cat');
			mkdirSync(posts, { recursive: true });
			writeFileSync(
				join(posts, 'clicky.md'),
				[
					'---',
					'title: x',
					'---',
					'',
					'```mermaid',
					'flowchart LR',
					'  A --> B',
					'  click A "https://example.com"',
					'```',
					'',
				].join('\n'),
			);
			return { skipTypecheck: true, contentRoot: join(dir, 'posts') };
		},
	},
	{
		id: 'M2-invariance',
		kind: 'invariance',
		row: 'M2',
		what: 'a post gains prose but no fence',
		setup: (dir) => {
			const posts = join(dir, 'posts');
			cpSync(resolve(ROOT, 'src/content/posts'), posts, { recursive: true, dereference: true });
			const target = join(posts, 'extra.md');
			writeFileSync(target, '---\ntitle: prose only\n---\n\nNo diagrams here.\n');
			return { skipTypecheck: true, contentRoot: posts };
		},
	},
];

// ----------------------------------------------------------------------- main

export async function runControls(only?: string): Promise<number> {
	rmSync(SCRATCH, { recursive: true, force: true });
	mkdirSync(SCRATCH, { recursive: true });

	let passed = 0;
	const failures: string[] = [];
	const selected = only ? CONTROLS.filter((c) => c.id.includes(only)) : CONTROLS;

	for (const control of selected) {
		const dir = join(SCRATCH, control.id);
		mkdirSync(dir, { recursive: true });
		let rows: RowResult[] = [];
		let verdict: string;
		try {
			const options = control.setup(dir);
			const code = await runAssertions({
				...options,
				quiet: true,
				scratchDir: join(dir, 'harness'),
				falsifyDir: resolve(ROOT, 'tmp/c11-falsify'),
				onRows: (r) => {
					rows = r;
				},
			});
			const target = rows.find((r) => r.id === control.row);
			if (control.kind === 'defect') {
				if (code === 0)
					verdict = `the harness still exited 0: ${control.what} was not caught by ANY row`;
				else if (!target) verdict = `row ${control.row} did not run at all`;
				else if (target.ok) {
					const others = rows.filter((r) => !r.ok).map((r) => r.id);
					verdict = `the run exited ${code}, but row ${control.row} PASSED; the rows that failed were [${others.join(', ')}]. A control that trips a different row proves a different thing.`;
				} else verdict = 'ok';
			} else {
				const broken = rows.filter((r) => !r.ok);
				verdict =
					code === 0
						? 'ok'
						: `the harness exited ${code} on a change it must not care about; rows [${broken.map((r) => `${r.id}: ${r.detail}`).join(' | ')}]`;
			}
		} catch (error) {
			verdict = `control setup or run threw: ${(error as Error).message}`;
		}

		if (verdict === 'ok') {
			passed += 1;
			console.log(`PASS ${control.kind.padEnd(10)} ${control.id.padEnd(26)} ${control.what}`);
		} else {
			failures.push(`${control.id}: ${verdict}`);
			console.error(`FAIL ${control.kind.padEnd(10)} ${control.id.padEnd(26)} ${control.what}`);
			console.error(`       ${verdict}`);
		}
		rmSync(dir, { recursive: true, force: true });
	}

	for (const path of CLEANUP) rmSync(path, { force: true });
	rmSync(SCRATCH, { recursive: true, force: true });
	const defects = selected.filter((c) => c.kind === 'defect').length;
	console.log('');
	console.log(
		`C11 CONTROLS: ${passed}/${selected.length} (${defects} defect, ${selected.length - defects} invariance)`,
	);
	if (failures.length) {
		console.error(`${failures.length} control(s) failed:`);
		for (const line of failures) console.error(`  ${line}`);
		return 1;
	}
	console.log(
		'  every C11 row above has now been shown to fail for its own reason, and only for it.',
	);
	return 0;
}

if (process.argv[1] && process.argv[1].endsWith('assert-c11-library-ports-controls.ts')) {
	runControls(process.argv[2])
		.then((code) => process.exit(code))
		.catch((error: unknown) => {
			console.error(`FATAL: ${(error as Error).stack ?? String(error)}`);
			process.exit(2);
		});
}
