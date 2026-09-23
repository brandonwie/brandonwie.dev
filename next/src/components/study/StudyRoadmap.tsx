import type { DsaModule } from '../../data/study';

/**
 * StudyRoadmap — module sequence for one DSA course, drawn as `ls modules/
 * --roadmap` output: an amber `[01]` badge trailed by a `─` rule that joins the
 * next node, then the kicker, the `h3` and the summary. Four columns from `md`,
 * one column below (`.sc-map` in `next/app/styles/pages/study-course.css`).
 *
 * The rule is a typographic run of box-drawing characters clipped by the column,
 * so it is decorative (`aria-hidden`) and the last node's rule is transparent.
 * The `module-n` ids stay: they are anchor targets. Server-safe, no state.
 */
export default function StudyRoadmap({
	modules,
	ariaLabel,
}: {
	modules: DsaModule[];
	ariaLabel?: string;
}) {
	return (
		<ol className="sc-map" aria-label={ariaLabel}>
			{modules.map((module, index) => (
				<li key={index} id={`module-${index + 1}`}>
					<div className="sc-map__rail" aria-hidden="true">
						<b>[{String(index + 1).padStart(2, '0')}]</b>
						{'─'.repeat(40)}
					</div>
					<p className="sc-kick">{module.kicker}</p>
					<h3 className="sc-h">{module.title}</h3>
					<p className="sc-small">{module.summary}</p>
				</li>
			))}
		</ol>
	);
}
