import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { requireValidJwt } from '$lib/server/jwt';
import { filterAllowedRepositories } from '$lib/server/repository';

export const load: PageServerLoad = async ({ cookies, url }) => {
	const session = await requireValidJwt(cookies, url);
	const repos = await prisma.repository.findMany({
		include: {
			_count: { select: { dataFiles: true } },
			// dataFiles: {
				// select: {
					// _count: { select: { dataChunks: true } }
				// }
			// }
		},
		orderBy: { name: 'asc' }
	});
	const allowedRepos = filterAllowedRepositories(session, repos, (repo) => repo.url);

	const repositories = allowedRepos.map((repo) => {
		// const chunkCount = repo.dataFiles.reduce((sum, file) => sum + (file._count?.dataChunks ?? 0), 0);
		return {
			url: repo.url,
			name: repo.name,
			fileCount: repo._count?.dataFiles ?? 0,
			// chunkCount
		};
	});

	return { repositories };
};
