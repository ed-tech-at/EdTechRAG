import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';

export const load: PageServerLoad = async () => {
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

	const repositories = repos.map((repo) => {
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
