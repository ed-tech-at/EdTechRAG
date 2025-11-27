import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	PW_USER_LOKAL1,
	PW_USER_LOKAL2,
	PW_USER_LOKAL3,
	PW_USER_LOKAL4,
	PW_USER_LOKAL5
} from '$env/static/private';
import { createSessionJWT, checkJwt } from '$lib/server/jwt';

import { resolve } from '$app/paths';


export const load: PageServerLoad = async ({ cookies }) => {
	const session = await checkJwt(cookies);
	if (session) {
		throw redirect(302, '/');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const data = await request.formData();
		const username = data.get('username');
		const password = data.get('password');

		if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
			return fail(400, { success: false, message: 'Username and password required.' });
		}

		const creds: Record<string, string | undefined> = {
			lokal1: PW_USER_LOKAL1,
			lokal2: PW_USER_LOKAL2,
			lokal3: PW_USER_LOKAL3,
			lokal4: PW_USER_LOKAL4,
			lokal5: PW_USER_LOKAL5
		};

		const expectedPw = creds[username];

		if (!expectedPw || password !== expectedPw) {
			return fail(401, { success: false, message: 'Invalid credentials.' });
		}

		const token = await createSessionJWT({ sub: username, name: username });
		cookies.set('jwt', token, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 60 * 60
		});

		throw redirect(302, url.searchParams.get('redirectTo') ?? resolve('/admin'));
	}
};
