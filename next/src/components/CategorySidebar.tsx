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

/**
 * CategorySidebar — category filter for the posts list.
 *
 * Terminal redesign: a single horizontal chip row (used on every viewport).
 * Ports `src/lib/components/CategorySidebar.svelte`.
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
		<div className="chips" role="group" aria-label={categoryFilterLabel}>
			<button
				type="button"
				className={`chip${activeCategory === null ? ' is-active' : ''}`}
				aria-pressed={activeCategory === null}
				onClick={() => onSelect(null)}
			>
				{allCategoriesLabel}
				<span className="chip__count">{totalCount}</span>
			</button>
			{categories.map((cat) => (
				<button
					key={cat.name}
					type="button"
					className={`chip${activeCategory === cat.name ? ' is-active' : ''}`}
					aria-pressed={activeCategory === cat.name}
					onClick={() => onSelect(cat.name)}
				>
					{cat.name}
					<span className="chip__count">{cat.count}</span>
				</button>
			))}
		</div>
	);
}
