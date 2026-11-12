import { AppLink } from '@/components/AppLink';
import StudyPageShell from './StudyPageShell';
import { getStudyIndexContent, type StudyLocale } from '../../data/study';

/**
 * StudyIndexPage — the `/study` course catalog: a header, one entry per
 * course, and the approach. Every string comes from
 * `getStudyIndexContent(locale)`. Each course title is a `data-row` link, so
 * the site's `j` / `k` shortcut walks the list.
 */
export default function StudyIndexPage({ locale = 'en' }: { locale?: StudyLocale }) {
	const content = getStudyIndexContent(locale);

	return (
		<StudyPageShell>
			<header className="study__head">
				<p className="eyebrow">{content.eyebrow}</p>
				<h1>{content.title}</h1>
				<p className="study__lede">{content.subtitle}</p>
			</header>

			{content.courses.length > 0 ? (
				<section className="study__section" aria-labelledby="study-courses">
					<h2 id="study-courses" className="study__h2">
						{content.sections.courses}
					</h2>
					<ul className="study__courses">
						{content.courses.map((course) => (
							<li key={course.slug} className="study__course">
								<p className="study__course-meta">
									<span className="study__status">{course.status}</span>
									<span>{course.updated}</span>
								</p>
								<h3>
									<AppLink href={course.href} className="study__course-link" data-row>
										{course.title}
									</AppLink>
								</h3>
								<p className="study__course-sum">{course.summary}</p>
								<ul className="study__tags">
									{course.learned.map((item) => (
										<li key={item} className="tag">
											{item}
										</li>
									))}
								</ul>
								<p className="study__modules">{course.modules.join(' · ')}</p>
								<p className="study__course-note">{course.meta}</p>
							</li>
						))}
					</ul>
				</section>
			) : null}

			<section className="study__section" aria-labelledby="study-approach">
				<h2 id="study-approach" className="study__h2">
					{content.sections.approach}
				</h2>
				<p className="study__approach-lead">{content.approach.title}</p>
				<p className="study__approach-body">{content.approach.body}</p>
				<ul className="study__approach">
					{content.approach.items.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
			</section>
		</StudyPageShell>
	);
}
