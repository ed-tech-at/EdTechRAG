import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { findRepositoryContext } from '$lib/server/rag';
import { filterAllowedRepositories, requireAllowedRepository } from '$lib/server/repository';

export const load: PageServerLoad = async ({ cookies, params, url }) => {
	const { repoUrl } = params;
	const session = await requireAllowedRepository(cookies, url, repoUrl);

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl }
	});

	if (!repository) {
		throw error(404, 'Repository not found');
	}

	const ragConfig =
		repository.ragConfig && typeof repository.ragConfig === 'object' && !Array.isArray(repository.ragConfig)
			? (repository.ragConfig as Record<string, unknown>)
			: undefined;
	const systemprompt = typeof ragConfig?.systemprompt === 'string' ? ragConfig.systemprompt : '';

	const repoListRaw = await prisma.repository.findMany({
		include: {
			_count: { select: { dataFiles: true } },
			// dataFiles: {
				// select: {
					// _count: { select: { dataChunks: true } }
				// }
			// }
		},
		orderBy: { name: 'asc' }
	});
	const allowedRepos = filterAllowedRepositories(session, repoListRaw, (repo) => repo.url);

	const repositories = allowedRepos.map((repo) => {
		// const chunkCount = repo.dataFiles.reduce((sum, file) => sum + (file._count?.dataChunks ?? 0), 0);
		return {
			url: repo.url,
			name: repo.name,
			fileCount: repo._count?.dataFiles ?? 0,
			// chunkCount
		};
	});

	return { repository, repositories, systemprompt };
};

export const actions: Actions = {
	saveSystemPrompt: async ({ cookies, request, params, url }) => {
		const { repoUrl } = params;
		await requireAllowedRepository(cookies, url, repoUrl);

		const formData = await request.formData();
		const systempromptValue = formData.get('systemprompt');
		const systemprompt = typeof systempromptValue === 'string' ? systempromptValue : '';

		try {
			const repository = await prisma.repository.findUnique({
				where: { url: repoUrl },
				select: { ragConfig: true }
			});

			if (!repository) {
				return fail(404, { success: false, message: 'Repository not found.' });
			}

			const ragConfig =
				repository.ragConfig &&
				typeof repository.ragConfig === 'object' &&
				!Array.isArray(repository.ragConfig)
					? (repository.ragConfig as Record<string, unknown>)
					: {};

			await prisma.repository.update({
				where: { url: repoUrl },
				data: {
					ragConfig: {
						...ragConfig,
						systemprompt
					}
				}
			});

			return {
				success: true,
				systemPromptSaved: true,
				systemprompt,
				message: 'System prompt saved.'
			};
		} catch (err) {
			console.error('System prompt update error', err);
			return fail(500, {
				success: false,
				systemPromptSaved: false,
				systemprompt,
				message: 'Saving system prompt failed. See server logs.'
			});
		}
	},
	search: async ({ cookies, request, params, url }) => {
		const { repoUrl } = params;
		await requireAllowedRepository(cookies, url, repoUrl);
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
