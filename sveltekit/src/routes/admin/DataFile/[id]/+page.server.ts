import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { embedChunkById, embedText } from '$lib/server/embed';

export const load: PageServerLoad = async ({ params }) => {
	const { id } = params;

	const dataFile = await prisma.dataFile.findUnique({
		where: { id },
		include: {
			repository: true,
			_count: { select: { dataChunks: true } }
		}
	});

	if (!dataFile) {
		throw error(404, 'Data file not found');
	}

	const dataChunks = await prisma.dataChunk.findMany({
		where: { dataFileId: id },
		orderBy: [{ chunkNr: 'asc' }, { createdAt: 'asc' }]
	});

	return {
		dataFile,
		dataChunks
	};
};

export const actions: Actions = {
	embed: async ({ request }) => {
		const formData = await request.formData();
		const chunkId = formData.get('chunkId');

		if (!chunkId || typeof chunkId !== 'string') {
			return fail(400, { success: false, message: 'Missing chunk id.' });
		}

		try {
			const result = await embedChunkById(chunkId);
			return {
				success: true,
				chunkId: result.chunkId,
				message: `Stored embedding (${result.dimensions} dims).`
			};
		} catch (err) {
			console.error('Embedding error', err);
			return fail(500, { success: false, message: 'Embedding failed. See server logs.' });
		}
	},
	search: async ({ request }) => {
		const formData = await request.formData();
		const query = formData.get('query');

		if (!query || typeof query !== 'string' || !query.trim()) {
			return fail(400, { success: false, message: 'Please enter a search query.' });
		}

		try {
			const vector = await embedText(query);
			const vectorLiteral = `[${vector.join(',')}]`;

			const rows = await prisma.$queryRaw<
				{
					id: string;
					dataFileId: string;
					chunkNr: number | null;
					content: string | null;
					embeddingModel: string | null;
					distance: number;
				}[]
			>`SELECT "id", "dataFileId", "chunkNr", "content", "embeddingModel", ("embeddingVector" <=> ${vectorLiteral}::vector) AS distance
        FROM "DataChunk"
        WHERE "embeddingVector" IS NOT NULL
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
