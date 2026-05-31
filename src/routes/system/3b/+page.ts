import type { PageLoad } from './$types';
import snapshot from '$lib/data/system-snapshot.json';

export const prerender = true;

export const load: PageLoad = () => ({ snapshot });
