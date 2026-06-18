import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';

export const handle: Handle = async ({ event, resolve }) => {
	return paraglideMiddleware(
		event.request,
		({ locale }) => {
			return resolve(event, {
				transformPageChunk: ({ html }) => html.replace('%lang%', locale),
			});
		},
		{
			effectiveRequestUrl: event.url,
		},
	);
};
