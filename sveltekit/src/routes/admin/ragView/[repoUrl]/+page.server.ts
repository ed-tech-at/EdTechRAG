import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { findRepositoryContext } from '$lib/server/rag';
import { filterAllowedRepositories, requireAllowedRepository } from '$lib/server/repository';
import {
	getMetaTags,
	getNumberDocuments,
	getSystemPrompt,
	parseRagConfig
} from '$lib/ragContext';

export const load: PageServerLoad = async ({ cookies, params, url }) => {
	const { repoUrl } = params;
	const session = await requireAllowedRepository(cookies, url, repoUrl);

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl }
	});

	if (!repository) {
		throw error(404, 'Repository not found');
	}

	const ragConfig = parseRagConfig(repository.ragConfig);
	const systemprompt = getSystemPrompt(ragConfig);
	const numberDocuments = getNumberDocuments(ragConfig);
	const metaTags = getMetaTags(ragConfig);

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

	return { repository, repositories, systemprompt, numberDocuments, metaTags };
};

export const actions: Actions = {
	saveSystemPrompt: async ({ cookies, request, params, url }) => {
		const { repoUrl } = params;
		await requireAllowedRepository(cookies, url, repoUrl);

		const formData = await request.formData();
		const systempromptValue = formData.get('systemprompt');
		const systemprompt = typeof systempromptValue === 'string' ? systempromptValue : '';
		const numberDocumentsValue = formData.get('numberDocuments');
		const metaTagsValue = formData.get('metaTags');
		const parsedNumberDocuments =
			typeof numberDocumentsValue === 'string' && numberDocumentsValue.trim()
				? Number(numberDocumentsValue)
				: undefined;
		const numberDocuments =
			typeof parsedNumberDocuments === 'number' &&
			Number.isFinite(parsedNumberDocuments) &&
			parsedNumberDocuments > 0
				? Math.floor(parsedNumberDocuments)
				: undefined;
		const metaTags =
			typeof metaTagsValue === 'string'
				? metaTagsValue
						.split(/[\n,]/)
						.map((item) => item.trim())
						.filter(Boolean)
				: [];

		try {
			const repository = await prisma.repository.findUnique({
				where: { url: repoUrl },
				select: { ragConfig: true }
			});

			if (!repository) {
				return fail(404, { success: false, message: 'Repository not found.' });
			}

			const ragConfig = parseRagConfig(repository.ragConfig) ?? {};

			await prisma.repository.update({
				where: { url: repoUrl },
				data: {
					ragConfig: {
						...ragConfig,
						systemprompt,
						numberDocuments,
						metaTags
					}
				}
			});

			return {
				success: true,
				systemPromptSaved: true,
				systemprompt,
				numberDocuments,
				metaTags: metaTags.join(', '),
				message: 'RAG config saved.'
			};
		} catch (err) {
			console.error('System prompt update error', err);
			return fail(500, {
				success: false,
				systemPromptSaved: false,
				systemprompt,
				numberDocuments,
				metaTags: metaTags.join(', '),
				message: 'Saving RAG config failed. See server logs.'
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
			const repository = await prisma.repository.findUnique({
				where: { url: repoUrl },
				select: { ragConfig: true }
			});
			const ragConfig = parseRagConfig(repository?.ragConfig);
			const { results, message } = await findRepositoryContext(
				repoUrl,
				prompt,
				getNumberDocuments(ragConfig)
			);
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
