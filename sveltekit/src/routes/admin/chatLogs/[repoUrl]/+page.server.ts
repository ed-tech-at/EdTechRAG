import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { requireAllowedRepository } from '$lib/server/repository';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ cookies, params, url }) => {
	const { repoUrl } = params;
	await requireAllowedRepository(cookies, url, repoUrl);

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl },
		select: { url: true, name: true }
	});

	const requestedPage = Number(url.searchParams.get('page') ?? '1');
	const total = await prisma.chatLog.count({ where: { repositoryUrl: repoUrl } });
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const page = Number.isFinite(requestedPage)
		? Math.min(Math.max(1, Math.floor(requestedPage)), pageCount)
		: 1;

	const logs = await prisma.chatLog.findMany({
		where: { repositoryUrl: repoUrl },
		orderBy: { createdAt: 'desc' },
		skip: (page - 1) * PAGE_SIZE,
		take: PAGE_SIZE
	});

	// Normalise `history` (stored as Json) into a plain list of {role, content}.
	const items = logs.map((log) => {
		const history = Array.isArray(log.history)
			? (log.history as unknown[])
					.map((entry) =>
						entry && typeof entry === 'object'
							? {
									role: String((entry as Record<string, unknown>).role ?? ''),
									content: String((entry as Record<string, unknown>).content ?? '')
							  }
							: null
					)
					.filter((entry): entry is { role: string; content: string } => entry !== null)
			: [];

		return {
			id: log.id,
			createdAt: log.createdAt ? log.createdAt.toISOString() : null,
			endpoint: log.endpoint,
			username: log.username,
			source: log.source,
			question: log.question,
			context: log.context,
			answer: log.answer,
			history
		};
	});

	return {
		repository: repository ?? { url: repoUrl, name: repoUrl },
		items,
		page,
		pageCount,
		pageSize: PAGE_SIZE,
		total
	};
};
