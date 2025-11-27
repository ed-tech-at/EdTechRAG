import type { RequestHandler } from '@sveltejs/kit';
import { getChatClient } from '$lib/server/openaiClient';
import { buildChatMessages } from '$lib/server/chatPrompt';

const encoder = new TextEncoder();
const { client, model: defaultModel } = getChatClient();

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch (err) {
		return new Response('Invalid JSON body', { status: 400 });
	}

	const prompt =
		typeof (body as { prompt?: unknown }).prompt === 'string'
			? (body as { prompt?: string }).prompt.trim()
			: '';
	const context =
		typeof (body as { context?: unknown }).context === 'string'
			? (body as { context?: string }).context
			: '';
	const history =
		body && typeof body === 'object' && 'history' in body && Array.isArray((body as any).history)
			? ((body as any).history as { role?: string; content?: string }[])
			: [];

	if (!prompt) {
		return new Response('Missing prompt', { status: 400 });
	}

	const messages = buildChatMessages({
		prompt,
		context,
		history
	});

	try {
		const completion = await client.chat.completions.create({
			model: defaultModel,
			messages,
			stream: true
		});

		const stream = new ReadableStream({
			async start(controller) {
				try {
					for await (const chunk of completion) {
						const delta = chunk.choices?.[0]?.delta?.content;
						if (delta) {
							controller.enqueue(encoder.encode(delta));
						}
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : 'Stream error';
					controller.enqueue(encoder.encode(`\n[error] ${message}`));
				} finally {
					controller.close();
				}
			}
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
