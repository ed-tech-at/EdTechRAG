import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { findRepositoryContext } from '$lib/server/rag';
import { getChatClient } from '$lib/server/openaiClient';
import { buildChatMessages } from '$lib/server/chatPrompt';
import { streamChatText } from '$lib/server/chatStream';
import {
	formatRagContext,
	getMetaTags,
	getNumberDocuments,
	getSystemPrompt,
	parseRagConfig
} from '$lib/ragContext';

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
	const username =
		body && typeof body === 'object' && 'username' in body && typeof (body as any).username === 'string'
			? (body as any).username.trim() || null
			: null;
	const source =
		body && typeof body === 'object' && 'source' in body && typeof (body as any).source === 'string'
			? (body as any).source.trim() || null
			: null;

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
		const { results } = await findRepositoryContext(
			repoUrl,
			prompt,
			getNumberDocuments(ragConfig)
		);
		const context = formatRagContext(results, getMetaTags(ragConfig));
		const systemprompt = getSystemPrompt(ragConfig);

		const messages = buildChatMessages({
			systemprompt,
			prompt,
			context,
			history
		});

		const { client, model, apiLanguage, reasoningEffort, textVerbosity } = await getChatClient(repoUrl);
		const stream = streamChatText({
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
							source
						}
					});
				} catch (err) {
					console.error('Chat log insert failed', err);
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
		console.error('Embed endpoint error', err);
		return new Response('Chat failed. See server logs.', {
			status: 500,
			headers: corsHeaders(origin)
		});
	}
};
