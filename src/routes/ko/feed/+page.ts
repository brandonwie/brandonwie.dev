import type { PageLoad } from './$types';
import feed from '$lib/data/social-feed.json';

export const prerender = true;

// V1: the feed snapshot is EN-only (campaign topics come from the archive);
// a .ko.json overlay is deferred until KO campaign copy exists (social-hub H3).
export const load: PageLoad = () => ({ campaigns: feed.campaigns });
