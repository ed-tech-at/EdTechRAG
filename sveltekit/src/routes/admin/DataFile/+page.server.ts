import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import prisma from '$lib/server/db';

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

export const load: PageServerLoad = async () => {
	const dataFiles = await prisma.dataFile.findMany({
		include: {
			repository: true,
			_count: { select: { dataChunks: true } }
		},
		orderBy: { createdAt: 'desc' }
	});

	return { dataFiles };
};

export const actions: Actions = {
	ingest: async ({ request }) => {
		const formData = await request.formData();
		const dataFileId = formData.get('dataFileId');
		const content = formData.get('content');

		if (!dataFileId || typeof dataFileId !== 'string') {
			return fail(400, { success: false, message: 'Missing data file id.' });
		}

		if (!content || typeof content !== 'string' || !content.trim()) {
			return fail(400, { success: false, message: 'Please paste some text to split.' });
		}

		const chunks = splitIntoChunks(content);

		if (chunks.length === 0) {
			return fail(400, { success: false, message: 'No chunks found (need lines starting with #).' });
		}

		const existingCount = await prisma.dataChunk.count({
			where: { dataFileId }
		});

		const data = chunks.map((chunk, idx) => ({
			dataFileId,
			content: chunk,
			chunkNr: existingCount + idx + 1
		}));

		await prisma.dataChunk.createMany({ data });

		return {
			success: true,
			message: `Created ${data.length} chunk${data.length === 1 ? '' : 's'}.`
		};
	}
};
