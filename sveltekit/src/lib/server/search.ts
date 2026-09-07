import {
	getRagContextUrl,
	getSearchMetaTags,
	INTERNAL_META_KEYS,
	resolveMetaTags,
	type RagConfig,
	type SearchConfig
} from '$lib/ragContext';
import type { RagResult } from '$lib/server/rag';

/**
 * Turns retrieval results into search results.
 *
 * Two jobs, and both are the difference between "a RAG endpoint" and "a search
 * engine":
 *
 *  1. GROUPING. Retrieval returns chunks; a result list has to show documents. A
 *     page split into eight chunks would otherwise fill the whole first page of
 *     results with itself, and the visitor would see the same title eight times.
 *     Grouping key is the public URL (meta.url) - the same value the citation
 *     uses, so a result links exactly where the chatbot would point.
 *  2. NARROWING. A chunk row carries the internal fetch address, the DataFile id
 *     and the whole meta object. None of that belongs in a response that any
 *     allowed origin can read: `fetch_url` exposes the GitLab API path including
 *     the project id, and the ids are only useful to someone probing the
 *     database. The public shape is built by hand for that reason - not by
 *     deleting fields from the row, which would leak every field added later.
 *
 *     Which META keys pass is `ragConfig.searchMetaTags` - NOT `metaTags`. The
 *     latter governs the chatbot's METADATA_JSON, a private prompt where "all of
 *     it" is usually right; this response is public. Two audiences, two lists.
 */

export type SearchHit = {
	/** Public page URL - the thing a visitor clicks. */
	url: string;
	title: string;
	snippet: string;
	/** 0..1, higher is closer. Rounded: three decimals are more than a UI can use. */
	score: number;
	/** How many chunks of this document matched - a rough "how much of it is relevant". */
	matches: number;
	/**
	 * Only the metadata the repository declared in ragConfig.searchMetaTags.
	 * Keys are lower case; their display names travel once per response, not per
	 * hit - see the `metaLabels` field of /api/search.
	 */
	meta: Record<string, string>;
};

const asRecord = (meta: unknown): Record<string, unknown> =>
	meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};

const asString = (value: unknown): string | undefined => {
	if (typeof value === 'string') return value.trim() || undefined;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (Array.isArray(value)) {
		const items = value.map(asString).filter((v): v is string => Boolean(v));
		return items.length > 0 ? items.join(', ') : undefined;
	}
	return undefined;
};

/**
 * A readable excerpt. Collapses whitespace and cuts at a word boundary, because a
 * snippet ending mid-word reads like a broken page rather than a shortened one.
 *
 * Markdown markers are stripped: the widget renders the snippet as plain text, and
 * a stray '##' or '](https://...' in a result line is noise, not structure.
 */
export function snippetOf(content: string | null | undefined, maxLength: number): string {
	if (!content) return '';

	const plain = content
		// Links keep their text, lose their target.
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^\s*[-*+]\s+/gm, '')
		.replace(/^\s*>\s?/gm, '')
		.replace(/[*_`]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

	if (plain.length <= maxLength) return plain;

	const cut = plain.slice(0, maxLength);
	const lastSpace = cut.lastIndexOf(' ');
	// Only honour the word boundary when it is not absurdly early - a single
	// 400-character "word" would otherwise leave an empty snippet.
	return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Public metadata of a hit: the keys the repository declared - or all of them with
 * '*' - minus `url` and `title`, which are their own fields already.
 *
 * INTERNAL_META_KEYS is enforced HERE and not left to resolveMetaTags, because
 * resolveMetaTags only applies it in '*' mode. An explicit list containing
 * `fetch_url` would otherwise hand the internal GitLab Files API address - project
 * id included - to every allowed origin, which is exactly what that list exists to
 * prevent. The chatbot path keeps its own behaviour; this is the public gate.
 */
function publicMeta(meta: Record<string, unknown>, metaTags: string[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const tag of resolveMetaTags(meta, metaTags)) {
		const key = tag.toLowerCase();
		if (key === 'url' || key === 'title') continue;
		if (INTERNAL_META_KEYS.has(key)) continue;
		const value = asString(meta[tag]) ?? asString(meta[key]);
		if (value !== undefined) out[key] = value;
	}
	return out;
}

/**
 * Chunks -> documents. Results keep the order retrieval gave them (best first),
 * so the first chunk of a document decides its position.
 */
export function toSearchHits(
	results: readonly RagResult[],
	ragConfig: RagConfig | undefined,
	search: SearchConfig
): SearchHit[] {
	const metaTags = getSearchMetaTags(ragConfig);
	const byUrl = new Map<string, SearchHit>();

	for (const result of results) {
		const meta = asRecord(result.meta);
		const url = getRagContextUrl(result);
		// '—' is what getRagContextUrl returns when neither meta.url nor remoteUrl is
		// set. A result without a target is not a search result; dropping it is
		// better than rendering a link that goes nowhere.
		if (url === '—') continue;

		const existing = byUrl.get(url);
		if (existing) {
			existing.matches += 1;
			// The snippet stays the one from the best-scoring chunk: it is the passage
			// that actually matched. Appending further chunks would make the excerpt
			// longer without making it more relevant.
			existing.score = Math.max(existing.score, Math.round(result.similarity * 1000) / 1000);
			continue;
		}

		byUrl.set(url, {
			url,
			// Falls back to the URL: a hit with an empty heading would be unclickable
			// in practice, because there would be nothing to click.
			title: asString(meta.title) ?? url,
			snippet: snippetOf(result.content, search.snippetLength),
			score: Math.round(result.similarity * 1000) / 1000,
			matches: 1,
			meta: publicMeta(meta, metaTags)
		});
	}

	return [...byUrl.values()].slice(0, search.resultLimit);
}
