import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { assertPublicPageActive } from '$lib/server/repositoryAccess';
import { getWebviewConfig, parseRagConfig } from '$lib/ragContext';

export const load: PageServerLoad = async ({ params }) => {
	const { repoUrl } = params;

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl },
		select: { url: true, name: true, ragConfig: true, activeWebviewPage: true }
	});

	if (!repository) {
		throw error(404, 'Repository not found');
	}

	assertPublicPageActive(repository, 'webview');

	return {
		repositoryUrl: repository.url,
		repositoryName: repository.name,
		webview: getWebviewConfig(parseRagConfig(repository.ragConfig))
	};
};
