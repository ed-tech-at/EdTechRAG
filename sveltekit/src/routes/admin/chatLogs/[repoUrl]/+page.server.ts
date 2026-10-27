import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { requireAllowedRepository } from '$lib/server/repository';
import { loadConversationPage } from '$lib/server/chatConversations';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ cookies, params, url }) => {
	const { repoUrl } = params;
	await requireAllowedRepository(cookies, url, repoUrl);

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl },
		select: { url: true, name: true }
	});

	const requestedPage = Number(url.searchParams.get('page') ?? '1');
	const { groups, conversationCount, requestCount, page, pageCount } = await loadConversationPage(
		repoUrl,
		requestedPage,
		PAGE_SIZE
	);

	return {
		repository: repository ?? { url: repoUrl, name: repoUrl },
		groups,
		conversationCount,
		requestCount,
		page,
		pageCount,
		pageSize: PAGE_SIZE
	};
};
