import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { assertPublicPageActive } from '$lib/server/repositoryAccess';

export const load: PageServerLoad = async ({ params }) => {
	const { repoUrl } = params;

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl },
		select: { url: true, name: true, activeSimplePage: true }
	});

	if (!repository) {
		throw error(404, 'Repository not found');
	}

	assertPublicPageActive(repository, 'simple');

	return { repositoryUrl: repository.url, repositoryName: repository.name };
};
