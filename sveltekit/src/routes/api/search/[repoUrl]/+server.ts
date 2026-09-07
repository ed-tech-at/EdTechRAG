import prisma from '$lib/server/db';
import { retrieveWithRewrite } from '$lib/server/queryRewrite';
import { embedCorsHeaders, getAllowedSearchOrigin } from '$lib/server/repositoryAccess';
import { toSearchHits } from '$lib/server/search';
import { findRepositoryText } from '$lib/server/textSearch';
import {
	getAiOverviewConfig,
	getSearchConfig,
	getSearchMetaLabels,
	parseRagConfig,
	resolveMetaLabels
} from '$lib/ragContext';
import type { RequestHandler } from './$types';

/**
 * Search results for the search embed (static/embed/search).
 *
 * Plain JSON and no streaming: the result list is what the visitor sees first and
 * it should arrive in one piece. The AI overview above it is the streamed part and
 * lives in /api/search-overview - separate endpoint, because the results must
 * appear WITHOUT consent while the overview must not.
 *
 * The response also reports whether an overview is available at all
 * (`overviewAvailable`). Without it the widget would have to guess: showing a
 * consent panel for a feature the repository has switched off is worse than not
 * offering it.
 *
 * `metaLabels` is the naming table, already resolved to the requested language and
 * sent ONCE per response rather than per hit: the labels are the same for every
 * result, and repeating them on each would grow the payload for nothing. The keys
 * stay machine-readable in `results[].meta` so the host page can still style by key.
 */

const jsonResponse = (body: unknown, status: number, headers: Record<string, string>) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
	});

export const OPTIONS: RequestHandler = async ({ request, params }) => {
	const { repoUrl } = params;
	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl },
		select: { activeSearchApi: true, embedAllowedHostRegex: true }
	});

	if (!repository) return new Response('Repository not found', { status: 404 });

	const allowedOrigin = getAllowedSearchOrigin(repository, request.headers.get('origin'));
	if (!allowedOrigin) return new Response('Search origin not allowed', { status: 403 });

	return new Response(null, {
		status: 204,
		headers: embedCorsHeaders(allowedOrigin)
	});
};

export const POST: RequestHandler = async ({ request, params }) => {
	const { repoUrl } = params;

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl }
	});
	if (!repository) return new Response('Repository not found', { status: 404 });

	const allowedOrigin = getAllowedSearchOrigin(repository, request.headers.get('origin'));
	if (!allowedOrigin) return new Response('Search origin not allowed', { status: 403 });

	const corsHeaders = embedCorsHeaders(allowedOrigin);
	const ragConfig = parseRagConfig(repository.ragConfig);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ success: false, message: 'Invalid JSON body' }, 400, corsHeaders);
	}

	const raw =
		body && typeof body === 'object' && typeof (body as { query?: unknown }).query === 'string'
			? (body as { query: string }).query
			: '';
	// 500 characters is far past anything a search box produces; longer input is
	// either a paste accident or an attempt to run up the embedding bill.
	const query = raw.trim().slice(0, 500);

	/*
	 * The language of the page that is searching.
	 *
	 * The index holds both languages, and on purpose: the English pages are their
	 * own texts with their own addresses, not copies. Without this filter a German
	 * search would list the English translation of the same article as a second hit -
	 * which is what "it is in there twice" would actually look like.
	 *
	 * Two letters, lower case, or nothing. Anything else is ignored rather than
	 * rejected: an unknown language would otherwise return an empty result list, and
	 * "no filter" is the more useful failure.
	 */
	const langRaw =
		body && typeof body === 'object' && typeof (body as { lang?: unknown }).lang === 'string'
			? (body as { lang: string }).lang.toLowerCase()
			: '';
	const lang = /^[a-z]{2}$/.test(langRaw) ? langRaw : undefined;

	if (!query) {
		return jsonResponse({ success: false, message: 'Missing query' }, 400, corsHeaders);
	}

	const search = getSearchConfig(ragConfig);
	const overview = getAiOverviewConfig(ragConfig);

	try {
		/*
		 * Both paths ask for more chunks than the list shows, because grouping
		 * collapses them: eight chunks of one page would otherwise become one result
		 * and leave nine slots empty. Factor three, capped at 60 - a large
		 * resultLimit must not turn one search into hundreds of comparisons.
		 */
		const chunkBudget = Math.min(search.resultLimit * 3, 60);

		const found =
			search.mode === 'fulltext'
				? // Database only: one SQL query, no embedding call and no LLM call. The
					// searched terms take the place of the rewritten queries in the
					// response - both answer "what was actually looked for".
					await findRepositoryText(repoUrl, query, chunkBudget, lang).then((r) => ({
						results: r.results,
						queries: r.terms,
						rewriteApplied: false
					}))
				: await retrieveWithRewrite({
						repoUrl,
						prompt: query,
						ragConfig,
						documents: chunkBudget,
						lang
					}).then((r) => ({
						results: r.results,
						queries: r.rewriteApplied ? r.queries : [],
						rewriteApplied: r.rewriteApplied
					}));

		const { results, queries } = found;
		const hits = toSearchHits(results, ragConfig, search);

		return jsonResponse(
			{
				success: true,
				query,
				mode: search.mode,
				// Shown as chips in the widget: the rewritten queries in 'vector' mode,
				// the searched terms in 'fulltext'.
				queries,
				results: hits,
				// 'en' matches the widget's own fallback (resolveLang) for the case of a
				// caller that sent no usable language.
				metaLabels: resolveMetaLabels(getSearchMetaLabels(ragConfig), lang ?? 'en'),
				overviewAvailable: overview.enabled,
				overviewRequiresTerms: overview.enabled && overview.requireUserterms,
				overviewTermsMonths: overview.usertermsDurationMonths
			},
			200,
			corsHeaders
		);
	} catch (err) {
		console.error('Search endpoint error', err);
		return jsonResponse(
			{ success: false, message: 'Search failed. See server logs.' },
			500,
			corsHeaders
		);
	}
};
