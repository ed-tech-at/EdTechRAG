import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';

import { requireValidJwt } from '$lib/server/jwt';
import { getRepositoryAccessRegex } from '$lib/server/repository';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const session = await requireValidJwt(cookies, url);
	const allowRegex = getRepositoryAccessRegex(session);
	if (!allowRegex || !session.allow_regex) {
		return json({
			total: 0,
			invalidated: 0,
			missingVector: 0
		});
	}


	const rows = await prisma.$queryRaw<
		{ total: bigint; invalidated: bigint; missing_vector: bigint }[]
	>`SELECT
			COUNT(*)::bigint AS total,
			COUNT(*) FILTER (WHERE "invalidatedAt" IS NOT NULL)::bigint AS invalidated,
			COUNT(*) FILTER (WHERE "embeddingVector" IS NULL AND "invalidatedAt" IS NULL)::bigint AS missing_vector
		FROM "rag_vectors"."vector1536"
		WHERE "repositoryUrl" IS NOT NULL
		  AND "repositoryUrl" ~ ${session.allow_regex}`;

	const stats = rows[0] ?? { total: 0n, invalidated: 0n, missing_vector: 0n };

	return json({
		total: Number(stats.total ?? 0n),
		invalidated: Number(stats.invalidated ?? 0n),
		missingVector: Number(stats.missing_vector ?? 0n)
	});
};
