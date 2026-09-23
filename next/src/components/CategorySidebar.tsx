'use client';

export interface CategoryItem {
	name: string;
	count: number;
}

export interface CategorySidebarProps {
	categories: CategoryItem[];
	activeCategory: string | null;
	onSelect: (category: string | null) => void;
	categoryFilterLabel?: string;
	allCategoriesLabel?: string;
}

/** Bar width in cells and posts per filled cell (`█` = 5 posts, rounded up). */
const BAR_CELLS = 12;
const POSTS_PER_CELL = 5;

/**
 * Block bar for a category count: `filled` cells of `█`, the rest `░`.
 * The count itself is announced as text, so the bar is decoration only.
 *
 * @example countBar(43) → { filled: '█████████', empty: '░░░' }
 */
export function countBar(
	count: number,
	cellSize = POSTS_PER_CELL,
	width = BAR_CELLS,
): { filled: string; empty: string } {
	const cells = Math.min(width, Math.max(0, Math.ceil(count / cellSize)));
	return { filled: '█'.repeat(cells), empty: '░'.repeat(width - cells) };
}

function FilterButton({
	label,
	count,
	pressed,
	bar,
	onClick,
}: {
	label: string;
	count: number;
	pressed: boolean;
	bar: boolean;
	onClick: () => void;
}) {
	const cells = bar ? countBar(count) : null;
	return (
		<button
			type="button"
			className={pressed ? 'pg-posts__cat is-sel' : 'pg-posts__cat'}
			aria-pressed={pressed}
			onClick={onClick}
		>
			<span className="pg-posts__mk" aria-hidden="true" />
			<span className="pg-posts__nm">{label}</span>
			<span className="pg-posts__c">{count}</span>
			<span className="pg-posts__bar" aria-hidden="true">
				{cells ? (
					<>
						{cells.filled}
						<span className="off">{cells.empty}</span>
					</>
				) : null}
			</span>
		</button>
	);
}

/**
 * CategorySidebar — the `/posts` category filter.
 *
 * Phosphor Fade: at 880px and up a selectable list (marker, name, count, block
 * bar) in the left pane; below that the same buttons wrap as pills (D7). One
 * `role="group"` of native toggle buttons with `aria-pressed`; the group wraps
 * the `<ul>` so the list keeps its semantics. Clicking the selected category
 * keeps it selected; only All clears the filter.
 */
export function CategorySidebar({
	categories,
	activeCategory,
	onSelect,
	categoryFilterLabel = 'Category filter',
	allCategoriesLabel = 'All',
}: CategorySidebarProps) {
	const totalCount = categories.reduce((sum, c) => sum + c.count, 0);

	return (
		<div role="group" aria-label={categoryFilterLabel}>
			<ul className="pg-posts__cats">
				<li>
					<FilterButton
						label={allCategoriesLabel}
						count={totalCount}
						pressed={activeCategory === null}
						bar={false}
						onClick={() => onSelect(null)}
					/>
				</li>
				<li className="pg-posts__rule" aria-hidden="true" />
				{categories.map((cat) => (
					<li key={cat.name}>
						<FilterButton
							label={cat.name}
							count={cat.count}
							pressed={activeCategory === cat.name}
							bar
							onClick={() => onSelect(cat.name)}
						/>
					</li>
				))}
			</ul>
		</div>
	);
}
