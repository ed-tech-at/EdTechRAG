import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { embedText } from '$lib/server/embed';
// import { getMetaDataOutOfMd, splitTextIntoChunks } from '$lib/server/textSplitter';

import {loadRepoConfig} from '$lib/server/openaiClient';
import { isDbNull } from '@prisma/client/runtime/wasm-compiler-edge';
import { requireAllowedRepository } from '$lib/server/repository';

// import { EMBEDDING_MODEL } from '$env/static/private';


export const load: PageServerLoad = async ({ cookies, params, url }) => {
	const { repoUrl } = params;
	await requireAllowedRepository(cookies, url, repoUrl);

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl }
	});

	if (!repository) {
		throw error(404, 'Repository not found');
	}

	const files = await prisma.dataFile.findMany({
		// where: { repositoryUrl: repoUrl, invalidatedAt: isDbNull },
		where: { repositoryUrl: repoUrl, invalidatedAt: null },
		// include: {
			// _count: { select: { dataChunks: true } }
		// },
		orderBy: { createdAt: 'desc' }
	});

	return { repositoryUrl: repository.url, repositoryName: repository.name, files };
};

export const actions: Actions = {
	delete: async ({ cookies, request, params, url }) => {
		const { repoUrl } = params;
		await requireAllowedRepository(cookies, url, repoUrl);
		const formData = await request.formData();
		// console.log(formData);
		const fileId = parseInt(formData.get('fileId'));
		// console.log(fileId);

		if (!fileId) {
			return fail(400, { success: false, message: 'Missing file id.' });
		}

		try {
			// Ensure file belongs to repository before deleting
			const file = await prisma.dataFile.findUnique({
				where: { id: fileId },
				select: { repositoryUrl: true }
			});

			if (!file || file.repositoryUrl !== repoUrl) {
				return fail(404, { success: false, message: 'File not found for this repository.' });
			}

			await prisma.dataFile.update({
				where: { id: fileId },
				data: { invalidatedAt: new Date() }
			});


			await prisma.$executeRaw`
				UPDATE "rag_vectors"."vector1536"
				SET "invalidatedAt" = NOW()
				WHERE "dataFileId" = ${fileId}
			`;

			// await prisma.dataFile.delete({ where: { id: fileId } });

			return { success: true, message: 'File deleted.' };
		} catch (err) {
			console.error('Delete file error', err);
			return fail(500, { success: false, message: 'Delete failed. See server logs.' });
		}
	},
	ingestUrl: async ({ cookies, request, params, url }) => {
		const { repoUrl } = params;
		await requireAllowedRepository(cookies, url, repoUrl);
		const formData = await request.formData();
		// const urlsText = formData.get('urls');
		const singleUrl = formData.get('url');

		const repository = await prisma.repository.findUnique({
			where: { url: repoUrl }
		});

		if (!repository) {
			return fail(404, { success: false, message: 'Repository not found.' });
		}

		const repoConfig = (repository.updateConfig ?? {}) as Record<string, unknown>;
		// const gitlabToken =
		// 	typeof repoConfig['PRIVATE-TOKEN'] === 'string' ? repoConfig['PRIVATE-TOKEN'] : undefined;
		// const gitlabApiUrl =
		// 	typeof repoConfig['gitlab_api_url'] === 'string'
		// 		? repoConfig['gitlab_api_url']
		// 		: undefined;
		// const gitlabRef =
		// 	typeof repoConfig['ref'] === 'string' && repoConfig['ref']
		// 		? repoConfig['ref']
		// 		: 'main';

		// const urls: string[] = [];

		// if (typeof singleUrl === 'string' && singleUrl.trim()) {
			// urls.push(singleUrl.trim());
		// }

		// if (typeof urlsText === 'string' && urlsText.trim()) {
		// 	urls.push(
		// 		...urlsText
		// 			.replace(/\r\n/g, '\n')
		// 			.split('\n')
		// 			.map((line) => line.trim())
		// 			.filter(Boolean)
		// 	);
		// }

		// if (urls.length === 0) {
		// 	return fail(400, { success: false, message: 'No valid URLs provided.' });
		// }

		let processed = 0;
		let totalChunks = 0;
		const errors: string[] = [];

		// try {
			// for (const url of urls) {
				try {
					// const isFullUrl = /^https?:\/\//i.test(url);
					const resolvedUrl = singleUrl;
					// const resolvedUrl =
					// 	isFullUrl || !gitlabApiUrl || !gitlabToken
					// 		? url
					// 		: `${gitlabApiUrl}${gitlabApiUrl.endsWith('/') ? '' : '/'}${encodeURIComponent(url)}/raw?ref=${encodeURIComponent(gitlabRef)}`;

					// if (!isFullUrl && (!gitlabApiUrl || !gitlabToken)) {
					// 	throw new Error(
					// 		'Relative path provided but GitLab config is missing PRIVATE-TOKEN or gitlab_api_url.'
					// 	);
					// }

					// const response = await fetch(resolvedUrl, {
					// 	headers: !isFullUrl && gitlabToken ? { 'PRIVATE-TOKEN': gitlabToken } : undefined
					// });
					// if (!response.ok) {
					// 	throw new Error(`Failed to fetch (${response.status}).`);
					// }

					// const { content: cleanedText, meta: mdMeta } = getMetaDataOutOfMd(await response.text());
					// const chunks = await splitTextIntoChunks(cleanedText);

					// if (chunks.length === 0) {
					// 	throw new Error('No chunks found after splitting.');
					// }

					let dataFile = await prisma.dataFile.findFirst({
						where: {
							repositoryUrl: repoUrl,
							remoteUrl: resolvedUrl
						},
						select: { id: true }
					});

					if (dataFile) {
						// const ids = existingFile.map((f) => f.id);
						// await prisma.$transaction([
							// prisma.dataChunk.deleteMany({ where: { dataFileId: { in: ids } } }),
							// prisma.dataFile.deleteMany({ where: { id: { in: ids } } })
						// ]);
						
						try {
							await prisma.$executeRaw`UPDATE "rag_vectors"."vector1536" SET "invalidatedAt" = NOW() WHERE "dataFileId" = ${dataFile.id}`;
						} catch (err) {
  						console.error("executeRaw failed:", err);
						}

					} else {

						dataFile = await prisma.dataFile.create({
							data: {
								repositoryUrl: repoUrl,
								remoteUrl: resolvedUrl,
								// meta: Object.keys(meta).length > 0 ? meta : undefined
							}
						});
					}

// 					const meta: Record<string, unknown> = {
// 						...(isFullUrl ? {} : { source: 'gitlab', path: url, ref: gitlabRef }),
// 						...mdMeta
// 					};

// 					dataFile = await prisma.dataFile.update({
// 						where: { id: dataFile.id },
// 						data: { meta, chunkedAt: new Date() }
// 					});


// 					console.log('datafile ', dataFile);
// 					console.log('meta upate ');
// 					console.log(meta);
// 					console.log('chunks count', chunks.length);

// 					let createdChunks = 0;
// 					const chunkErrors: string[] = [];

// 					for (let idx = 0; idx < chunks.length; idx += 1) {
// 						const content = chunks[idx];
// 						console.log('processing chunk', idx);

// 						try {
// 							console.log("inserting");
// 							console.log(content);
							
// 							await prisma.$executeRaw`
// 								INSERT INTO "rag_vectors"."vector1536" ("repositoryUrl", "dataFileId","chunkNr","content","createdAt")
// 								VALUES (${repoUrl}, ${dataFile.id}, ${createdChunks}, ${content}, NOW())
// 							`;

// 							if (0) {
// 								const EMBEDDING_MODEL = (await loadRepoConfig(repoUrl)).embeddingModel;
// // TODO EMBEDDING INACITVE
// 							const vector = await embedText(content, repoUrl);
// 							const vectorLiteral = `[${vector.join(',')}]`;
// 							await prisma.$executeRaw`UPDATE "DataChunk" SET "embeddingVector" = ${vectorLiteral}::"rag_vectors".vector WHERE "id" = ${chunk.id}`;
// 							await prisma.$executeRaw`UPDATE "DataChunk" SET "embeddingModel" = ${EMBEDDING_MODEL} WHERE "id" = ${chunk.id}`;
// 							}

// 							createdChunks += 1;
// 						} catch (err) {
// 							const reason = err instanceof Error ? err.message : 'Unknown chunk error';
// 							chunkErrors.push(`chunk ${idx + 1}: ${reason}`);
// 							console.error('Chunk ingest error', { url, idx, reason });
// 						}
// 					}

					processed += 1;
					// totalChunks += createdChunks;

					// if (chunkErrors.length === chunks.length) {
					// 	throw new Error(`All chunks failed for ${url}: ${chunkErrors.join(' | ')}`);
					// }

					// if (chunkErrors.length > 0) {
					// 	errors.push(`${url} partial: ${chunkErrors.join(' | ')}`);
					// }
				} catch (err) {
					const reason = err instanceof Error ? err.message : 'Unknown error';
					// errors.push(`${url}: ${reason}`);
				}
			// }

			if (processed === 0) {
				return fail(400, {
					success: false,
					message: `${singleUrl} URL failed. Details: ${errors.join(' | ')}`,
					// message: `All ${urls.length} URL${urls.length === 1 ? '' : 's'} failed. Details: ${errors.join(' | ')}`,
					errors
				});
			}

			const messageBase = `Processed ${processed} URL (${totalChunks} chunk${totalChunks === 1 ? '' : 's'}).`;
			const message =
				errors.length > 0 ? `${messageBase} Errors: ${errors.join(' | ')}` : messageBase;

			return {
				success: errors.length === 0,
				message
			};
		// } catch (err) {
		// 	console.error('URL ingest error', err);
		// 	return fail(500, { success: false, message: 'Ingest failed. See server logs.' });
		// }
	}
};
