import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { resolve } from '$app/paths';

export const GET: RequestHandler = async ({ cookies }) => {
	cookies.delete('jwt', { path: resolve('/') });
	throw redirect(302, resolve('/'));
};
