import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { findRepositoryContext } from '$lib/server/rag';
import { getChatClient } from '$lib/server/openaiClient';
import { buildChatMessages } from '$lib/server/chatPrompt';
import { streamChatText } from '$lib/server/chatStream';

const encoder = new TextEncoder();
const CONTEXT_START = '__EDTECH_CONTEXT_START__\n';
const CONTEXT_END = '\n__EDTECH_CONTEXT_END__\n';

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
		const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
		const numberLimit = typeof payload.numItems === 'number' ? payload.numItems : undefined;
		const { results } = await findRepositoryContext(repoUrl, prompt, numberLimit);

		const context = results
			.map((result) => {
				const meta = (result.meta ?? {}) as Record<string, unknown>;
				const url = typeof meta['url'] === 'string' ? meta['url'] : result.remoteUrl ?? '—';
				return `CONTENT:\n${result.content ?? '—'}\nURL: ${url}`;
			})
			.join('\n\n');

		// const systemprompt = repository.ragConfig?.systemprompt
		const systemprompt = typeof payload.systemprompt === 'string' ? payload.systemprompt : '';


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
							context: systemprompt + '\n-----\n\n-----\n' + context,
							answer,
							repositoryUrl: repoUrl,
							endpoint: '/api/chat-parameter/[repoUrl]'
						}
					});
				} catch (err) {
					console.error('Chat log insert failed', err);
				}
			}
		});

		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				controller.enqueue(encoder.encode(`${CONTEXT_START}${context}${CONTEXT_END}`));

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
		});

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
