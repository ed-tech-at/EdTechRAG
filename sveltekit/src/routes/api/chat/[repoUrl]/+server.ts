import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { findRepositoryContext } from '$lib/server/rag';
import { getChatClient } from '$lib/server/openaiClient';
import { buildChatMessages } from '$lib/server/chatPrompt';

export const POST: RequestHandler = async ({ request, params }) => {
	const { repoUrl } = params;

	let body: unknown;
	try {
		body = await request.json();
	} catch (err) {
		return new Response('Invalid JSON body', { status: 400 });
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
		return new Response('Missing prompt', { status: 400 });
	}

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl }
	});

	if (!repository) {
		return new Response('Repository not found', { status: 404 });
	}

	try {
		const { results, message } = await findRepositoryContext(repoUrl, prompt);

		const context = results
			.map((result) => {
				const meta = (result.meta ?? {}) as Record<string, unknown>;
				const url = typeof meta['url'] === 'string' ? meta['url'] : result.remoteUrl ?? '—';
				return `CONTENT:\n${result.content ?? '—'}\nURL: ${url}`;
			})
			.join('\n\n');

		const messages = buildChatMessages({
			prompt,
			context,
			history
		});

		const { client, model } = getChatClient();
		const completion = await client.chat.completions.create({
			model,
			messages,
			stream: false
		});

		const answer = completion.choices?.[0]?.message?.content ?? '';

		return new Response(
			JSON.stringify({
				success: true,
				answer,
				results,
				message
			}),
			{
				status: 200,
				headers: { 'content-type': 'application/json' }
			}
		);
	} catch (err) {
		console.error('Chat repo endpoint error', err);
		return new Response('Chat failed. See server logs.', { status: 500 });
	}
};
