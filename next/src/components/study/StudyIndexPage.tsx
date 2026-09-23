import { AppLink } from '@/components/AppLink';
import { TermPrompt } from '@/shell/TermPrompt';
import { cwdFor } from '@/shell/terminal-path';
import StudyPageShell from './StudyPageShell';
import { getStudyIndexContent, type StudyIndexCourse, type StudyLocale } from '../../data/study';

/** Cells in the `dsa mod 0–15` meter: one per DSA module across the courses. */
const MODULE_CELLS = 16;

/**
 * Module numbers a course covers, read from its `modules` labels
 * (`"Module 4"` → 4). Empty for a course whose modules are named sections
 * (the AWS cram sheet), which the listing shows as `— N sections` instead.
 */
function moduleNumbers(course: StudyIndexCourse): number[] {
	const numbers = course.modules.map((label) => /^Module (\d+)$/.exec(label)?.[1]);
	return numbers.every((n) => n !== undefined) ? numbers.map(Number) : [];
}

/** `[███░░░…]`: the module span as a 16-cell block meter (decorative). */
function ModuleMeter({ numbers }: { numbers: number[] }) {
	const on = new Set(numbers);
	return (
		<span className="term-meter" aria-hidden="true">
			<span className="off">[</span>
			{Array.from({ length: MODULE_CELLS }, (_, cell) =>
				on.has(cell) ? (
					<span key={cell}>█</span>
				) : (
					<span key={cell} className="off">
						░
					</span>
				),
			)}
			<span className="off">]</span>
		</span>
	);
}

/**
 * StudyIndexPage — the `/study` course catalog as a terminal session:
 * `cat README.md` (hero + "the approach" pane), an `ls -l courses/` listing
 * with a module-span meter, one frame per course under `cat courses/*\/INDEX`,
 * and `cat approach.txt`.
 *
 * Every string comes from `getStudyIndexContent(locale)`; the listing columns,
 * key names (`learned`, `modules`) and the `total …` line are terminal syntax
 * derived from the same array, and stay English in both locales like the
 * prompts. Each course is linked twice (listing row + frame): the frames are
 * the tab stops (as the cards were), the rows are pointer shortcuts with
 * `tabIndex={-1}` so five destinations cost five tab stops, not ten.
 */
export default function StudyIndexPage({ locale = 'en' }: { locale?: StudyLocale }) {
	const content = getStudyIndexContent(locale);
	const basePath = locale === 'ko' ? '/ko' : '';
	const cwd = cwdFor(`${basePath}/study`);
	const courses = content.courses.map((course) => ({ course, numbers: moduleNumbers(course) }));
	const dsa = courses.filter(({ numbers }) => numbers.length > 0);
	const covered = dsa.flatMap(({ numbers }) => numbers);
	const certifications = courses.length - dsa.length;
	const totals = [`total ${courses.length}`];
	if (dsa.length > 0) {
		totals.push(
			`${dsa.length} dsa courses cover modules ${Math.min(...covered)}–${Math.max(...covered)}`,
		);
	}
	if (certifications > 0) {
		totals.push(`${certifications} certification${certifications === 1 ? '' : 's'}`);
	}

	return (
		<StudyPageShell className="pg-study-index">
			<TermPrompt cwd={cwd} command="cat README.md" />
			<section className="st-hero">
				<div>
					<p className="term-eyebrow">{content.eyebrow}</p>
					<h1 className="term-ttl term-worn">{content.title}</h1>
					<p className="st-lede">{content.subtitle}</p>
				</div>
				<aside className="term-frame si-about">
					<h2 className="term-frame__title">{content.sections.approach}</h2>
					<p className="si-about__h">{content.approach.title}</p>
					<p className="si-about__bd">{content.approach.body}</p>
				</aside>
			</section>

			<section className="st-sec">
				<TermPrompt cwd={cwd} command="ls -l courses/" flags="--sort=updated" />
				<div className="term-frame si-ls">
					<h2 className="term-frame__title">
						{content.sections.courses}{' '}
						<span className="dim" aria-hidden="true">
							· {courses.length}
						</span>
					</h2>
					<div className="si-ls__hd" aria-hidden="true">
						<span className="si-ls__perm">mode</span>
						<span>status</span>
						<span>updated</span>
						<span className="si-ls__mtr">dsa mod 0–15</span>
						<span>name</span>
						<span>title</span>
					</div>
					{courses.length > 0 ? (
						<ul className="si-ls__rows">
							{courses.map(({ course, numbers }) => (
								<li key={course.slug}>
									<AppLink href={course.href} className="si-ls__row" tabIndex={-1}>
										<span className="si-ls__perm">dr-x</span>
										<span className="si-ls__st">{course.status}</span>
										<span className="si-ls__dt">{course.updated}</span>
										<span className="si-ls__mtr">
											{numbers.length > 0 ? (
												<ModuleMeter numbers={numbers} />
											) : (
												<span className="si-ls__none">— {course.modules.length} sections</span>
											)}
										</span>
										<span className="si-ls__nm">{course.slug}/</span>
										<span className="si-ls__ti">{course.title}</span>
									</AppLink>
								</li>
							))}
						</ul>
					) : null}
					<p className="si-ls__tot">{totals.join(' · ')}</p>
				</div>
			</section>

			{courses.length > 0 ? (
				<section className="st-sec">
					<TermPrompt cwd={cwd} command="cat courses/*/INDEX" />
					<div className="si-grid">
						{courses.map(({ course, numbers }) => (
							<AppLink
								key={course.slug}
								href={course.href}
								className={`term-frame si-course${numbers.length > 0 ? '' : ' is-wide'}`}
							>
								<span className="term-frame__title">
									{course.slug}/ <span className="dim">· {course.updated}</span>
								</span>
								<span className="si-course__stat">[{course.status}]</span>
								<h3>{course.title}</h3>
								<span className="si-course__sum">{course.summary}</span>
								<span className="si-kv">
									<span className="si-kv__k">learned</span>
									<span className="si-kv__v">{course.learned.join(' · ')}</span>
								</span>
								<span className="si-kv">
									<span className="si-kv__k">{numbers.length > 0 ? 'modules' : 'sections'}</span>
									<span className="si-mods">
										{course.modules.map((module) => (
											<span key={module}>
												<i aria-hidden="true">&gt; </i>
												{module}
											</span>
										))}
									</span>
								</span>
								<span className="si-course__foot">
									<span># {course.meta}</span>
									<span className="si-course__go" aria-hidden="true">
										cd ./{course.slug} ↵
									</span>
								</span>
							</AppLink>
						))}
					</div>
				</section>
			) : null}

			<section className="st-sec">
				<TermPrompt cwd={cwd} command="cat approach.txt" />
				<div className="term-frame si-approach">
					<p className="term-frame__title">
						approach.txt <span className="dim">· {content.approach.items.length} lines</span>
					</p>
					<ul>
						{content.approach.items.map((item) => (
							<li key={item}>
								<i aria-hidden="true">/</i>
								{item}
							</li>
						))}
					</ul>
				</div>
			</section>
		</StudyPageShell>
	);
}
