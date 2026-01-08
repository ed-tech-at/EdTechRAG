import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { findRepositoryContext } from '$lib/server/rag';
import { getChatClient } from '$lib/server/openaiClient';
import { buildChatMessages } from '$lib/server/chatPrompt';

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
		const numberLimit = body.numItems;
		const { results, message } = await findRepositoryContext(repoUrl, prompt, numberLimit);

		const context = results
			.map((result) => {
				const meta = (result.meta ?? {}) as Record<string, unknown>;
				const url = typeof meta['url'] === 'string' ? meta['url'] : result.remoteUrl ?? '—';
				return `CONTENT:\n${result.content ?? '—'}\nURL: ${url}`;
			})
			.join('\n\n');

		// const systemprompt = repository.ragConfig?.systemprompt
		const systemprompt = body?.systemprompt;


		const messages = buildChatMessages({
			systemprompt,
			prompt,
			context,
			history
		});

		const { client, model } = await getChatClient(repoUrl);
		const completion = await client.chat.completions.create({
			model,
			messages,
			stream: false
		});

		const answer = completion.choices?.[0]?.message?.content ?? '';

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

		return new Response(
			JSON.stringify({
				success: true,
				answer,
				context
				// results, //HIDE in public chat api
				// message
			}),
			{
				status: 200,
				headers: { 'content-type': 'application/json', ...corsHeaders(origin) }
			}
		);
	} catch (err) {
		console.error('Chat repo endpoint error', err);
		return new Response('Chat failed. See server logs.', {
			status: 500,
			headers: corsHeaders(origin)
		});
	}
};
