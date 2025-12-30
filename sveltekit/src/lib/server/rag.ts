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

	console.log("searching for " + prompt);

			console.log("vectorLiteral");
		console.log(vectorLiteral);

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
	>`SELECT rv."id", rv."dataFileId", rv."chunkNr", rv."content", rv."embeddingModel", df."remoteUrl", df."meta",
			(rv."embeddingVector" OPERATOR(rag_vectors.<=>) ${vectorLiteral}::"rag_vectors".vector) AS distance
		FROM "rag_vectors"."vector1536" rv
		LEFT JOIN "DataFile" df ON rv."dataFileId" = df."id"
		WHERE rv."embeddingVector" IS NOT NULL
		  AND rv."repositoryUrl" = ${repoUrl}
		  AND rv."invalidatedAt" IS NULL
		ORDER BY (rv."embeddingVector" OPERATOR(rag_vectors.<=>) ${vectorLiteral}::"rag_vectors".vector) ASC
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
