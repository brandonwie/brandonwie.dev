import type { PageLoad } from './$types';
import feed from '$lib/data/social-feed.json';

export const prerender = true;

export const load: PageLoad = () => ({ campaigns: feed.campaigns });
