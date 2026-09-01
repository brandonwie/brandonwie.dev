/**
 * C7 — `fallback: '404.html'` in adapter-static maps to Next's not-found route,
 * which `output: 'export'` emits as `build/404.html`.
 */
export default function NotFound() {
	return <main>404</main>;
}
