import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getNumberDocuments, parseRagConfig } from '$lib/ragContext';
import prisma from '$lib/server/db';
import { findRepositoryContext } from '$lib/server/rag';
import { requireAllowedRepository } from '$lib/server/repository';

export const load: PageServerLoad = async ({ cookies, params, url }) => {
	const { repoUrl } = params;
	await requireAllowedRepository(cookies, url, repoUrl);

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl },
		select: { name: true, url: true }
	});

	if (!repository) {
		return {
			repositoryExists: false,
			repository: {
				name: repoUrl,
				url: repoUrl
			}
		};
	}

	return {
		repositoryExists: true,
		repository
	};
};

export const actions: Actions = {
	search: async ({ cookies, request, params, url }) => {
		const { repoUrl } = params;
		await requireAllowedRepository(cookies, url, repoUrl);
		const formData = await request.formData();
		const query = formData.get('query');

		if (!query || typeof query !== 'string' || !query.trim()) {
			return fail(400, { success: false, message: 'Please enter a search query.' });
		}

		try {
			const repository = await prisma.repository.findUnique({
				where: { url: repoUrl },
				select: { ragConfig: true }
			});

			if (!repository) {
				return fail(404, { success: false, message: 'Create the repository before searching.' });
			}

			const ragConfig = parseRagConfig(repository.ragConfig);
			return await findRepositoryContext(repoUrl, query, getNumberDocuments(ragConfig));
		} catch (err) {
			console.error('Vector search error', err);
			return fail(500, { success: false, message: 'Search failed. See server logs.' });
		}
	}
};
