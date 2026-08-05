import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { retrieveWithRewrite } from '$lib/server/queryRewrite';
import { embedCorsHeaders, getAllowedEmbedOrigin } from '$lib/server/repositoryAccess';
import { getChatClient } from '$lib/server/openaiClient';
import { buildChatMessages } from '$lib/server/chatPrompt';
import { streamChatText } from '$lib/server/chatStream';
import {
	formatRagContext,
	getMetaTags,
	getSystemPrompt,
	getUsertermsMaxAgeMs,
	parseRagConfig,
	validateTermsAcceptedAt
} from '$lib/ragContext';

const encoder = new TextEncoder();
const SEARCH_START = '__EDTECH_SEARCH_START__\n';
const SEARCH_END = '\n__EDTECH_SEARCH_END__\n';

export const OPTIONS: RequestHandler = async ({ request, params }) => {
	const { repoUrl } = params;
	const origin = request.headers.get('origin');
	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl },
		select: { activeEmbedApi: true, embedAllowedHostRegex: true }
	});

	if (!repository) {
		return new Response('Repository not found', { status: 404 });
	}

	const allowedOrigin = getAllowedEmbedOrigin(repository, origin);
	if (!allowedOrigin) {
		return new Response('Embed origin not allowed', { status: 403 });
	}

	return new Response(null, {
		status: 204,
		headers: embedCorsHeaders(allowedOrigin)
	});
};

export const POST: RequestHandler = async ({ request, params }) => {
	const { repoUrl } = params;
	const origin = request.headers.get('origin');

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl }
	});

	if (!repository) {
		return new Response('Repository not found', { status: 404 });
	}

	const allowedOrigin = getAllowedEmbedOrigin(repository, origin);
	if (!allowedOrigin) {
		return new Response('Embed origin not allowed', { status: 403 });
	}
	const corsHeaders = embedCorsHeaders(allowedOrigin);
	const ragConfig = parseRagConfig(repository.ragConfig);

	let body: unknown;
	try {
		body = await request.json();
	} catch (err) {
		return new Response('Invalid JSON body', { status: 400, headers: corsHeaders });
	}

	const prompt =
		body && typeof body === 'object' && 'prompt' in body && typeof (body as any).prompt === 'string'
			? (body as any).prompt.trim()
			: '';
	const history =
		body && typeof body === 'object' && 'history' in body && Array.isArray((body as any).history)
			? ((body as any).history as { role?: string; content?: string }[])
			: [];
	const username =
		body && typeof body === 'object' && 'username' in body && typeof (body as any).username === 'string'
			? (body as any).username.trim() || null
			: null;
	const source =
		body && typeof body === 'object' && 'source' in body && typeof (body as any).source === 'string'
			? (body as any).source.trim() || null
			: null;
	const usertermsUrl =
		body &&
		typeof body === 'object' &&
		'usertermsUrl' in body &&
		typeof (body as any).usertermsUrl === 'string'
			? (body as any).usertermsUrl.trim() || null
			: null;

	// Consent gate. Runs after the origin check (the 403 needs the CORS headers to be readable by
	// the widget, and a disallowed origin must not learn anything about the repository config),
	// before the prompt check (authorization beats input validation) and outside the try below so a
	// rejection can never be masked as a generic 500.
	//
	// NOTE: the older static/embed/moodle-block_chatbot widget sends no termsAcceptedAt at all, so
	// enabling requireUserterms answers *every* one of its requests with 403 and leaves its users no
	// way to consent. Use a separate Repository row for the block_chatbot embed, or backport
	// data-userterms-url to the Moodle block first.
	const termsAcceptedAt = validateTermsAcceptedAt(
		body && typeof body === 'object' ? (body as any).termsAcceptedAt : undefined,
		getUsertermsMaxAgeMs(ragConfig)
	);
	if (ragConfig?.requireUserterms === true && !termsAcceptedAt) {
		return new Response('userterms-required', { status: 403, headers: corsHeaders });
	}

	if (!prompt) {
		return new Response('Missing prompt', { status: 400, headers: corsHeaders });
	}

	try {
		const { results, queries, rewriteApplied } = await retrieveWithRewrite({
			repoUrl,
			prompt,
			history,
			ragConfig
		});
		const context = formatRagContext(results, getMetaTags(ragConfig));
		const systemprompt = getSystemPrompt(ragConfig);

		const messages = buildChatMessages({
			systemprompt,
			prompt,
			context,
			history
		});

		const { client, model, apiLanguage, reasoningEffort, textVerbosity } = await getChatClient(repoUrl);
		const answerStream = streamChatText({
			model,
			client,
			apiLanguage,
			messages,
			reasoningEffort,
			textVerbosity,
			onComplete: async (answer) => {
				try {
					await prisma.chatLog.create({
						data: {
							question: prompt,
							context,
							answer,
							repositoryUrl: repoUrl,
							endpoint: '/api/embed/[repoUrl]',
							username,
							history: history.length ? history : undefined,
							source,
							// Recorded whenever a valid timestamp is present, even when
							// requireUserterms is off, so a client-only gate stays auditable.
							termsAcceptedAt: termsAcceptedAt ? new Date(termsAcceptedAt) : null,
							usertermsUrl: termsAcceptedAt ? usertermsUrl : null
						}
					});
				} catch (err) {
					console.error('Chat log insert failed', err);
				}
			}
		});

		// When query rewrite is active, prepend the generated search queries as a
		// delimited block so the widget can render search chips before the answer.
		const stream = rewriteApplied
			? new ReadableStream<Uint8Array>({
					async start(controller) {
						controller.enqueue(
							encoder.encode(`${SEARCH_START}${JSON.stringify(queries)}${SEARCH_END}`)
						);
						const reader = answerStream.getReader();
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
			  })
			: answerStream;

		return new Response(stream, {
			status: 200,
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Transfer-Encoding': 'chunked',
				...corsHeaders
			}
		});
	} catch (err) {
		console.error('Embed endpoint error', err);
		return new Response('Chat failed. See server logs.', {
			status: 500,
			headers: corsHeaders
		});
	}
};
