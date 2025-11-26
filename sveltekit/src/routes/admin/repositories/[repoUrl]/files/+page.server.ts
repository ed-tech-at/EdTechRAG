import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { EMBEDDING_MODEL, embedText } from '$lib/server/embed';

const splitIntoChunks = (raw: string) => {
	const lines = raw.replace(/\r\n/g, '\n').split('\n');
	const chunks: string[] = [];
	let current: string[] = [];

	const pushCurrent = () => {
		const combined = current.join('\n').trim();
		if (combined) {
			chunks.push(combined);
		}
	};

	for (const line of lines) {
		const isHeading = line.trimStart().startsWith('#');

		if (isHeading && current.length) {
			pushCurrent();
			current = [line];
		} else {
			current.push(line);
		}
	}

	if (current.length) {
		pushCurrent();
	}

	return chunks;
};

export const load: PageServerLoad = async ({ params }) => {
	const { repoUrl } = params;

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl }
	});

	if (!repository) {
		throw error(404, 'Repository not found');
	}

	const files = await prisma.dataFile.findMany({
		where: { repositoryUrl: repoUrl },
		include: {
			_count: { select: { dataChunks: true } }
		},
		orderBy: { createdAt: 'desc' }
	});

	return { repository, files };
};

export const actions: Actions = {
	delete: async ({ request, params }) => {
		const { repoUrl } = params;
		const formData = await request.formData();
		const fileId = formData.get('fileId');

		if (!fileId || typeof fileId !== 'string') {
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

			await prisma.dataFile.delete({ where: { id: fileId } });

			return { success: true, message: 'File deleted.' };
		} catch (err) {
			console.error('Delete file error', err);
			return fail(500, { success: false, message: 'Delete failed. See server logs.' });
		}
	},
	ingestUrl: async ({ request, params }) => {
		const { repoUrl } = params;
		const formData = await request.formData();
		const url = formData.get('url');

		if (!url || typeof url !== 'string' || !url.trim()) {
			return fail(400, { success: false, message: 'Please provide a URL.' });
		}

		try {
			const response = await fetch(url);
			if (!response.ok) {
				return fail(400, { success: false, message: `Failed to fetch URL (${response.status}).` });
			}

			const text = await response.text();
			const chunks = splitIntoChunks(text);

			if (chunks.length === 0) {
				return fail(400, { success: false, message: 'No chunks found (need lines starting with #).' });
			}

			const dataFile = await prisma.dataFile.create({
				data: {
					repositoryUrl: repoUrl,
					remoteUrl: url
				}
			});

			for (const [idx, content] of chunks.entries()) {
				const chunk = await prisma.dataChunk.create({
					data: {
						dataFileId: dataFile.id,
						content,
						chunkNr: idx + 1,
						embeddingModel: EMBEDDING_MODEL
					}
				});

				const vector = await embedText(content);
				const vectorLiteral = `[${vector.join(',')}]`;
				await prisma.$executeRaw`UPDATE "DataChunk" SET "embeddingVector" = ${vectorLiteral}::vector WHERE "id" = ${chunk.id}`;
			}

			return {
				success: true,
				message: `Ingested ${chunks.length} chunk${chunks.length === 1 ? '' : 's'} from URL.`,
				dataFileId: dataFile.id
			};
		} catch (err) {
			console.error('URL ingest error', err);
			return fail(500, { success: false, message: 'Ingest failed. See server logs.' });
		}
	}
};
