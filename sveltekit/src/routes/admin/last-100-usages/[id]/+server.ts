import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { requireUserManager } from '$lib/server/jwt';
import { isRepositoryAllowed } from '$lib/server/repository';

/** Full ChatLog row for the detail modal; fetched lazily because context/history can be large. */
export const GET: RequestHandler = async ({ cookies, url, params }) => {
	const session = await requireUserManager(cookies, url);
	const id = Number(params.id);
	if (!Number.isInteger(id)) {
		throw error(400, 'Invalid id');
	}

	const log = await prisma.chatLog.findUnique({ where: { id } });
	if (!log || !isRepositoryAllowed(session, log.repositoryUrl)) {
		throw error(404, 'Chat log not found');
	}

	return json(log);
};
