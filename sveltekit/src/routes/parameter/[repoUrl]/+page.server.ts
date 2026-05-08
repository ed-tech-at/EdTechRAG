import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { getNumberDocuments, getSystemPrompt, parseRagConfig } from '$lib/ragContext';

export const load: PageServerLoad = async ({ params }) => {
	const { repoUrl } = params;

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl }
	});

	if (!repository) {
		return {
			status: 404,
			error: new Error('Repository not found')
		};
	}

	const ragConfig = parseRagConfig(repository.ragConfig);
	const systemprompt = getSystemPrompt(ragConfig);
	const numberDocuments = getNumberDocuments(ragConfig);

	return { repositoryUrl: repository.url, repositoryName: repository.name, systemprompt, numberDocuments };
};
