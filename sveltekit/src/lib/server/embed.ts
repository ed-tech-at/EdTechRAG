import prisma from '$lib/server/db';
import { getEmbeddingConfig } from '$lib/server/openaiClient';

// export const EMBEDDING_MODEL = 'embeddinggemma';

type EmbeddingResponse = {
	data?: { embedding?: number[] }[];
};

export async function embedText(text: string, repoUrl: string) {
	const { apiKey, embeddingBase, embeddingModel } = await getEmbeddingConfig(repoUrl);
	const buildEmbeddingUrl = () => new URL(embeddingBase).toString();

	const response = await fetch(buildEmbeddingUrl(), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
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
	const chunk = await prisma.dataChunk.findUnique({
		where: { id: chunkId },
		select: { id: true, content: true, dataFile: { select: { repositoryUrl: true } } }
	});

	if (!chunk || !chunk.content) {
		throw new Error('Chunk not found or empty content');
	}

	const vector = await embedText(chunk.content, chunk.dataFile.repositoryUrl);

	const vectorLiteral = `[${vector.join(',')}]`;

	await prisma.$executeRaw`UPDATE "DataChunk" SET "embeddingVector" = ${vectorLiteral}::vector, "embeddingModel" = ${
		(await getEmbeddingConfig(chunk.dataFile.repositoryUrl)).embeddingModel
	} WHERE "id" = ${chunkId}`;

	return { chunkId, dimensions: vector.length };
}
