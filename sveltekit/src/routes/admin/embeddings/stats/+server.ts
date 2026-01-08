import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';

import { requireValidJwt } from '$lib/server/jwt';

export const GET: RequestHandler = async ({ cookies, url }) => {
	await requireValidJwt(cookies, url);


	const rows = await prisma.$queryRaw<
		{ total: bigint; invalidated: bigint; missing_vector: bigint }[]
	>`SELECT
			COUNT(*)::bigint AS total,
			COUNT(*) FILTER (WHERE "invalidatedAt" IS NOT NULL)::bigint AS invalidated,
			COUNT(*) FILTER (WHERE "embeddingVector" IS NULL AND "invalidatedAt" IS NULL)::bigint AS missing_vector
		FROM "rag_vectors"."vector1536"`;

	const stats = rows[0] ?? { total: 0n, invalidated: 0n, missing_vector: 0n };

	return json({
		total: Number(stats.total ?? 0n),
		invalidated: Number(stats.invalidated ?? 0n),
		missingVector: Number(stats.missing_vector ?? 0n)
	});
};
