import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { embedText } from '$lib/server/embed';
import { getEmbeddingConfig } from '$lib/server/openaiClient';

import { requireValidJwt } from '$lib/server/jwt';

export const POST: RequestHandler = async ({ cookies, url }) => {
	await requireValidJwt(cookies, url);

	const pendingChunks = await prisma.$queryRaw<
		{
			id: number;
			content: string | null;
			repositoryUrl: string | null;
		}[]
	>`SELECT "id","content","repositoryUrl"
		FROM "rag_vectors"."vector1536"
		WHERE "embeddingVector" IS NULL
		  AND "invalidatedAt" IS NULL
		  AND "content" IS NOT NULL
		  AND "repositoryUrl" IS NOT NULL
		ORDER BY "createdAt" ASC
		LIMIT 1`;

	const chunk = pendingChunks[0];
	if (!chunk) {
		return json({ status: 'empty' });
	}

	try {
		const vector = await embedText(chunk.content as string, chunk.repositoryUrl as string);
		if (!Array.isArray(vector) || vector.length === 0) {
			return json({ status: 'error', message: 'Embedding API returned no vector.' });
		}
		const vectorLiteral = `[${vector.join(',')}]`;
		const { embeddingModel } = await getEmbeddingConfig(chunk.repositoryUrl as string);

		await prisma.$executeRaw`
			UPDATE "rag_vectors"."vector1536"
			SET "embeddingVector" = ${vectorLiteral}::"rag_vectors".vector,
			    "embeddingModel" = ${embeddingModel},
			    "embeddedAt" = NOW(),
			    "invalidatedAt" = NULL
			WHERE "id" = ${chunk.id}
		`;

		return json({ status: 'embedded', chunkId: chunk.id, dimensions: vector.length });
	} catch (err) {
		console.error('Embedding failed', err);
		const message = err instanceof Error ? err.message : 'Embedding failed.';
		return json({ status: 'error', message });
	}
};
