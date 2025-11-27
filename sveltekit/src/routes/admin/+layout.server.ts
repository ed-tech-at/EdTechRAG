import { redirect, error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { requireValidJwt } from '$lib/server/jwt';

import { resolve } from '$app/paths';

export const load: LayoutServerLoad = async ({ cookies, url }) => {
  let jwt = await requireValidJwt(cookies, url);
  
};
