import { sitemapXml, xmlResponse } from '@/content/feeds';

// Static export: the handler runs once at build time and lands as build/sitemap.xml.
export const dynamic = 'force-static';

export function GET(): Response {
	return xmlResponse(sitemapXml());
}
