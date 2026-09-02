import type { Metadata } from 'next';

import { Article, generateArticleMetadata, generateArticleStaticParams } from '@/content/article';

export const dynamicParams = false;

export function generateStaticParams(): Array<{ slug: string }> {
	return generateArticleStaticParams();
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const { slug } = await params;
	return generateArticleMetadata(slug, 'en');
}

export default async function EnglishArticlePage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	return <Article slug={slug} locale="en" />;
}
