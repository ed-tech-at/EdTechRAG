import type { PageServerLoad } from './$types';
import { Prisma } from '../../../generated/prisma/client';
import prisma from '$lib/server/db';
import { requireValidJwt } from '$lib/server/jwt';
import { getRepositoryAccessRegex } from '$lib/server/repository';
import { quotedVectorColumn } from '$lib/server/vectorTable';

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

export const load: PageServerLoad = async ({ cookies, url }) => {
	const session = await requireValidJwt(cookies, url);
	const allowRegex = getRepositoryAccessRegex(session);
	if (!allowRegex || !session.allow_regex) {
		return {
			items: [],
			pagination: {
				page: 1,
				pageSize: PAGE_SIZE,
				totalPages: 1,
				totalCount: 0
			}
		};
	}
	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

	const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
		SELECT COUNT(*)::bigint AS count
		FROM "rag_vectors"."vector1536"
		WHERE "repositoryUrl" IS NOT NULL
		  AND "repositoryUrl" ~ ${session.allow_regex}
	`;
	const totalCount = Number(countRows[0]?.count ?? 0n);
	const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
	const page = Math.min(currentPage, totalPages);
	const offset = (page - 1) * PAGE_SIZE;
	const vectorColumn = await quotedVectorColumn();

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
			${vectorColumn ? Prisma.sql`${vectorColumn} IS NOT NULL` : Prisma.sql`FALSE`} AS "hasVector",
			${vectorColumn ? Prisma.sql`LEFT((${vectorColumn}::text), 200)` : Prisma.sql`NULL`} AS "vectorPreview"
		FROM "rag_vectors"."vector1536"
		WHERE "repositoryUrl" IS NOT NULL
		  AND "repositoryUrl" ~ ${session.allow_regex}
		ORDER BY
			("invalidatedAt" IS NULL) DESC,
			${vectorColumn ? Prisma.sql`(${vectorColumn} IS NULL) DESC,` : Prisma.empty}
			"embeddedAt" DESC NULLS LAST,
			"createdAt" ASC NULLS LAST,
			"id" DESC
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
