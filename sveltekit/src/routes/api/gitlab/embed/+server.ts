import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { embedText } from '$lib/server/embed';
import { getEmbeddingConfig } from '$lib/server/openaiClient';
import { logGitLabApiRequest, parseGitLabApiRequest } from '$lib/server/gitlabApi';

export const POST: RequestHandler = async ({ request }) => {
	const parsed = await parseGitLabApiRequest(request);
	if (!parsed.ok) {
		await logGitLabApiRequest(request, '/api/gitlab/embed/', parsed.repositoryUrl, {
			status: parsed.status,
			success: false,
			error: parsed.message
		});
		return json({ success: false, message: parsed.message }, { status: parsed.status });
	}

	const { repositoryUrl } = parsed;

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
		  AND "repositoryUrl" = ${repositoryUrl}
		ORDER BY "createdAt" ASC`;

	if (pendingChunks.length === 0) {
		await logGitLabApiRequest(request, '/api/gitlab/embed/', repositoryUrl, {
			status: 200,
			success: true,
			message: 'No chunks pending for embedding.',
			chunksTotal: 0,
			chunksEmbedded: 0,
			chunksFailed: 0
		});
		return json({
			success: true,
			status: 'empty',
			message: 'No chunks pending for embedding.',
			chunksTotal: 0,
			chunksEmbedded: 0,
			chunksFailed: 0,
			errors: []
		});
	}

	const errors: string[] = [];
	let chunksEmbedded = 0;

	for (const chunk of pendingChunks) {
		try {
			const vector = await embedText(chunk.content as string, repositoryUrl);
			if (!Array.isArray(vector) || vector.length === 0) {
				throw new Error(`Embedding API returned no vector for chunk #${chunk.id}.`);
			}

			const vectorLiteral = `[${vector.join(',')}]`;
			const { embeddingModel } = await getEmbeddingConfig(repositoryUrl);

			await prisma.$executeRaw`
				UPDATE "rag_vectors"."vector1536"
				SET "embeddingVector" = ${vectorLiteral}::"rag_vectors".vector,
				    "embeddingModel" = ${embeddingModel},
				    "embeddedAt" = NOW(),
				    "invalidatedAt" = NULL
				WHERE "id" = ${chunk.id}
			`;

			console.log(`GitLab embedding complete for chunk #${chunk.id}: ${vector.length} dims`);
			chunksEmbedded += 1;
		} catch (err) {
			console.error(`GitLab embedding failed for chunk #${chunk.id}`, err);
			errors.push(err instanceof Error ? err.message : `Embedding failed for chunk #${chunk.id}.`);
		}
	}

	const success = errors.length === 0;
	const responseBody = {
		success,
		status: success ? 'embedded' : 'partial',
		message: success
			? `Embedded ${chunksEmbedded} chunk${chunksEmbedded === 1 ? '' : 's'}.`
			: `Embedded ${chunksEmbedded} of ${pendingChunks.length} chunks.`,
		chunksTotal: pendingChunks.length,
		chunksEmbedded,
		chunksFailed: pendingChunks.length - chunksEmbedded,
		errors
	};

	await logGitLabApiRequest(request, '/api/gitlab/embed/', repositoryUrl, {
		status: 200,
		success,
		resultStatus: responseBody.status,
		message: responseBody.message,
		chunksTotal: responseBody.chunksTotal,
		chunksEmbedded: responseBody.chunksEmbedded,
		chunksFailed: responseBody.chunksFailed,
		errors
	});

	return json(responseBody);
};
