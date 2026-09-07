import { Prisma } from '../../generated/prisma/client';
import { VECTOR_DIMENSIONS } from '$lib/server/vectorTable';

/**
 * Shared pieces of the JSONL embedding export/import.
 *
 * File layout: line 1 is a header object (`type: "edtechrag-embeddings"`), every
 * further line is one `ExportRow`. The cache in embed.ts matches on
 * content + embeddingModel only, so those two plus the vector are all an import
 * needs; the remaining fields are provenance for humans.
 */
export const EXPORT_FILE_TYPE = 'edtechrag-embeddings';
export const EXPORT_FILE_VERSION = 1;

export type ExportFilters = {
	repositoryUrl: string | null;
	embeddingModel: string | null;
	embeddedFrom: Date | null;
	embeddedTo: Date | null;
	includeInvalidated: boolean;
};

const parseDate = (value: string | null) => {
	if (!value) return null;
	const date = new Date(value);
	return Number.isFinite(date.getTime()) ? date : null;
};

export const parseExportFilters = (params: URLSearchParams): ExportFilters => ({
	repositoryUrl: params.get('repo')?.trim() || null,
	embeddingModel: params.get('model')?.trim() || null,
	embeddedFrom: parseDate(params.get('from')),
	embeddedTo: parseDate(params.get('to')),
	includeInvalidated: params.get('invalidated') !== '0'
});

/**
 * WHERE clause shared by the count preview and the actual export. Only rows that
 * carry a vector and belong to a repository the session may see are exported;
 * imported cache donors (repositoryUrl NULL) are left out.
 */
export const exportWhere = (
	allowRegex: string,
	filters: ExportFilters,
	vectorColumn: Prisma.Sql
) => {
	const conditions: Prisma.Sql[] = [
		Prisma.sql`${vectorColumn} IS NOT NULL`,
		Prisma.sql`"content" IS NOT NULL`,
		Prisma.sql`"embeddingModel" IS NOT NULL`,
		Prisma.sql`"repositoryUrl" IS NOT NULL`,
		Prisma.sql`"repositoryUrl" ~ ${allowRegex}`
	];

	if (filters.repositoryUrl) {
		conditions.push(Prisma.sql`"repositoryUrl" = ${filters.repositoryUrl}`);
	}
	if (filters.embeddingModel) {
		conditions.push(Prisma.sql`"embeddingModel" = ${filters.embeddingModel}`);
	}
	if (filters.embeddedFrom) {
		conditions.push(Prisma.sql`"embeddedAt" >= ${filters.embeddedFrom}`);
	}
	if (filters.embeddedTo) {
		conditions.push(Prisma.sql`"embeddedAt" <= ${filters.embeddedTo}`);
	}
	if (!filters.includeInvalidated) {
		conditions.push(Prisma.sql`"invalidatedAt" IS NULL`);
	}

	return Prisma.join(conditions, ' AND ');
};

export type ImportRow = {
	content: string;
	embeddingModel: string;
	vector: number[];
	embeddedAt: Date | null;
};

/**
 * Turns one parsed JSONL line into an ImportRow, or a reason why it cannot be
 * imported. Header lines are reported as `null` so callers can skip them silently.
 */
export const validateImportRow = (
	value: unknown
): { row: ImportRow } | { error: string } | null => {
	if (!value || typeof value !== 'object') {
		return { error: 'not an object' };
	}
	const record = value as Record<string, unknown>;
	if (record.type === EXPORT_FILE_TYPE) {
		return null;
	}

	const content = typeof record.content === 'string' ? record.content : '';
	if (!content) {
		return { error: 'missing content' };
	}
	const embeddingModel =
		typeof record.embeddingModel === 'string' ? record.embeddingModel.trim() : '';
	if (!embeddingModel) {
		return { error: 'missing embeddingModel' };
	}

	const vector = record.vector;
	if (!Array.isArray(vector) || vector.length !== VECTOR_DIMENSIONS) {
		return {
			error: `vector must have ${VECTOR_DIMENSIONS} dimensions (got ${
				Array.isArray(vector) ? vector.length : 'none'
			})`
		};
	}
	if (!vector.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
		return { error: 'vector contains non-numeric values' };
	}

	const embeddedAt =
		typeof record.embeddedAt === 'string' ? parseDate(record.embeddedAt) : null;

	return { row: { content, embeddingModel, vector: vector as number[], embeddedAt } };
};
