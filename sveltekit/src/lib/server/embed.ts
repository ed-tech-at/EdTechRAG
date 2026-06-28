import prisma from '$lib/server/db';
import { getEmbeddingConfig } from '$lib/server/openaiClient';
import { quotedVectorColumn } from '$lib/server/vectorTable';

// export const EMBEDDING_MODEL = 'embeddinggemma';

type EmbeddingResponse = {
	data?: { embedding?: number[] }[];
};

export async function embedText(text: string, repoUrl: string) {
	const { apiKeyEmbedding, embeddingBase, embeddingModel } = await getEmbeddingConfig(repoUrl);
	const buildEmbeddingUrl = () => new URL(embeddingBase).toString();
	const vectorColumn = await quotedVectorColumn();

	const existingVectorRows = vectorColumn
		? await prisma.$queryRaw<{ vectorText: string | null }[]>`
			SELECT ${vectorColumn}::text AS "vectorText"
			FROM "rag_vectors"."vector1536"
			WHERE "content" = ${text}
			  AND "embeddingModel" = ${embeddingModel}
			  AND ${vectorColumn} IS NOT NULL
			ORDER BY "embeddedAt" DESC NULLS LAST
			LIMIT 1
		`
		: [];

	const cachedVectorText = existingVectorRows[0]?.vectorText?.trim();
	if (cachedVectorText) {
		const normalized =
			cachedVectorText.startsWith('[') && cachedVectorText.endsWith(']')
				? cachedVectorText.slice(1, -1)
				: cachedVectorText;

		if (normalized) {
			const cachedVector = normalized.split(',').map((value) => Number(value.trim()));
			if (cachedVector.length && cachedVector.every((value) => Number.isFinite(value))) {
				
				// console.log("resusing cached vecotr")
				return cachedVector;
			}
		}
	}

	const response = await fetch(buildEmbeddingUrl(), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKeyEmbedding}`
		},
		body: JSON.stringify({
			model: embeddingModel,
			input: [text],
			stream: false
		})
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Embedding API error: ${response.status} ${errorText}`);
	}

	const body = (await response.json()) as EmbeddingResponse;
	const vector = body.data?.[0]?.embedding;

	if (!vector || !Array.isArray(vector)) {
		throw new Error('Invalid embedding response');
	}

	return vector;
}

export async function embedChunkById(chunkId: string) {
	const chunkIdNumber = Number(chunkId);
	if (!Number.isInteger(chunkIdNumber)) {
		throw new Error('Invalid chunk id');
	}

	const [chunk] = await prisma.$queryRaw<
		{ id: number; content: string | null; repositoryUrl: string | null }[]
	>`SELECT "id","content","repositoryUrl"
		FROM "rag_vectors"."vector1536"
		WHERE "id" = ${chunkIdNumber}
		LIMIT 1`;

	if (!chunk || !chunk.content || !chunk.repositoryUrl) {
		throw new Error('Chunk not found or empty content');
	}

	const vector = await embedText(chunk.content, chunk.repositoryUrl);
	const vectorColumn = await quotedVectorColumn();
	if (!vectorColumn) {
		throw new Error(
			'The rag_vectors.vector1536 table has no embedding vector column. Add "embeddingVector" with type rag_vectors.vector(1536).'
		);
	}

	const vectorLiteral = `[${vector.join(',')}]`;
	const { embeddingModel } = await getEmbeddingConfig(chunk.repositoryUrl);

	await prisma.$executeRaw`UPDATE "rag_vectors"."vector1536"
		SET ${vectorColumn} = ${vectorLiteral}::"rag_vectors".vector,
			"embeddingModel" = ${embeddingModel},
			"embeddedAt" = NOW(),
			"invalidatedAt" = NULL
		WHERE "id" = ${chunkIdNumber}`;

	return { chunkId: chunkIdNumber, dimensions: vector.length };
}
