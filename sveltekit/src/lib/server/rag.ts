import prisma from '$lib/server/db';
import { embedText } from '$lib/server/embed';

export type RagResult = {
	id: string;
	dataFileId: string;
	chunkNr: number | null;
	content: string | null;
	embeddingModel: string | null;
	remoteUrl?: string;
	meta?: unknown;
	distance: number;
	similarity: number;
};

export async function findRepositoryContext(repoUrl: string, prompt: string) {
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
	>`SELECT dc."id", dc."dataFileId", dc."chunkNr", dc."content", dc."embeddingModel", df."remoteUrl", df."meta", (dc."embeddingVector" OPERATOR(rag_vectors.<=>) ${vectorLiteral}::"rag_vectors".vector) AS distance
    FROM "DataChunk" dc
    INNER JOIN "DataFile" df ON dc."dataFileId" = df."id"
    WHERE dc."embeddingVector" IS NOT NULL AND df."repositoryUrl" = ${repoUrl}
    ORDER BY (dc."embeddingVector" OPERATOR(rag_vectors.<=>) ${vectorLiteral}::"rag_vectors".vector) ASC
    LIMIT 10`;

	const results: RagResult[] = rows.map((row) => ({
		...row,
		similarity: 1 / (1 + row.distance),
		meta: row.meta ?? undefined,
		remoteUrl: row.remoteUrl ?? undefined
	}));

	return {
		results,
		message: `Found ${results.length} similar chunk${results.length === 1 ? '' : 's'}.`,
		query: prompt
	};
}
