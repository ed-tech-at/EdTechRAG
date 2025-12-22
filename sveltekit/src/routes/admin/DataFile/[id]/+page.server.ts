import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { embedText } from '$lib/server/embed';
import { splitTextIntoChunks } from '$lib/server/textSplitter';
import { getEmbeddingConfig } from '$lib/server/openaiClient';

export const load: PageServerLoad = async ({ params }) => {
	const dataFileId = Number(params.id);

	if (!Number.isInteger(dataFileId)) {
		throw error(400, 'Invalid data file id');
	}

	const dataFile = await prisma.dataFile.findUnique({
		where: { id: dataFileId },
		include: {
			repository: true
			// _count: { select: { dataChunks: true } }
		}
	});

	if (!dataFile) {
		throw error(404, 'Data file not found');
	}

	const vectorRows = await prisma.$queryRaw<
		{
			id: number;
			dataFileId: number | null;
			repositoryUrl: string | null;
			chunkNr: number | null;
			content: string | null;
			embeddingModel: string | null;
			createdAt: Date | null;
			embeddedAt: Date | null;
			invalidatedAt: Date | null;
		}[]
	>`SELECT "id","dataFileId","repositoryUrl","chunkNr","content","embeddingModel","createdAt","embeddedAt","invalidatedAt"
	  FROM "vector1536"
	  WHERE "dataFileId" = ${dataFileId} AND "invalidatedAt" is NULL
	  ORDER BY "chunkNr" ASC NULLS LAST, "createdAt" ASC`;

	const dataChunks = vectorRows.map((row) => ({
		...row,
		lastSeen: row.embeddedAt
	}));

	return {
		dataFile,
		dataChunks
	};
};

export const actions: Actions = {
	ingest: async ({ request, params }) => {
		const dataFileId = Number(params.id);
		const formData = await request.formData();
		const content = formData.get('content');

		if (!Number.isInteger(dataFileId)) {
			return fail(400, { success: false, message: 'Invalid data file id.' });
		}

		if (!content || typeof content !== 'string' || !content.trim()) {
			return fail(400, { success: false, message: 'Please paste some text to split.' });
		}

		const chunks = await splitTextIntoChunks(content);

		if (chunks.length === 0) {
			return fail(400, { success: false, message: 'No chunks found after splitting.' });
		}

		const existingDataFile = await prisma.dataFile.findUnique({
			where: { id: dataFileId },
			select: { id: true, repositoryUrl: true }
		});

		if (!existingDataFile) {
			return fail(404, { success: false, message: 'Data file not found.' });
		}

		const statements = [
			prisma.$executeRaw`UPDATE "vector1536" SET "invalidatedAt" = NOW() WHERE "dataFileId" = ${dataFileId}`,
			...chunks.map((chunk, idx) =>
				prisma.$executeRaw`INSERT INTO "vector1536" ("repositoryUrl","dataFileId","chunkNr","content","createdAt")
				VALUES (${existingDataFile.repositoryUrl}, ${dataFileId}, ${idx + 1}, ${chunk}, NOW())`
			)
		];

		await prisma.$transaction(statements);
		await prisma.dataFile.update({
			where: { id: dataFileId },
			data: { chunkedAt: new Date() }
		});

		return {
			success: true,
			message: `Replaced with ${chunks.length} chunk${chunks.length === 1 ? '' : 's'}.`
		};
	},
	embed: async ({ request }) => {
		const formData = await request.formData();
		const chunkId = formData.get('chunkId');

		if (!chunkId || typeof chunkId !== 'string') {
			return fail(400, { success: false, message: 'Missing chunk id.' });
		}

		const chunkIdNumber = Number(chunkId);
		if (!Number.isInteger(chunkIdNumber)) {
			return fail(400, { success: false, message: 'Invalid chunk id.' });
		}

		try {
			const [chunk] = await prisma.$queryRaw<
				{ id: number; content: string | null; repositoryUrl: string | null }[]
			>`SELECT "id","content","repositoryUrl" FROM "vector1536" WHERE "id" = ${chunkIdNumber} LIMIT 1`;

			if (!chunk || !chunk.content || !chunk.repositoryUrl) {
				return fail(404, { success: false, message: 'Chunk not found.' });
			}

			const vector = await embedText(chunk.content, chunk.repositoryUrl);
			const vectorLiteral = `[${vector.join(',')}]`;
			const { embeddingModel } = await getEmbeddingConfig(chunk.repositoryUrl);

			await prisma.$executeRaw`
				UPDATE "vector1536"
				SET "embeddingVector" = ${vectorLiteral}::vector,
					"embeddingModel" = ${embeddingModel},
					"embeddedAt" = NOW(),
					"invalidatedAt" = NULL
				WHERE "id" = ${chunkIdNumber}
			`;

			return {
				success: true,
				chunkId: chunkIdNumber,
				message: `Stored embedding (${vector.length} dims).`
			};
		} catch (err) {
			console.error('Embedding error', err);
			return fail(500, { success: false, message: 'Embedding failed. See server logs.' });
		}
	},
	search: async ({ request, params }) => {
		const formData = await request.formData();
		const query = formData.get('query');
		const dataFileId = Number(params.id);

		if (!query || typeof query !== 'string' || !query.trim()) {
			return fail(400, { success: false, message: 'Please enter a search query.' });
		}

		if (!Number.isInteger(dataFileId)) {
			return fail(400, { success: false, message: 'Invalid data file id.' });
		}

		try {
			const dataFile = await prisma.dataFile.findUnique({
				where: { id: dataFileId },
				select: { repositoryUrl: true }
			});

			if (!dataFile?.repositoryUrl) {
				return fail(404, { success: false, message: 'Data file not found.' });
			}

			const vector = await embedText(query, dataFile.repositoryUrl);
			const vectorLiteral = `[${vector.join(',')}]`;

			const rows = await prisma.$queryRaw<
				{
					id: number;
					dataFileId: number | null;
					chunkNr: number | null;
					content: string | null;
					embeddingModel: string | null;
					distance: number;
				}[]
			>`SELECT "id", "dataFileId", "chunkNr", "content", "embeddingModel",
					("embeddingVector" <=> ${vectorLiteral}::vector) AS distance
				FROM "vector1536"
				WHERE "embeddingVector" IS NOT NULL AND "dataFileId" = ${dataFileId}
				ORDER BY ("embeddingVector" <=> ${vectorLiteral}::vector) ASC
				LIMIT 10`;

			const results = rows.map((row) => ({
				...row,
				similarity: 1 / (1 + row.distance)
			}));

			return {
				success: true,
				results,
				message: `Found ${results.length} similar chunk${results.length === 1 ? '' : 's'}.`
			};
		} catch (err) {
			console.error('Vector search error', err);
			return fail(500, { success: false, message: 'Search failed. See server logs.' });
		}
	}
};
