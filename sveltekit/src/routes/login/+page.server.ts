import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSessionJWT, checkJwt } from '$lib/server/jwt';
import { login } from '$lib/server/pw';

import { resolve } from '$app/paths';


export const load: PageServerLoad = async ({ cookies }) => {
	const session = await checkJwt(cookies);
	if (session) {
		throw redirect(302, resolve('/'));
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

		const loginResult = await login(username, password, cookies);

		if (loginResult.success != true) {
			return fail(401, { success: false, message: 'Invalid credentials.' });
		}


		throw redirect(302, url.searchParams.get('redirectTo') ?? resolve('/admin'));
	}
};
