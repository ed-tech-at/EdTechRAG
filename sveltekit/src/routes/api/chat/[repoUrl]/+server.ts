import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { retrieveWithRewrite } from '$lib/server/queryRewrite';
import { getChatClient } from '$lib/server/openaiClient';
import { buildChatMessages } from '$lib/server/chatPrompt';
import { streamChatText } from '$lib/server/chatStream';
import {
	formatRagContext,
	getMetaTags,
	getSystemPrompt,
	parseRagConfig
} from '$lib/ragContext';

const encoder = new TextEncoder();
const SEARCH_START = '__EDTECH_SEARCH_START__\n';
const SEARCH_END = '\n__EDTECH_SEARCH_END__\n';

const corsHeaders = (_origin: string | null): Record<string, string> => ({
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization'
});

export const OPTIONS: RequestHandler = async ({ request }) => {
	const origin = request.headers.get('origin');

	return new Response(null, {
		status: 204,
		headers: corsHeaders(origin)
	});
};

export const POST: RequestHandler = async ({ request, params }) => {
	const { repoUrl } = params;
	const origin = request.headers.get('origin');

	let body: unknown;
	try {
		body = await request.json();
	} catch (err) {
		return new Response('Invalid JSON body', { status: 400, headers: corsHeaders(origin) });
	}

	const prompt =
		body && typeof body === 'object' && 'prompt' in body && typeof (body as any).prompt === 'string'
			? (body as any).prompt.trim()
			: '';
	const history =
		body && typeof body === 'object' && 'history' in body && Array.isArray((body as any).history)
			? ((body as any).history as { role?: string; content?: string }[])
			: [];

	if (!prompt) {
		return new Response('Missing prompt', { status: 400, headers: corsHeaders(origin) });
	}

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl }
	});

	if (!repository) {
		return new Response('Repository not found', { status: 404, headers: corsHeaders(origin) });
	}

	try {
		const ragConfig = parseRagConfig(repository.ragConfig);
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
							endpoint: '/api/chat/[repoUrl]'
						}
					});
				} catch (err) {
					console.error('Chat log insert failed', err);
				}
			}
		});

		// When query rewrite is active, prepend the generated search queries as a
		// delimited block so the client can render "Suche XYZ" bubbles.
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
				...corsHeaders(origin)
			}
		});
	} catch (err) {
		console.error('Chat repo endpoint error', err);
		return new Response('Chat failed. See server logs.', {
			status: 500,
			headers: corsHeaders(origin)
		});
	}
};
