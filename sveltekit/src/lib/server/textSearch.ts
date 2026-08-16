import { Prisma } from '../../generated/prisma/client';
import prisma from '$lib/server/db';
import type { RagResult } from '$lib/server/rag';

/**
 * Search WITHOUT embeddings - plain Postgres full-text search over the stored
 * chunks.
 *
 * Why this exists next to findRepositoryContext: a site search runs on every
 * keystroke-ish visitor query, and the vector path costs an embedding API call per
 * search (plus an LLM call when query rewrite is on). For "find the page that
 * mentions Notenexport" that is money and latency spent on a job SQL already does.
 * The chatbot keeps the vector path - there the semantics are the point.
 *
 * THE TEXT SEARCH CONFIGURATION IS 'simple', and that was measured, not guessed.
 * On the real TELucation corpus (1750 chunks), the query "noten":
 *
 *   to_tsvector('german', ...)  ->  463 chunks in 111 documents
 *   to_tsvector('simple', ...) + prefix  ->  12 chunks in 5 documents
 *
 * The German stemmer reduces "Noten" to the stem "not", which it shares with a
 * large part of the corpus - the result list became everything. 'simple' only
 * lowercases and splits, so a token means what it says. Two more reasons:
 *
 *  - PREFIX MATCHING ('noten:*') is what solves German compounds without a
 *    dictionary: it finds "Notenexport" for "noten". The stemmer cannot - and
 *    websearch_to_tsquery('german', 'noten export') finds it NEITHER, because
 *    "Notenexport" is one token and the query demands two.
 *  - The sites are bilingual. 'german' mis-stems the English half; 'simple'
 *    treats both alike, so there is no language to pick per query.
 */

/** Also matched as a substring, ranked below the token hits - see buildQuery. */
const MAX_TERMS = 8;

export type TextSearchResult = {
	results: RagResult[];
	/** The terms actually searched - shown as chips, like the rewritten queries. */
	terms: string[];
};

/**
 * Query -> safe tsquery terms.
 *
 * Everything that is not a letter, a digit or an underscore becomes a separator.
 * That is not cosmetic: to_tsquery() parses its input, and '&', '|', '!', ':' or a
 * lone '-' would either change the meaning of the query or raise a syntax error
 * that reaches the visitor as a 500. After this, the terms cannot carry an
 * operator - so the tsquery is built from data that has no syntax left.
 */
export function searchTerms(query: string): string[] {
	const raw = query
		.toLowerCase()
		.split(/[^\p{L}\p{N}_]+/u)
		.filter(Boolean);

	// Single letters match almost everything with a prefix search; they are dropped
	// unless the whole query is one - then it is clearly what was meant.
	const terms = raw.length === 1 ? raw : raw.filter((t) => t.length > 1);
	return terms.slice(0, MAX_TERMS);
}

/**
 * Full-text search over the chunks of one repository.
 *
 * Two tiers, and the second only runs when the first found nothing:
 *
 *  1. Token hits with prefix matching, ranked by ts_rank with the title weighted
 *     above the body - a hit in the heading says more about a page than one in the
 *     middle of it. Indexable, therefore fast.
 *  2. Substring hits (ILIKE). They are what makes "export" find "Notenexport" -
 *     prefix matching only works from the start of a token. Not indexable, so it is
 *     the fallback and not a permanent second half; see the comment at the queries.
 */
