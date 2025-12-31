import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { getMetaDataOutOfMd, splitTextIntoChunks } from '$lib/server/textSplitter';
import { requireValidJwt } from '$lib/server/jwt';

export const POST: RequestHandler = async ({ cookies, url }) => {
	await requireValidJwt(cookies, url);

	const dataFile = await prisma.dataFile.findFirst({
		where: { chunkedAt: null, remoteUrl: { not: null }, invalidatedAt: null },
		orderBy: { createdAt: 'asc' },
		select: { id: true, repositoryUrl: true, remoteUrl: true, meta: true, repository: true }
	});

	if (!dataFile) {
		return json({ status: 'empty' });
	}

	if (!dataFile.remoteUrl) {
		return json({ status: 'error', message: `Data file #${dataFile.id} has no remote URL.` });
	}

	const isFullUrl = /^https?:\/\//i.test(dataFile.remoteUrl);
	let resolvedUrl = dataFile.remoteUrl;
	let gitlabToken: string | undefined;

	if (!isFullUrl) {
		const repository = await prisma.repository.findUnique({
			where: { url: dataFile.repositoryUrl },
			select: { updateConfig: true }
		});

		if (!repository) {
			return json({
				status: 'error',
				message: `Repository not found for file #${dataFile.id}.`
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
				message: `GitLab config missing PRIVATE-TOKEN or gitlab_api_url for ${dataFile.repositoryUrl}.`
			});
		}

		resolvedUrl = `${gitlabApiUrl}${gitlabApiUrl.endsWith('/') ? '' : '/'}${encodeURIComponent(
			dataFile.remoteUrl
		)}/raw?ref=${encodeURIComponent(gitlabRef)}`;
	}

	const response = await fetch(resolvedUrl, {
		headers: !isFullUrl && gitlabToken ? { 'PRIVATE-TOKEN': gitlabToken } : undefined
	});
	if (!response.ok) {
		return json({
			status: 'error',
			message: `Failed to fetch file #${dataFile.id} (${response.status}).`
		});
	}

	const { content: cleanedText, meta: mdMeta } = getMetaDataOutOfMd(await response.text());
	

	
	let spliterOptions = {};

	if ( dataFile.repository?.ragConfig?.chunkSize !== undefined	) {
		spliterOptions.chunkSize = dataFile.repository?.ragConfig?.chunkSize;
	}

	if ( dataFile.repository?.ragConfig?.chunkOverlap !== undefined	) {
		spliterOptions.chunkOverlap = dataFile.repository?.ragConfig?.chunkOverlap;
	}
	

	const chunks = await splitTextIntoChunks(cleanedText, spliterOptions);

	if (chunks.length === 0) {
		return json({
			status: 'error',
			message: `No chunks found for file #${dataFile.id}.`
		});
	}

	const statements = [
		prisma.$executeRaw`UPDATE "rag_vectors"."vector1536" SET "invalidatedAt" = NOW() WHERE "dataFileId" = ${dataFile.id}`,
		...chunks.map((chunk, idx) =>
			prisma.$executeRaw`INSERT INTO "rag_vectors"."vector1536" ("repositoryUrl","dataFileId","chunkNr","content","createdAt")
			VALUES (${dataFile.repositoryUrl}, ${dataFile.id}, ${idx}, ${chunk}, NOW())`
		)
	];

	await prisma.$transaction(statements);

	const existingMeta =
		dataFile.meta && typeof dataFile.meta === 'object'
			? (dataFile.meta as Record<string, unknown>)
			: {};
	const hasMdMeta = mdMeta && Object.keys(mdMeta).length > 0;
	const nextMeta = {
		...existingMeta,
		...(hasMdMeta ? mdMeta : {}),
		fetch_url: resolvedUrl
	};

	await prisma.dataFile.update({
		where: { id: dataFile.id },
		data: {
			meta: nextMeta,
			chunkedAt: new Date()
		}
	});

	return json({ status: 'chunked', fileId: dataFile.id, chunks: chunks.length });
};
