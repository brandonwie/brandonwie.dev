import { rssXml, xmlResponse } from '@/content/feeds';

// Static export: the handler runs once at build time and lands as build/ko/rss.xml.
export const dynamic = 'force-static';

export function GET(): Response {
	return xmlResponse(rssXml('ko'));
}
