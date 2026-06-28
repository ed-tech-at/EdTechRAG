import { Prisma } from '../../generated/prisma/client';
import prisma from '$lib/server/db';

const VECTOR_TABLE_SCHEMA = 'rag_vectors';
const VECTOR_TABLE_NAME = 'vector1536';
const VECTOR_COLUMN_CANDIDATES = ['embeddingVector', 'embeddingvector', 'embedding_vector'];
const ALIAS_PATTERN = /^[a-z][a-z0-9_]*$/i;

type ColumnRow = {
	column_name: string;
};

export const vectorColumnName = async () => {
	const rows = await prisma.$queryRaw<ColumnRow[]>`
		SELECT column_name
		FROM information_schema.columns
		WHERE table_schema = ${VECTOR_TABLE_SCHEMA}
		  AND table_name = ${VECTOR_TABLE_NAME}
		  AND column_name IN (${Prisma.join(VECTOR_COLUMN_CANDIDATES)})
	`;
	const column = VECTOR_COLUMN_CANDIDATES.find((candidate) =>
		rows.some((row) => row.column_name === candidate)
	);

	return column ?? null;
};

export const quotedVectorColumn = async () => {
	const column = await vectorColumnName();
	return column ? Prisma.raw(`"${column}"`) : null;
};

export const quotedVectorColumnForAlias = async (alias: string) => {
	if (!ALIAS_PATTERN.test(alias)) {
		throw new Error('Invalid SQL table alias');
	}

	const column = await vectorColumnName();
	return column ? Prisma.raw(`${alias}."${column}"`) : null;
};
