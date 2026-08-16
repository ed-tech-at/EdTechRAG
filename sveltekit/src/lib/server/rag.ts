import { Prisma } from '../../generated/prisma/client';
import prisma from '$lib/server/db';
import { embedText } from '$lib/server/embed';
import { quotedVectorColumnForAlias } from '$lib/server/vectorTable';

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

/**
 * Semantic retrieval over the embedded chunks.
 *
 * `lang` is optional and filters on meta.lang - the value the GenAI export writes
 * into every document. The chatbot passes nothing and is therefore unaffected; the
 * site search passes the language of the page, so a German search does not return
 * the English translation of the same article as a second, separate hit.
 */
export async function findRepositoryContext(
	repoUrl: string,
	prompt: string,
	limit: number = 4,
	lang?: string
) {
	const vector = await embedText(prompt, repoUrl);
	const vectorLiteral = `[${vector.join(',')}]`;
	const vectorColumn = await quotedVectorColumnForAlias('rv');

	if (!vectorColumn) {
		return {
			results: [],
			message: 'The vector table has no embedding vector column.',
			query: prompt
		};
	}

	// console.log("searching for " + prompt);

	// console.log("vectorLiteral");
	// console.log(vectorLiteral);

	// Prisma.empty when no language is given: the fragment then disappears from the
	// statement instead of becoming an always-true comparison.
	const langFilter = lang ? Prisma.sql`AND df."meta"->>'lang' = ${lang}` : Prisma.empty;

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
			(${vectorColumn} OPERATOR(rag_vectors.<=>) ${vectorLiteral}::"rag_vectors".vector) AS distance
		FROM "rag_vectors"."vector1536" rv
		LEFT JOIN "DataFile" df ON rv."dataFileId" = df."id"
		WHERE ${vectorColumn} IS NOT NULL
		  AND rv."repositoryUrl" = ${repoUrl}
		  AND rv."invalidatedAt" IS NULL
		  ${langFilter}
		ORDER BY (${vectorColumn} OPERATOR(rag_vectors.<=>) ${vectorLiteral}::"rag_vectors".vector) ASC
		LIMIT ${limit}`;

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
