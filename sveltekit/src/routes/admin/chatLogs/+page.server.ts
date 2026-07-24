import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { requireValidJwt } from '$lib/server/jwt';
import { filterAllowedRepositories } from '$lib/server/repository';

export const load: PageServerLoad = async ({ cookies, url }) => {
	const session = await requireValidJwt(cookies, url);

	const repos = await prisma.repository.findMany({
		orderBy: { name: 'asc' }
	});
	const allowedRepos = filterAllowedRepositories(session, repos, (repo) => repo.url);

	// ChatLog has no relation to Repository (repositoryUrl is a plain string),
	// so counts are fetched with a groupBy and merged in.
	const counts = await prisma.chatLog.groupBy({
		by: ['repositoryUrl'],
		_count: { _all: true }
	});
	const countByUrl = new Map<string, number>();
	for (const row of counts) {
		if (row.repositoryUrl) countByUrl.set(row.repositoryUrl, row._count._all);
	}

	const repositories = allowedRepos.map((repo) => ({
		url: repo.url,
		name: repo.name,
		chatCount: countByUrl.get(repo.url) ?? 0
	}));

	return { repositories };
};
