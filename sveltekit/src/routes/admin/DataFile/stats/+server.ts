import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { requireValidJwt } from '$lib/server/jwt';

export const GET: RequestHandler = async ({ cookies, url }) => {
	await requireValidJwt(cookies, url);

	const [totalFiles, totalActiveFiles, notChunked] = await Promise.all([
		prisma.dataFile.count(),
		prisma.dataFile.count({ where: { invalidatedAt: null } }),
		prisma.dataFile.count({
			where: {
				chunkedAt: null,
				invalidatedAt: null
			}
		})
	]);

	return json({
		totalFiles,
		totalActiveFiles,
		notChunked
	});
};
