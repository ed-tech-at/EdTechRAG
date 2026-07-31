import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { requireAllowedRepository } from '$lib/server/repository';
import { getNumberDocuments, getQueryRewriteConfig, parseRagConfig } from '$lib/ragContext';

export const load: PageServerLoad = async ({ cookies, params, url }) => {
	const { repoUrl } = params;
	await requireAllowedRepository(cookies, url, repoUrl);

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl }
	});

	if (!repository) {
		throw error(404, 'Repository not found');
	}

	const ragConfig = parseRagConfig(repository.ragConfig);
	const rewrite = getQueryRewriteConfig(ragConfig, getNumberDocuments(ragConfig));

	return {
		repository: { url: repository.url, name: repository.name },
		rewrite
	};
};
