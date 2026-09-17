import type { DsaModule } from '../../data/study';

/**
 * StudyRoadmap — module sequence for one DSA course.
 *
 * Port of `src/lib/components/study/StudyRoadmap.svelte`. The Svelte original
 * carries its layout in a scoped `<style>` block; the rules move with it into
 * `next/app/globals.css` (`.roadmap`), following the `.code-copy-btn`
 * precedent there for Next-owned component CSS. No client behavior: server
 * component.
 */
export default function StudyRoadmap({
	modules,
	ariaLabel,
}: {
	modules: DsaModule[];
	ariaLabel?: string;
}) {
	return (
		<ol className="roadmap" aria-label={ariaLabel}>
			{modules.map((module, index) => (
				<li key={index} id={`module-${index + 1}`} className="node">
					<span className="badge font-mono" aria-hidden="true">
						{String(index + 1).padStart(2, '0')}
					</span>
					<p className="font-mono text-xs uppercase tracking-wider text-accent">{module.kicker}</p>
					<h3 className="mt-2 text-base font-semibold text-ink">{module.title}</h3>
					<p className="mt-2 text-sm leading-7 text-muted">{module.summary}</p>
				</li>
			))}
		</ol>
	);
}
