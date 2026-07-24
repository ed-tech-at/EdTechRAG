import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { requireValidJwt } from '$lib/server/jwt';
import { filterAllowedRepositories } from '$lib/server/repository';

export const load: PageServerLoad = async ({ cookies, url }) => {
	const session = await requireValidJwt(cookies, url);
	const repos = await prisma.repository.findMany({
		include: {
			_count: { select: { dataFiles: true } }
		},
		orderBy: { name: 'asc' }
	});
	const allowedRepos = filterAllowedRepositories(session, repos, (repo) => repo.url);

	const repositories = allowedRepos.map((repo) => ({
		url: repo.url,
		name: repo.name,
		fileCount: repo._count?.dataFiles ?? 0
	}));

	return { repositories };
};
