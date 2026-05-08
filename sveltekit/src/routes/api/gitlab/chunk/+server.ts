import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import type { Prisma } from '../../../../generated/prisma/client';
import { getMetaDataOutOfMd, splitTextIntoChunks } from '$lib/server/textSplitter';
import { logGitLabApiRequest, parseGitLabApiRequest } from '$lib/server/gitlabApi';
import { parseRagConfig } from '$lib/ragContext';

export const POST: RequestHandler = async ({ request }) => {
	const parsed = await parseGitLabApiRequest(request);
	if (!parsed.ok) {
		await logGitLabApiRequest(request, '/api/gitlab/chunk/', parsed.repositoryUrl, {
			status: parsed.status,
			success: false,
			error: parsed.message
		});
		return json({ success: false, message: parsed.message }, { status: parsed.status });
	}

	const { repository, repositoryUrl } = parsed;
	const repoConfig =
		repository.updateConfig && typeof repository.updateConfig === 'object'
			? (repository.updateConfig as Record<string, unknown>)
			: {};

	const gitlabToken =
		typeof repoConfig['PRIVATE-TOKEN'] === 'string' ? repoConfig['PRIVATE-TOKEN'] : undefined;
	const gitlabApiUrl =
		typeof repoConfig['gitlab_api_url'] === 'string' ? repoConfig['gitlab_api_url'] : undefined;
	const gitlabRef =
		typeof repoConfig['ref'] === 'string' && repoConfig['ref'] ? repoConfig['ref'] : 'main';

	const ragConfig = parseRagConfig(repository.ragConfig);
	const chunkSize = ragConfig?.chunkSize;
	const chunkOverlap = ragConfig?.chunkOverlap;

	const dataFiles = await prisma.dataFile.findMany({
		where: {
			repositoryUrl,
			chunkedAt: null,
			remoteUrl: { not: null },
			invalidatedAt: null
		},
		orderBy: { createdAt: 'asc' },
		select: { id: true, repositoryUrl: true, remoteUrl: true, meta: true }
	});

	if (dataFiles.length === 0) {
		await logGitLabApiRequest(request, '/api/gitlab/chunk/', repositoryUrl, {
			status: 200,
			success: true,
			message: 'No data files pending for chunking.',
			filesTotal: 0,
			filesChunked: 0,
			filesFailed: 0
		});
		return json({
			success: true,
			status: 'empty',
			message: 'No data files pending for chunking.',
			filesTotal: 0,
			filesChunked: 0,
			filesFailed: 0,
			errors: []
		});
	}

	const errors: string[] = [];
	let filesChunked = 0;

	for (const dataFile of dataFiles) {
		if (!dataFile.remoteUrl) {
			errors.push(`Data file #${dataFile.id} has no remote URL.`);
			continue;
		}

		try {
			const isFullUrl = /^https?:\/\//i.test(dataFile.remoteUrl);
			let resolvedUrl = dataFile.remoteUrl;

			if (!isFullUrl) {
				if (!gitlabApiUrl || !gitlabToken) {
					throw new Error(
						`GitLab config missing PRIVATE-TOKEN or gitlab_api_url for ${repositoryUrl}.`
					);
				}

				resolvedUrl = `${gitlabApiUrl}${gitlabApiUrl.endsWith('/') ? '' : '/'}${encodeURIComponent(
					dataFile.remoteUrl
				)}/raw?ref=${encodeURIComponent(gitlabRef)}`;
			}

			const response = await fetch(resolvedUrl, {
				headers: !isFullUrl && gitlabToken ? { 'PRIVATE-TOKEN': gitlabToken } : undefined
			});
			if (!response.ok) {
				throw new Error(`Failed to fetch file #${dataFile.id} (${response.status}).`);
			}

			const { content: cleanedText, meta: mdMeta } = getMetaDataOutOfMd(await response.text());
			const splitterOptions: { chunkSize?: number; chunkOverlap?: number } = {};
			if (chunkSize !== undefined) splitterOptions.chunkSize = chunkSize;
			if (chunkOverlap !== undefined) splitterOptions.chunkOverlap = chunkOverlap;

			const chunks = await splitTextIntoChunks(cleanedText, splitterOptions);
			if (chunks.length === 0) {
				throw new Error(`No chunks found for file #${dataFile.id}.`);
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
					meta: nextMeta as Prisma.InputJsonValue,
					chunkedAt: new Date()
				}
			});

			console.log(
				`GitLab chunking complete for data file #${dataFile.id}: ${chunks.length} chunk(s)`
			);
			filesChunked += 1;
		} catch (err) {
			console.error(`GitLab chunking failed for data file #${dataFile.id}`, err);
			errors.push(err instanceof Error ? err.message : `Chunking failed for file #${dataFile.id}.`);
		}
	}

	const success = errors.length === 0;
	const responseBody = {
		success,
		status: success ? 'chunked' : 'partial',
		message: success
			? `Chunked ${filesChunked} data file${filesChunked === 1 ? '' : 's'}.`
			: `Chunked ${filesChunked} of ${dataFiles.length} data files.`,
		filesTotal: dataFiles.length,
		filesChunked,
		filesFailed: dataFiles.length - filesChunked,
		errors
	};

	await logGitLabApiRequest(request, '/api/gitlab/chunk/', repositoryUrl, {
		status: 200,
		success,
		resultStatus: responseBody.status,
		message: responseBody.message,
		filesTotal: responseBody.filesTotal,
		filesChunked: responseBody.filesChunked,
		filesFailed: responseBody.filesFailed,
		errors
	});

	return json(responseBody);
};
