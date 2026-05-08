import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { getMetaDataOutOfMd, splitTextIntoChunks } from '$lib/server/textSplitter';
import { requireValidJwt } from '$lib/server/jwt';
import { isRepositoryAllowed } from '$lib/server/repository';
import { parseRagConfig } from '$lib/ragContext';

export const POST: RequestHandler = async ({ cookies, url }) => {
	const session = await requireValidJwt(cookies, url);

	const dataFile = await prisma.dataFile.findFirst({
		where: {
			chunkedAt: null,
			remoteUrl: { not: null },
			invalidatedAt: null
		},
		orderBy: { createdAt: 'asc' },
		select: { id: true, repositoryUrl: true, remoteUrl: true, meta: true, repository: true }
	});

	const allowedDataFile =
		dataFile && isRepositoryAllowed(session, dataFile.repositoryUrl) ? dataFile : null;

	if (!allowedDataFile) {
		return json({ status: 'empty' });
	}

	if (!allowedDataFile.remoteUrl) {
		return json({ status: 'error', message: `Data file #${allowedDataFile.id} has no remote URL.` });
	}

	const isFullUrl = /^https?:\/\//i.test(allowedDataFile.remoteUrl);
	let resolvedUrl = allowedDataFile.remoteUrl;
	let gitlabToken: string | undefined;

	if (!isFullUrl) {
		const repository = await prisma.repository.findUnique({
			where: { url: allowedDataFile.repositoryUrl },
			select: { updateConfig: true }
		});

		if (!repository) {
			return json({
				status: 'error',
				message: `Repository not found for file #${allowedDataFile.id}.`
			});
		}

		const repoConfig = (repository.updateConfig ?? {}) as Record<string, unknown>;
		gitlabToken =
			typeof repoConfig['PRIVATE-TOKEN'] === 'string' ? repoConfig['PRIVATE-TOKEN'] : undefined;
		const gitlabApiUrl =
			typeof repoConfig['gitlab_api_url'] === 'string'
				? repoConfig['gitlab_api_url']
				: undefined;
		const gitlabRef =
			typeof repoConfig['ref'] === 'string' && repoConfig['ref'] ? repoConfig['ref'] : 'main';

		if (!gitlabApiUrl || !gitlabToken) {
			return json({
				status: 'error',
				message: `GitLab config missing PRIVATE-TOKEN or gitlab_api_url for ${allowedDataFile.repositoryUrl}.`
			});
		}

		resolvedUrl = `${gitlabApiUrl}${gitlabApiUrl.endsWith('/') ? '' : '/'}${encodeURIComponent(
			allowedDataFile.remoteUrl
		)}/raw?ref=${encodeURIComponent(gitlabRef)}`;
	}

	const response = await fetch(resolvedUrl, {
		headers: !isFullUrl && gitlabToken ? { 'PRIVATE-TOKEN': gitlabToken } : undefined
	});
	if (!response.ok) {
		return json({
			status: 'error',
			message: `Failed to fetch file #${allowedDataFile.id} (${response.status}).`
		});
	}

	const { content: cleanedText, meta: mdMeta } = getMetaDataOutOfMd(await response.text());
	

	
	const ragConfig = parseRagConfig(allowedDataFile.repository?.ragConfig);
	const spliterOptions: { chunkSize?: number; chunkOverlap?: number } = {};
	if (ragConfig?.chunkSize !== undefined) {
		spliterOptions.chunkSize = ragConfig.chunkSize;
	}
	if (ragConfig?.chunkOverlap !== undefined) {
		spliterOptions.chunkOverlap = ragConfig.chunkOverlap;
	}


	const chunks = await splitTextIntoChunks(cleanedText, spliterOptions);

	if (chunks.length === 0) {
		return json({
			status: 'error',
			message: `No chunks found for file #${allowedDataFile.id}.`
		});
	}

	const statements = [
		prisma.$executeRaw`UPDATE "rag_vectors"."vector1536" SET "invalidatedAt" = NOW() WHERE "dataFileId" = ${allowedDataFile.id}`,
		...chunks.map((chunk, idx) =>
			prisma.$executeRaw`INSERT INTO "rag_vectors"."vector1536" ("repositoryUrl","dataFileId","chunkNr","content","createdAt")
			VALUES (${allowedDataFile.repositoryUrl}, ${allowedDataFile.id}, ${idx}, ${chunk}, NOW())`
		)
	];

	await prisma.$transaction(statements);

	const existingMeta =
		allowedDataFile.meta && typeof allowedDataFile.meta === 'object'
			? (allowedDataFile.meta as Record<string, unknown>)
			: {};
	const hasMdMeta = mdMeta && Object.keys(mdMeta).length > 0;
	const nextMeta = {
		...existingMeta,
		...(hasMdMeta ? mdMeta : {}),
		fetch_url: resolvedUrl
	};

	await prisma.dataFile.update({
		where: { id: allowedDataFile.id },
		data: {
			meta: nextMeta,
			chunkedAt: new Date()
		}
	});

	return json({ status: 'chunked', fileId: allowedDataFile.id, chunks: chunks.length });
};
