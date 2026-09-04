import { Prisma } from '../../generated/prisma/client';
import prisma from '$lib/server/db';

const VECTOR_TABLE_SCHEMA = 'rag_vectors';
const VECTOR_TABLE_NAME = 'vector1536';
const VECTOR_COLUMN_CANDIDATES = ['embeddingVector', 'embeddingvector', 'embedding_vector'];
const SOURCE_COLUMN_CANDIDATES = ['embeddingSourceId', 'embeddingsourceid', 'embedding_source_id'];
const ALIAS_PATTERN = /^[a-z][a-z0-9_]*$/i;

type ColumnRow = {
	column_name: string;
};

const findColumn = async (candidates: string[]) => {
	const rows = await prisma.$queryRaw<ColumnRow[]>`
		SELECT column_name
		FROM information_schema.columns
		WHERE table_schema = ${VECTOR_TABLE_SCHEMA}
		  AND table_name = ${VECTOR_TABLE_NAME}
		  AND column_name IN (${Prisma.join(candidates)})
	`;
	const column = candidates.find((candidate) => rows.some((row) => row.column_name === candidate));

	return column ?? null;
};

export const vectorColumnName = async () => findColumn(VECTOR_COLUMN_CANDIDATES);

// Optional bookkeeping column: holds the id of the row a vector was copied from
// on a cache hit. Missing on installations created before this column existed,
// so every caller has to cope with `null`.
export const embeddingSourceColumnName = async () => findColumn(SOURCE_COLUMN_CANDIDATES);

export const quotedVectorColumn = async () => {
	const column = await vectorColumnName();
	return column ? Prisma.raw(`"${column}"`) : null;
};

export const quotedEmbeddingSourceColumn = async () => {
	const column = await embeddingSourceColumnName();
	return column ? Prisma.raw(`"${column}"`) : null;
};

export const quotedVectorColumnForAlias = async (alias: string) => {
	if (!ALIAS_PATTERN.test(alias)) {
		throw new Error('Invalid SQL table alias');
	}

	const column = await vectorColumnName();
	return column ? Prisma.raw(`${alias}."${column}"`) : null;
};
