import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const dataFiles = await prisma.dataFile.findMany({
		include: {
			// repository: true,
			_count: { select: { dataChunks: true } }
		},
		orderBy: { createdAt: 'desc' }
	});

	return { dataFiles };
};
