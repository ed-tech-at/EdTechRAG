import type { RequestHandler } from '@sveltejs/kit';
import { getChatClient } from '$lib/server/openaiClient';
import { buildChatMessages } from '$lib/server/chatPrompt';
import { streamChatText } from '$lib/server/chatStream';
import prisma from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch (err) {
		return new Response('Invalid JSON body', { status: 400 });
	}

	const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
	const promptValue = payload.prompt;
	const prompt = typeof promptValue === 'string' ? promptValue.trim() : '';
	const context = typeof payload.context === 'string' ? payload.context : '';
	const history =
		body && typeof body === 'object' && 'history' in body && Array.isArray((body as any).history)
			? ((body as any).history as { role?: string; content?: string }[])
			: [];
	const repositoryUrl = typeof payload.repositoryUrl === 'string' ? payload.repositoryUrl : undefined;

	if (!prompt) {
		return new Response('Missing prompt', { status: 400 });
	}

	if (!repositoryUrl) {
		return new Response('Missing repositoryUrl', { status: 400 });
	}

	const repository = await prisma.repository.findUnique({
		where: { url: repositoryUrl }
	});

	const ragConfig =
		repository?.ragConfig && typeof repository.ragConfig === 'object' && !Array.isArray(repository.ragConfig)
			? (repository.ragConfig as Record<string, unknown>)
			: undefined;
	const systemprompt = typeof ragConfig?.systemprompt === 'string' ? ragConfig.systemprompt : '';

	const messages = buildChatMessages({
		systemprompt,
		prompt,
		context,
		history
	});

	try {
		const { client, model: defaultModel, apiLanguage, reasoningEffort, textVerbosity } =
			await getChatClient(repositoryUrl);
		const stream = streamChatText({
			client,
			model: defaultModel,
			apiLanguage,
			messages: [...messages],
			reasoningEffort,
			textVerbosity
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Transfer-Encoding': 'chunked'
			}
		});
	} catch (err) {
		console.error('LLM endpoint error', err);
		return new Response('LLM request failed', { status: 500 });
	}
};