export async function findRepositoryText(
	repoUrl: string,
	query: string,
	limit: number,
	/**
	 * Restrict to one language, matched against meta.lang - the value the GenAI
	 * export writes into every document.
	 *
	 * The index holds both languages on purpose: the English pages are their own
	 * texts with their own addresses, not copies, and without them the English site
	 * would have no search and no citable source. What must NOT happen is a German
	 * search listing the English translation of the same article as a second hit -
	 * that is what this filter prevents. Omitted means "all languages".
	 */
	lang?: string
): Promise<TextSearchResult> {
	const terms = searchTerms(query);
	if (terms.length === 0) return { results: [], terms: [] };

	// Prisma.empty when no language is given: the fragment then disappears from the
	// statement instead of becoming an always-true comparison.
	const langFilter = lang ? Prisma.sql`AND df."meta"->>'lang' = ${lang}` : Prisma.empty;

	// Every term must be present (AND) - a search that ORs its words returns the
	// whole site for the second word.
	const tsquery = terms.map((term) => `${term}:*`).join(' & ');
	const likes = terms.map((term) => `%${term}%`);

	/*
	 * TWO QUERIES, and the reason is measured. The substring tier cannot use an
	 * index; ORed into the same statement it forced a sequential scan over every
	 * chunk of the repository - 2.1 seconds on the 19 349-chunk corpus of another
	 * repository here, which is not a search box, it is a wait.
	 *
	 * So the indexable tier runs alone first, and the substring tier only when it came
	 * back empty - a query that found nothing is exactly the one that can afford a
	 * scan.
	 *
	 * The GIN index this relies on is NOT a Prisma migration: it is created by hand
	 * per server, because only servers that serve the search embed need it. The SQL
	 * and the reasoning are in README.md under "Search Index". Without it this tier
	 * still returns the same rows, it just scans for them.
	 *
	 * The split costs nothing in correctness. The one case the first tier misses is
	 * a multi-word query whose words are spread across title and body ("noten" in
	 * the heading, "export" in the text): the ORed @@ per field cannot see that. The
	 * second tier concatenates title and body, so it catches exactly that case - and
	 * it runs, because the first tier came back empty.
	 */
	const select = (match: Prisma.Sql) => Prisma.sql`
		WITH q AS (SELECT to_tsquery('simple', ${tsquery}) AS tsq)
		SELECT rv."id", rv."dataFileId", rv."chunkNr", rv."content", rv."embeddingModel",
			df."remoteUrl", df."meta",
			ts_rank(
				setweight(to_tsvector('simple', coalesce(df."meta"->>'title', '')), 'A') ||
				setweight(to_tsvector('simple', coalesce(rv."content", '')), 'B'),
				q.tsq
			) AS rank
		FROM "rag_vectors"."vector1536" rv
		LEFT JOIN "DataFile" df ON rv."dataFileId" = df."id"
		CROSS JOIN q
		WHERE rv."repositoryUrl" = ${repoUrl}
			AND rv."invalidatedAt" IS NULL
			${langFilter}
			AND (${match})
		ORDER BY rank DESC, rv."chunkNr" ASC NULLS LAST
		LIMIT ${limit}`;

	type Row = {
		id: string;
		dataFileId: string;
		chunkNr: number | null;
		content: string | null;
		embeddingModel: string | null;
		remoteUrl: string | null;
		meta: unknown;
		rank: number;
	};

	/*
	 * The content expression MUST stay character-for-character the one the index was
	 * created on, otherwise Postgres cannot use it and silently scans instead. The
	 * title is not indexed and does not need to be: it is one short line per row.
	 */
	let rows = await prisma.$queryRaw<Row[]>(
		select(Prisma.sql`
			to_tsvector('simple', coalesce(rv."content", '')) @@ q.tsq
			OR to_tsvector('simple', coalesce(df."meta"->>'title', '')) @@ q.tsq`)
	);

	if (rows.length === 0) {
		rows = await prisma.$queryRaw<Row[]>(
			select(
				Prisma.sql`(coalesce(df."meta"->>'title', '') || ' ' || coalesce(rv."content", ''))
					ILIKE ALL (${likes}::text[])`
			)
		);
	}

	/*
	 * ts_rank is unbounded (prefix matches measured above 1.0), so the raw value
	 * cannot be shown as a score. Normalising against the best hit of THIS result
	 * set gives 1.0 for the top hit and a readable relation below it - which is all
	 * a result list can express anyway. It is deliberately NOT comparable to the
	 * cosine similarity of the vector path; they are different measures.
	 */
	const best = rows.reduce((max, row) => Math.max(max, Number(row.rank) || 0), 0);

	const results: RagResult[] = rows.map((row) => ({
		...row,
		distance: 0,
		similarity: best > 0 ? (Number(row.rank) || 0) / best : 0,
		meta: row.meta ?? undefined,
		remoteUrl: row.remoteUrl ?? undefined
	}));

	return { results, terms };
}
