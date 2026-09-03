'use client';

import { Component, type ReactNode } from 'react';

/**
 * Error boundary around the lazily loaded graph.
 *
 * `next/dynamic` has NO error callback: a rejected chunk throws to the nearest
 * boundary. Without one, S8's failure mode degrades to a blank hole in the page
 * — the graph is simply absent, with nothing distinguishing "failed to load"
 * from "still loading" from "never existed". That silent equivalence is exactly
 * what the scenario exists to rule out, so the reporting path is a component,
 * not a console line.
 *
 * A class component because `getDerivedStateFromError` has no hook equivalent.
 */
export class System3bGraphBoundary extends Component<
	{ fallback: ReactNode; children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	componentDidCatch(error: unknown) {
		console.error('[System3bGraph] failed to load interactive graph:', error);
	}

	render() {
		return this.state.failed ? this.props.fallback : this.props.children;
	}
}
