import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { assertPublicPageActive } from '$lib/server/repositoryAccess';
import { getNumberDocuments, getSystemPrompt, parseRagConfig } from '$lib/ragContext';

export const load: PageServerLoad = async ({ params }) => {
	const { repoUrl } = params;

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl },
		select: { url: true, name: true, ragConfig: true, activeParameterPage: true }
	});

	if (!repository) {
		throw error(404, 'Repository not found');
	}

	assertPublicPageActive(repository, 'parameter');

	const ragConfig = parseRagConfig(repository.ragConfig);
	const systemprompt = getSystemPrompt(ragConfig);
	const numberDocuments = getNumberDocuments(ragConfig);

	return { repositoryUrl: repository.url, repositoryName: repository.name, systemprompt, numberDocuments };
};
