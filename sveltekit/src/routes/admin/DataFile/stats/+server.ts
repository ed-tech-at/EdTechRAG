import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { requireValidJwt } from '$lib/server/jwt';
import { getRepositoryAccessRegex } from '$lib/server/repository';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const session = await requireValidJwt(cookies, url);
	const allowRegex = getRepositoryAccessRegex(session);
	if (!allowRegex || !session.allow_regex) {
		return json({
			totalFiles: 0,
			totalActiveFiles: 0,
			notChunked: 0
		});
	}

	const [totalFiles, totalActiveFiles, notChunked] = await Promise.all([
		prisma.$queryRaw<{ count: bigint }[]>`
			SELECT COUNT(*)::bigint AS count
			FROM "DataFile"
			WHERE "repositoryUrl" ~ ${session.allow_regex}
		`,
		prisma.$queryRaw<{ count: bigint }[]>`
			SELECT COUNT(*)::bigint AS count
			FROM "DataFile"
			WHERE "repositoryUrl" ~ ${session.allow_regex}
			  AND "invalidatedAt" IS NULL
		`,
		prisma.$queryRaw<{ count: bigint }[]>`
			SELECT COUNT(*)::bigint AS count
			FROM "DataFile"
			WHERE "repositoryUrl" ~ ${session.allow_regex}
			  AND "chunkedAt" IS NULL
			  AND "invalidatedAt" IS NULL
		`
	]);

	return json({
		totalFiles: Number(totalFiles[0]?.count ?? 0n),
		totalActiveFiles: Number(totalActiveFiles[0]?.count ?? 0n),
		notChunked: Number(notChunked[0]?.count ?? 0n)
	});
};
