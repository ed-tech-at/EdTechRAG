import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { findRepositoryContext } from '$lib/server/rag';

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

	const ragConfig =
		repository.ragConfig && typeof repository.ragConfig === 'object' && !Array.isArray(repository.ragConfig)
			? (repository.ragConfig as Record<string, unknown>)
			: undefined;
	const systemprompt = typeof ragConfig?.systemprompt === 'string' ? ragConfig.systemprompt : '';

	return { repositoryUrl: repository.url, repositoryName: repository.name, systemprompt };
};
