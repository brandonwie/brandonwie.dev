import * as m from '../paraglide/messages.js';

import type { Locale } from './locale';

/**
 * Copy for the /system/3b graph, resolved for one locale.
 *
 * Separate from `shellCopy`/`articleCopy` because its consumers are reached
 * through React Flow's `nodeTypes`, which passes only `NodeProps` — a custom
 * node cannot take a `locale` prop. The locale therefore arrives by context
 * (see `GraphLocaleProvider`), and this stays the single place the graph's
 * messages are read, with every call carrying an explicit `{ locale }` for the
 * same reason the shell copy does: under `output: 'export'` there is no request
 * context for `getLocale()` to consult.
 */
export function graphCopy(locale: Locale) {
	return {
		expand: m.system_3b_graph_expand({}, { locale }),
		expandHint: m.system_3b_graph_expand_hint({}, { locale }),
		overview: m.system_3b_graph_overview({}, { locale }),
		back: m.system_3b_graph_back({}, { locale }),
		loading: m.system_3b_graph_loading({}, { locale }),
		unavailable: m.system_3b_graph_unavailable({}, { locale }),
		nodesLabel: m.system_3b_nodes_label({}, { locale }),
		relationsLegend: m.system_3b_graph_relations_legend({}, { locale }),
		/**
		 * Legend labels, keyed by the style-map keys. Static property refs rather
		 * than m[key] so every key resolves at build time; a kind with no entry
		 * falls back to its style .label at the call site.
		 */
		kindLabel: {
			subsystem: m.system_3b_kind_subsystem({}, { locale }),
			generator: m.system_3b_kind_generator({}, { locale }),
			runtime: m.system_3b_kind_runtime({}, { locale }),
			store: m.system_3b_kind_store({}, { locale }),
			doc: m.system_3b_kind_doc({}, { locale }),
			gate: m.system_3b_kind_gate({}, { locale }),
		} as Record<string, string | undefined>,
		edgeLabel: {
			dependency: m.system_3b_edge_dependency({}, { locale }),
			reads: m.system_3b_edge_reads({}, { locale }),
			writes: m.system_3b_edge_writes({}, { locale }),
			generates: m.system_3b_edge_generates({}, { locale }),
			triggers: m.system_3b_edge_triggers({}, { locale }),
			dataflow: m.system_3b_edge_dataflow({}, { locale }),
			symlink: m.system_3b_edge_symlink({}, { locale }),
		} as Record<string, string | undefined>,
	};
}

export type GraphCopy = ReturnType<typeof graphCopy>;
