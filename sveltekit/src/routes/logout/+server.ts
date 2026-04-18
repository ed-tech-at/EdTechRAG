import type { RequestHandler } from './$types';

import { resolve } from '$app/paths';

export const GET: RequestHandler = async ({ cookies }) => {
	cookies.delete('jwt', {
		path: resolve('/')
	});

	return new Response(null, {
		status: 303,
		headers: {
			location: resolve('/login'),
			'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
			pragma: 'no-cache',
			expires: '0'
		}
	});
};
