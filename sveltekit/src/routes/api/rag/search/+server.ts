import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { embedText } from '$lib/server/embed';

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch (err) {
		throw error(400, 'Invalid JSON body');
	}

	const repoUrl =
		body && typeof body === 'object' && 'repoUrl' in body && typeof (body as any).repoUrl === 'string'
			? (body as any).repoUrl
			: '';
	const prompt =
		body && typeof body === 'object' && 'query' in body && typeof (body as any).query === 'string'
			? (body as any).query.trim()
			: '';

	if (!repoUrl) {
		throw error(400, 'Missing repoUrl');
	}

	if (!prompt) {
		throw error(400, 'Missing query');
	}

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl }
	});

	if (!repository) {
		throw error(404, 'Repository not found');
	}

	const vector = await embedText(prompt, repoUrl);
	const vectorLiteral = `[${vector.join(',')}]`;

	const rows = await prisma.$queryRaw<
		{
			id: string;
			dataFileId: string;
			chunkNr: number | null;
			content: string | null;
			embeddingModel: string | null;
			remoteUrl: string | null;
			meta: unknown;
			distance: number;
		}[]
	>`SELECT dc."id", dc."dataFileId", dc."chunkNr", dc."content", dc."embeddingModel", df."remoteUrl", df."meta", (dc."embeddingVector" OPERATOR(rag_vectors.<=>) ${vectorLiteral}::rag_vectors.vector) AS distance
    FROM "DataChunk" dc
    INNER JOIN "DataFile" df ON dc."dataFileId" = df."id"
    WHERE dc."embeddingVector" IS NOT NULL AND df."repositoryUrl" = ${repoUrl}
    ORDER BY (dc."embeddingVector" OPERATOR(rag_vectors.<=>) ${vectorLiteral}::rag_vectors.vector) ASC
    LIMIT 10`;

	const results = rows.map((row) => ({
		...row,
		similarity: 1 / (1 + row.distance),
		meta: row.meta ?? undefined,
		remoteUrl: row.remoteUrl ?? undefined
	}));

	return json({
		success: true,
		results,
		query: prompt,
		message: `Found ${results.length} similar chunk${results.length === 1 ? '' : 's'}.`
	});
};
