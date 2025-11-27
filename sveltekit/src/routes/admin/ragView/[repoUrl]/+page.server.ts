import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { findRepositoryContext } from '$lib/server/rag';

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
			const { results, message } = await findRepositoryContext(repoUrl, prompt);
			const resultsEncode = JSON.stringify(results);

			return {
				success: true,
				results,
				resultsData: resultsEncode,
				query: prompt,
				message
			};
		} catch (err) {
			console.error('RAG view search error', err);
			return fail(500, { success: false, message: 'Search failed. See server logs.' });
		}
	}
};
