import prisma from '$lib/server/db';
import { OPENAI_API_KEY, OPENAI_API_BASE } from '$env/static/private';

export const EMBEDDING_MODEL = 'embeddinggemma';

type EmbeddingResponse = {
	data?: { embedding?: number[] }[];
};

const buildEmbeddingUrl = () => new URL('embeddings', OPENAI_API_BASE).toString();

export async function embedText(text: string) {
	const response = await fetch(buildEmbeddingUrl(), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${OPENAI_API_KEY}`
		},
		body: JSON.stringify({
			model: EMBEDDING_MODEL,
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
		select: { id: true, content: true }
	});

	if (!chunk || !chunk.content) {
		throw new Error('Chunk not found or empty content');
	}

	const vector = await embedText(chunk.content);

	const vectorLiteral = `[${vector.join(',')}]`;

	await prisma.$executeRaw`UPDATE "DataChunk" SET "embeddingVector" = ${vectorLiteral}::vector, "embeddingModel" = ${EMBEDDING_MODEL} WHERE "id" = ${chunkId}`;

	return { chunkId, dimensions: vector.length };
}
