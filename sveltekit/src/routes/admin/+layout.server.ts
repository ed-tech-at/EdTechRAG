import type { LayoutServerLoad } from './$types';
import { requireValidJwt } from '$lib/server/jwt';

export const load: LayoutServerLoad = async ({ cookies, url, setHeaders }) => {
  setHeaders({
    'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    pragma: 'no-cache',
    expires: '0'
  });

  await requireValidJwt(cookies, url);
};
