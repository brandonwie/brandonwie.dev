import type { DsaModule } from '../../data/study';

/**
 * StudyRoadmap — module sequence for one DSA course: an ordered list of the
 * kicker, the `h3` and the summary. Columns from `md`, one column below
 * (`.course__map` in `next/app/styles/pages/study-course.css`).
 *
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
		<ol className="course__map" aria-label={ariaLabel}>
			{modules.map((module, index) => (
				<li key={index} id={`module-${index + 1}`}>
					<p className="eyebrow">{module.kicker}</p>
					<h3 className="course__h3">{module.title}</h3>
					<p className="course__body">{module.summary}</p>
				</li>
			))}
		</ol>
	);
}
