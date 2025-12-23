import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';

const PAGE_SIZE = 100;

export const load: PageServerLoad = async ({ url }) => {
	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

	const totalCount = await prisma.dataFile.count();
	const totalActiveFiles = await prisma.dataFile.count({where: {invalidatedAt: null}});
	const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
	const page = Math.min(currentPage, totalPages);
	const offset = (page - 1) * PAGE_SIZE;

	const [dataFiles, notChunkedCount] = await Promise.all([
		prisma.dataFile.findMany({
			// where: {
				// invalidatedAt: null 
			// },
			orderBy: [  {invalidatedAt: 'desc' }, {createdAt: 'desc'}],
			skip: offset,
			take: PAGE_SIZE
		}),
		prisma.dataFile.count({
			where: { chunkedAt: null, 
				invalidatedAt: null 

			 }
		})
	]);

	const dataFileIds = dataFiles.map((file) => file.id);
	const chunkCounts =
		dataFileIds.length === 0
			? []
			: await prisma.$queryRaw<{ dataFileId: number | null; chunkCount: number }[]>`
				SELECT "dataFileId", COUNT(*)::int AS "chunkCount"
				FROM "rag_vectors"."vector1536"
				WHERE "invalidatedAt" IS NULL
					AND "dataFileId" IS NOT NULL
					AND "dataFileId" = ANY(${dataFileIds})
				GROUP BY "dataFileId"
			`;

	const countMap = new Map<number, number>();
	for (const row of chunkCounts) {
		if (row.dataFileId !== null) {
			countMap.set(row.dataFileId, row.chunkCount);
		}
	}

	const dataFilesWithCounts = dataFiles.map((file) => ({
		...file,
		_count: {
			dataChunks: countMap.get(file.id) ?? 0
		}
	}));

	return {
		dataFiles: dataFilesWithCounts,
		stats: {
			totalFiles: totalCount,
			totalActiveFiles: totalActiveFiles,
			notChunked: notChunkedCount
		},
		pagination: {
			page,
			pageSize: PAGE_SIZE,
			totalPages,
			totalCount
		}
	};
};
