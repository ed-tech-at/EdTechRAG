import type { RequestHandler } from './$types';
import { requireAllowedRepository } from '$lib/server/repository';
import { loadAllRowsForExport } from '$lib/server/chatConversations';
import { buildChatWorkbook } from '$lib/server/chatExcel';

const fileNameFor = (repositoryUrl: string) => {
	const scope = repositoryUrl
		.replace(/^https?:\/\//, '')
		.replace(/[^a-z0-9]+/gi, '-')
		.replace(/^-|-$/g, '');
	const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
	return `chats-${scope || 'repo'}-${stamp}.xlsx`;
};

/** GET → all chats of the repository as .xlsx, grouped by conversation. */
export const GET: RequestHandler = async ({ cookies, params, url }) => {
	const { repoUrl } = params;
	await requireAllowedRepository(cookies, url, repoUrl);

	const { conversations, rows } = await loadAllRowsForExport(repoUrl);
	const body = await buildChatWorkbook(conversations, rows);

	return new Response(body, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${fileNameFor(repoUrl)}"`,
			'Cache-Control': 'no-store'
		}
	});
};
