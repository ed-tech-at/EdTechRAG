import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Prisma } from '../../../../generated/prisma/client';
import prisma from '$lib/server/db';
import { requireUserManager } from '$lib/server/jwt';
import { getRepositoryAccessRegex, isRepositoryAllowed } from '$lib/server/repository';
import { quotedVectorColumn } from '$lib/server/vectorTable';
import {
	EXPORT_FILE_TYPE,
	EXPORT_FILE_VERSION,
	exportWhere,
	parseExportFilters
} from '$lib/server/embeddingTransfer';

const BATCH_SIZE = 200;

type ExportRow = {
	id: number;
	repositoryUrl: string;
	dataFileId: number | null;
	chunkNr: number | null;
	embeddingModel: string;
	embeddedAt: Date | null;
	invalidatedAt: Date | null;
	content: string;
	vectorText: string;
};

const fileNameFor = (repositoryUrl: string | null) => {
	const scope = repositoryUrl
		? repositoryUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
		: 'all';
	const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
	return `embeddings-${scope || 'all'}-${stamp}.jsonl`;
};

/**
 * GET ?repo=&model=&from=&to=&invalidated=0|1  → streams a JSONL file.
 * GET …&count=1                                → { count } for the modal preview.
 */
export const GET: RequestHandler = async ({ cookies, url }) => {
	// Moving vectors between installations is a manager-level operation.
	const session = await requireUserManager(cookies, url);
	const allowRegex = getRepositoryAccessRegex(session);
	const countOnly = url.searchParams.get('count') === '1';
	if (!allowRegex || !session.allow_regex) {
		if (countOnly) return json({ count: 0 });
		throw error(403, 'No repository access');
	}

	const filters = parseExportFilters(url.searchParams);
	if (filters.repositoryUrl && !isRepositoryAllowed(session, filters.repositoryUrl)) {
		throw error(403, 'Repository access denied');
	}

	const vectorColumn = await quotedVectorColumn();
	if (!vectorColumn) {
		throw error(500, 'The rag_vectors.vector1536 table has no embedding vector column.');
	}

	const where = exportWhere(session.allow_regex, filters, vectorColumn);

	const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
		SELECT COUNT(*)::bigint AS count
		FROM "rag_vectors"."vector1536"
		WHERE ${where}
	`;
	const count = Number(countRows[0]?.count ?? 0n);
	if (countOnly) {
		return json({ count });
	}

	const header = {
		type: EXPORT_FILE_TYPE,
		version: EXPORT_FILE_VERSION,
		exportedAt: new Date().toISOString(),
		count,
		filters: {
			repositoryUrl: filters.repositoryUrl,
			embeddingModel: filters.embeddingModel,
			embeddedFrom: filters.embeddedFrom?.toISOString() ?? null,
			embeddedTo: filters.embeddedTo?.toISOString() ?? null,
			includeInvalidated: filters.includeInvalidated
		}
	};

	// Cursor on id: stable regardless of concurrent embedding runs, and the vector
	// text from pgvector is already a JSON array, so it is spliced in verbatim
	// instead of being parsed and re-serialised 1536 numbers at a time.
	async function* lines() {
		yield `${JSON.stringify(header)}\n`;

		let lastId = 0;
		while (true) {
			const rows = await prisma.$queryRaw<ExportRow[]>`
				SELECT "id", "repositoryUrl", "dataFileId", "chunkNr", "embeddingModel",
				       "embeddedAt", "invalidatedAt", "content",
				       ${vectorColumn}::text AS "vectorText"
				FROM "rag_vectors"."vector1536"
				WHERE ${where}
				  AND "id" > ${lastId}
				ORDER BY "id" ASC
				LIMIT ${BATCH_SIZE}
			`;
			if (rows.length === 0) break;

			let chunk = '';
			for (const row of rows) {
				const meta = JSON.stringify({
					sourceId: row.id,
					repositoryUrl: row.repositoryUrl,
					dataFileId: row.dataFileId,
					chunkNr: row.chunkNr,
					embeddingModel: row.embeddingModel,
					embeddedAt: row.embeddedAt?.toISOString() ?? null,
					invalidatedAt: row.invalidatedAt?.toISOString() ?? null,
					content: row.content
				});
				chunk += `${meta.slice(0, -1)},"vector":${row.vectorText}}\n`;
			}
			yield chunk;

			lastId = rows[rows.length - 1].id;
			if (rows.length < BATCH_SIZE) break;
		}
	}

	const encoder = new TextEncoder();
	const iterator = lines();
	const stream = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { value, done } = await iterator.next();
				if (done) {
					controller.close();
				} else {
					controller.enqueue(encoder.encode(value));
				}
			} catch (err) {
				console.error('Embedding export failed', err);
				controller.error(err);
			}
		},
		cancel() {
			void iterator.return?.(undefined);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson; charset=utf-8',
			'Content-Disposition': `attachment; filename="${fileNameFor(filters.repositoryUrl)}"`,
			'Cache-Control': 'no-store'
		}
	});
};
