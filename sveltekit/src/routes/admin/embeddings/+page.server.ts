import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';

const PAGE_SIZE = 100;

type VectorRow = {
	id: number;
	repositoryUrl: string | null;
	dataFileId: number | null;
	chunkNr: number | null;
	content: string | null;
	embeddingModel: string | null;
	createdAt: Date | null;
	embeddedAt: Date | null;
	invalidatedAt: Date | null;
	hasVector: boolean;
	vectorPreview: string | null;
};

export const load: PageServerLoad = async ({ url }) => {
	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

	const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
		SELECT COUNT(*)::bigint AS count FROM "rag_vectors"."vector1536"
	`;
	const totalCount = Number(countRows[0]?.count ?? 0n);
	const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
	const page = Math.min(currentPage, totalPages);
	const offset = (page - 1) * PAGE_SIZE;

	const items = await prisma.$queryRaw<VectorRow[]>`
		SELECT
			"id",
			"repositoryUrl",
			"dataFileId",
			"chunkNr",
			"content",
			"embeddingModel",
			"createdAt",
			"embeddedAt",
			"invalidatedAt",
			("embeddingVector" IS NOT NULL) AS "hasVector",
			CASE
				WHEN "embeddingVector" IS NOT NULL THEN LEFT(("embeddingVector"::text), 200)
				ELSE NULL
			END AS "vectorPreview"
		FROM "rag_vectors"."vector1536"
		ORDER BY ("invalidatedAt" IS NULL) DESC, ("embeddingVector" IS NULL) DESC, "embeddedAt" DESC NULLS LAST, "createdAt" ASC NULLS LAST, "id" DESC
		OFFSET ${offset}
		LIMIT ${PAGE_SIZE}
	`;

	return {
		items,
		pagination: {
			page,
			pageSize: PAGE_SIZE,
			totalPages,
			totalCount
		}
	};
};
