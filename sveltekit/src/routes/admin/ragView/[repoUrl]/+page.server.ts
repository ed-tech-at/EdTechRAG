import { error, fail, json } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { embedText } from '$lib/server/embed';

export const load: PageServerLoad = async ({ params }) => {
	const { repoUrl } = params;

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl }
	});

	if (!repository) {
		throw error(404, 'Repository not found');
	}

	const repoListRaw = await prisma.repository.findMany({
		include: {
			_count: { select: { dataFiles: true } },
			dataFiles: {
				select: {
					_count: { select: { dataChunks: true } }
				}
			}
		},
		orderBy: { name: 'asc' }
	});

	const repositories = repoListRaw.map((repo) => {
		const chunkCount = repo.dataFiles.reduce((sum, file) => sum + (file._count?.dataChunks ?? 0), 0);
		return {
			url: repo.url,
			name: repo.name,
			fileCount: repo._count?.dataFiles ?? 0,
			chunkCount
		};
	});

	return { repository, repositories };
};

export const actions: Actions = {
	search: async ({ request, params }) => {
		const { repoUrl } = params;
		const formData = await request.formData();
		const query = formData.get('query');

		if (!query || typeof query !== 'string' || !query.trim()) {
			return fail(400, { success: false, message: 'Please enter a prompt.' });
		}
		const prompt = query.trim();

		try {
			const vector = await embedText(prompt);
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
			>`SELECT dc."id", dc."dataFileId", dc."chunkNr", dc."content", dc."embeddingModel", df."remoteUrl", df."meta", (dc."embeddingVector" <=> ${vectorLiteral}::vector) AS distance
        FROM "DataChunk" dc
        INNER JOIN "DataFile" df ON dc."dataFileId" = df."id"
        WHERE dc."embeddingVector" IS NOT NULL AND df."repositoryUrl" = ${repoUrl}
        ORDER BY (dc."embeddingVector" <=> ${vectorLiteral}::vector) ASC
        LIMIT 10`;

			const results = rows.map((row) => ({
				...row,
				similarity: 1 / (1 + row.distance),
				meta: row.meta ?? undefined,
				remoteUrl: row.remoteUrl ?? undefined
			}));

			console.log(results)
			let resultsEncode = JSON.stringify(results);

			return {
				success: true,
				resultsData: resultsEncode
				// query: prompt,
				// message: `Found ${results.length} similar chunk${results.length === 1 ? '' : 's'}.`
			};
		} catch (err) {
			console.error('RAG view search error', err);
			return fail(500, { success: false, message: 'Search failed. See server logs.' });
		}
	}
};
