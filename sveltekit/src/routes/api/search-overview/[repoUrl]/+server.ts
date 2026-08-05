import prisma from '$lib/server/db';
import { streamChatText } from '$lib/server/chatStream';
import { getChatClient, type ApiLanguage } from '$lib/server/openaiClient';
import { retrieveWithRewrite } from '$lib/server/queryRewrite';
import { embedCorsHeaders, getAllowedSearchOrigin } from '$lib/server/repositoryAccess';
import { toSearchHits } from '$lib/server/search';
import { buildOverviewMessages } from '$lib/server/searchPrompt';
import {
	formatRagContext,
	getAiOverviewConfig,
	getMetaTags,
	getSearchConfig,
	parseRagConfig,
	usertermsMaxAgeMsForMonths,
	validateTermsAcceptedAt
} from '$lib/ragContext';
import type { RequestHandler } from './$types';

const encoder = new TextEncoder();

/**
 * Delimiters of the source block that precedes the summary. Mirrors
 * __EDTECH_SEARCH_START__ in /api/embed; the widget peels the block off before it
 * treats bytes as text.
 */
const SOURCES_START = '__EDTECH_SOURCES_START__\n';
const SOURCES_END = '\n__EDTECH_SOURCES_END__\n';

/**
 * The streamed AI overview above the search results.
 *
 * Its own endpoint, separate from /api/search, and that split is the whole point
 * of the feature: the results are shown to everyone right away, the overview only
 * after the visitor accepted the terms. One endpoint would have had to withhold
 * both or neither.
 *
 * It RETRIEVES AGAIN instead of accepting the context from the client. The widget
 * already has the results, so passing them back would save a query - but any
 * allowed origin could then hand us arbitrary text, have the model repeat it, and
 * have it stored in ChatLog as if it were our own content. The extra retrieval is
 * the price of the context being ours.
 */

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
	const overview = getAiOverviewConfig(ragConfig);

	// Switched off: not an error, but nothing to stream either. 404 would claim the
	// endpoint does not exist; 409 says "not in this state".
	if (!overview.enabled) {
		return new Response('ai-overview-disabled', {
			status: 409,
			headers: corsHeaders
		});
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response('Invalid JSON body', {
			status: 400,
			headers: corsHeaders
		});
	}

	const asString = (key: string): string | null => {
		const value = body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : null;
		return typeof value === 'string' && value.trim() ? value.trim() : null;
	};

	/*
	 * Consent gate. After the origin check (a disallowed origin must not learn
	 * anything about the config) and before the query check (authorization beats
	 * input validation), and outside the try below so a rejection can never be
	 * masked as a generic 500. Same order and reasoning as /api/embed.
	 */
	const termsAcceptedAt = validateTermsAcceptedAt(
		body && typeof body === 'object'
			? (body as { termsAcceptedAt?: unknown }).termsAcceptedAt
			: undefined,
		usertermsMaxAgeMsForMonths(overview.usertermsDurationMonths)
	);
	if (overview.requireUserterms && !termsAcceptedAt) {
		// The widget reacts to this exact body: it clears the stored acceptance and
		// shows the consent panel again.
		return new Response('userterms-required', {
			status: 403,
			headers: corsHeaders
		});
	}

	const query = (asString('query') ?? '').slice(0, 500);
	if (!query) return new Response('Missing query', { status: 400, headers: corsHeaders });

	const usertermsUrl = asString('usertermsUrl');
	const source = asString('source');
	const langRaw = (asString('lang') ?? '').toLowerCase();
	const lang = /^[a-z]{2}$/.test(langRaw) ? langRaw : undefined;

	try {
		/*
		 * ALWAYS semantic retrieval (RAG), whatever searchMode says for the result
		 * list. The two answer different questions: the list wants the pages that
		 * contain the words that were typed, the summary wants the passages that are
		 * ABOUT the question - and those may be worded entirely differently.
		 *
		 * This is also why it sits behind the consent gate: the embedding call happens
		 * here and nowhere else in the search path.
		 */
		const { results } = await retrieveWithRewrite({
			repoUrl,
			prompt: query,
			ragConfig,
			documents: overview.documents,
			lang
		});
		const context = formatRagContext(results, getMetaTags(ragConfig));

		const messages = buildOverviewMessages({
			systemprompt: overview.systemprompt,
			context,
			query,
			extraContext: overview.context
		});

		const chat = await getChatClient(repoUrl);
		const stream = streamChatText({
			client: chat.client,
			// Each setting falls back to the repository's chat default when the
			// overview does not override it - same rule as query rewrite.
			model: overview.model ?? chat.model,
			apiLanguage: (overview.apiLanguage as ApiLanguage | undefined) ?? chat.apiLanguage,
			messages,
			reasoningEffort:
				(overview.reasoningEffort as typeof chat.reasoningEffort) ?? chat.reasoningEffort,
			textVerbosity: (overview.textVerbosity as typeof chat.textVerbosity) ?? chat.textVerbosity,
			onComplete: async (answer) => {
				try {
					await prisma.chatLog.create({
						data: {
							question: query,
							context,
							answer,
							repositoryUrl: repoUrl,
							endpoint: '/api/search-overview/[repoUrl]',
							source,
							// Recorded whenever a valid timestamp is present, even when the
							// gate is off, so a client-only consent stays auditable.
							termsAcceptedAt: termsAcceptedAt ? new Date(termsAcceptedAt) : null,
							usertermsUrl: termsAcceptedAt ? usertermsUrl : null
						}
					});
				} catch (err) {
					console.error('Search overview log insert failed', err);
				}
			}
		});

		/*
		 * The semantic hits are sent BEFORE the summary, as a delimited JSON block.
		 *
		 * The widget shows them as their own group above the database results, so the
		 * visitor can see which passages the summary was written from. Same mechanism
		 * the chatbot uses for its rewritten queries (__EDTECH_SEARCH_START__ in
		 * /api/embed) - one stream, a prefix the client peels off, no second request
		 * and no second retrieval.
		 */
		const sources = toSearchHits(results, ragConfig, getSearchConfig(ragConfig));
		const withSources = new ReadableStream<Uint8Array>({
			async start(controller) {
				controller.enqueue(
					encoder.encode(`${SOURCES_START}${JSON.stringify(sources)}${SOURCES_END}`)
				);
				const reader = stream.getReader();
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						if (value) controller.enqueue(value);
					}
				} finally {
					reader.releaseLock();
					controller.close();
				}
			}
		});

		return new Response(withSources, {
			status: 200,
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Transfer-Encoding': 'chunked',
				...corsHeaders
			}
		});
	} catch (err) {
		console.error('Search overview endpoint error', err);
		return new Response('AI overview failed. See server logs.', {
			status: 500,
			headers: corsHeaders
		});
	}
};
