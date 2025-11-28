import { error, fail } from '@sveltejs/kit';
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

	return { repositoryName: repository.name, repositoryUrl: repository.url };
};

export const actions: Actions = {
	search: async ({ request, params }) => {
		const { repoUrl } = params;
		const formData = await request.formData();
		const query = formData.get('query');

		if (!query || typeof query !== 'string' || !query.trim()) {
			return fail(400, { success: false, message: 'Please enter a search query.' });
		}

		try {
			const vector = await embedText(query, repoUrl);
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

			return {
				success: true,
				results,
				message: `Found ${results.length} similar chunk${results.length === 1 ? '' : 's'}.`
			};
		} catch (err) {
			console.error('Repository search error', err);
			return fail(500, { success: false, message: 'Search failed. See server logs.' });
		}
	}
};
