import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Prisma } from '../../../../generated/prisma/client';
import prisma from '$lib/server/db';
import { embeddingSourceAssignment } from '$lib/server/embed';
import { requireUserManager } from '$lib/server/jwt';
import { getRepositoryAccessRegex, isRepositoryAllowed } from '$lib/server/repository';
import { quotedVectorColumn } from '$lib/server/vectorTable';
import { validateImportRow, type ImportRow } from '$lib/server/embeddingTransfer';

const MAX_ROWS_PER_REQUEST = 1000;
const MAX_REPORTED_ERRORS = 20;

export type ImportSummary = {
	received: number;
	inserted: number;
	duplicates: number;
	filled: number;
	invalid: number;
	errors: string[];
};

/**
 * Repositories the session may touch, keyed by the embedding model their config
 * uses. A pending chunk only gets an imported vector when its repository embeds
 * with exactly that model – otherwise search would compare vectors of two models.
 */
const reposByModel = async (session: Awaited<ReturnType<typeof requireUserManager>>) => {
	const repos = await prisma.repository.findMany({ select: { url: true, LLM_API: true } });
	const byModel = new Map<string, string[]>();
	for (const repo of repos) {
		if (!isRepositoryAllowed(session, repo.url)) continue;
		const cfg = (repo.LLM_API ?? {}) as Record<string, unknown>;
		const model = typeof cfg.EMBEDDING_MODEL === 'string' ? cfg.EMBEDDING_MODEL.trim() : '';
		if (!model) continue;
		byModel.set(model, [...(byModel.get(model) ?? []), repo.url]);
	}
	return byModel;
};

/**
 * POST { rows: ExportRow[], fillPending?: boolean }
 *
 * Per row: an existing vector for the same content + model wins (duplicate, nothing
 * written); otherwise the row is stored as a cache donor with repositoryUrl NULL so
 * it is invisible to search and the admin list but found by embedTextWithSource().
 * With fillPending, chunks that still lack a vector are completed from the donor
 * and marked as cache hit. Rows that already have a vector are never overwritten.
 */
export const POST: RequestHandler = async ({ cookies, url, request }) => {
	// Moving vectors between installations is a manager-level operation.
	const session = await requireUserManager(cookies, url);
	const allowRegex = getRepositoryAccessRegex(session);
	if (!allowRegex || !session.allow_regex) {
		throw error(403, 'No repository access');
	}

	const vectorColumn = await quotedVectorColumn();
	if (!vectorColumn) {
		throw error(500, 'The rag_vectors.vector1536 table has no embedding vector column.');
	}

	let body: { rows?: unknown; fillPending?: unknown };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Body must be JSON');
	}
	if (!Array.isArray(body.rows)) {
		throw error(400, 'rows must be an array');
	}
	if (body.rows.length > MAX_ROWS_PER_REQUEST) {
		throw error(413, `At most ${MAX_ROWS_PER_REQUEST} rows per request`);
	}
	const fillPending = body.fillPending !== false;

	const summary: ImportSummary = {
		received: body.rows.length,
		inserted: 0,
		duplicates: 0,
		filled: 0,
		invalid: 0,
		errors: []
	};

	const rows: ImportRow[] = [];
	body.rows.forEach((value, index) => {
		const result = validateImportRow(value);
		if (result === null) return; // header line
		if ('error' in result) {
			summary.invalid += 1;
			if (summary.errors.length < MAX_REPORTED_ERRORS) {
				summary.errors.push(`row ${index + 1}: ${result.error}`);
			}
			return;
		}
		rows.push(result.row);
	});

	const allowedRegex = session.allow_regex;
	const eligibleRepos = fillPending ? await reposByModel(session) : new Map<string, string[]>();

	await prisma.$transaction(
		async (tx) => {
			for (const row of rows) {
				const existing = await tx.$queryRaw<{ id: number }[]>`
					SELECT "id"
					FROM "rag_vectors"."vector1536"
					WHERE "content" = ${row.content}
					  AND "embeddingModel" = ${row.embeddingModel}
					  AND ${vectorColumn} IS NOT NULL
					ORDER BY "embeddedAt" DESC NULLS LAST
					LIMIT 1
				`;

				const vectorLiteral = `[${row.vector.join(',')}]`;
				let donorId: number;
				if (existing[0]) {
					donorId = existing[0].id;
					summary.duplicates += 1;
				} else {
					const inserted = await tx.$queryRaw<{ id: number }[]>`
						INSERT INTO "rag_vectors"."vector1536"
							("repositoryUrl", "dataFileId", "chunkNr", "content", "embeddingModel",
							 "embeddedAt", ${vectorColumn})
						VALUES
							(NULL, NULL, NULL, ${row.content}, ${row.embeddingModel},
							 ${row.embeddedAt ?? new Date()}, ${vectorLiteral}::"rag_vectors".vector)
						RETURNING "id"
					`;
					donorId = inserted[0].id;
					summary.inserted += 1;
				}

				if (!fillPending) continue;
				const repos = eligibleRepos.get(row.embeddingModel);
				if (!repos?.length) continue;

				const filled = await tx.$executeRaw`
					UPDATE "rag_vectors"."vector1536"
					SET ${vectorColumn} = ${vectorLiteral}::"rag_vectors".vector,
					    "embeddingModel" = ${row.embeddingModel},
					    "embeddedAt" = NOW()${await embeddingSourceAssignment(donorId)}
					WHERE "content" = ${row.content}
					  AND ${vectorColumn} IS NULL
					  AND "invalidatedAt" IS NULL
					  AND "repositoryUrl" IN (${Prisma.join(repos)})
					  AND "repositoryUrl" ~ ${allowedRegex}
				`;
				summary.filled += filled;
			}
		},
		{ timeout: 120_000 }
	);

	return json(summary);
};
