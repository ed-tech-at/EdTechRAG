import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { findRepositoryContext } from '$lib/server/rag';
import { embedCorsHeaders, getAllowedEmbedOrigin } from '$lib/server/repositoryAccess';
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

	if (!prompt) {
		return new Response('Missing prompt', { status: 400, headers: corsHeaders });
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
