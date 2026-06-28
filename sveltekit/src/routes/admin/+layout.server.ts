import type { LayoutServerLoad } from './$types';
import { requireValidJwt } from '$lib/server/jwt';
import { canManageUsers, SITE_ROLE } from '$lib/siteRole';

type AdminBreadcrumb = {
	label: string;
	href?: string;
};

const decodePathSegment = (segment: string) => {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
};

const encodePathSegment = (segment: string) => encodeURIComponent(decodePathSegment(segment));

const buildAdminBreadcrumbs = (pathname: string): AdminBreadcrumb[] => {
	const segments = pathname.split('/').filter(Boolean);
	const adminIndex = segments.indexOf('admin');
	const adminSegments = adminIndex === -1 ? [] : segments.slice(adminIndex + 1);
	const [section, slug, child] = adminSegments;

	if (!section) {
		return [];
	}

	if (section === 'repositories') {
		const breadcrumbs: AdminBreadcrumb[] = [{ label: 'Repositories', href: '/admin/repositories' }];

		if (slug) {
			const encodedSlug = encodePathSegment(slug);
			breadcrumbs.push({
				label: decodePathSegment(slug),
				href: child ? `/admin/repositories/${encodedSlug}` : undefined
			});
		}

		if (child === 'files' && slug) {
			breadcrumbs.push({ label: 'Files' });
		}

		return breadcrumbs;
	}

	if (section === 'DataFile') {
		const breadcrumbs: AdminBreadcrumb[] = [{ label: 'Data files', href: '/admin/DataFile' }];

		if (slug) {
			breadcrumbs.push({ label: `#${decodePathSegment(slug)}` });
		}

		return breadcrumbs;
	}

	if (section === 'embeddings') {
		return [{ label: 'Embeddings' }];
	}

	if (section === 'ragView') {
		const breadcrumbs: AdminBreadcrumb[] = [{ label: 'RAG View', href: '/admin/ragView' }];

		if (slug) {
			breadcrumbs.push({ label: decodePathSegment(slug) });
		}

		return breadcrumbs;
	}

	if (section === 'users') {
		return [{ label: 'User management' }];
	}

	return [{ label: decodePathSegment(section) }];
};

export const load: LayoutServerLoad = async ({ cookies, url, setHeaders, depends }) => {
	depends('auth:user');

	setHeaders({
		'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
		pragma: 'no-cache',
		expires: '0'
	});

	const session = await requireValidJwt(cookies, url);

	return {
		breadcrumbs: buildAdminBreadcrumbs(url.pathname),
		canManageUsers: canManageUsers(session.role ?? SITE_ROLE.GUEST)
	};
};
