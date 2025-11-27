import OpenAI from 'openai';
import type { RequestHandler } from '@sveltejs/kit';
import {
	OPENAI_API_KEY,
	OPENAI_API_BASE,
	CHAT_MODEL,
	AZURE_URL,
	AZURE_MODEL,
	AZURE_API_VERSION
} from '$env/static/private';

const encoder = new TextEncoder();
const isAzure = Boolean(AZURE_URL);

const client = new OpenAI({
	apiKey: OPENAI_API_KEY,
	baseURL:
		isAzure && AZURE_URL && AZURE_MODEL
			? `${AZURE_URL}/openai/deployments/${AZURE_MODEL}`
			: OPENAI_API_BASE,
	defaultQuery: isAzure ? { 'api-version': AZURE_API_VERSION || '2024-02-01' } : undefined,
	defaultHeaders: isAzure ? { 'api-key': OPENAI_API_KEY } : undefined
});

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

	const sanitizedHistory = history
		.filter((item) => typeof item?.role === 'string' && typeof item?.content === 'string')
		.map((item) => ({
			role: item.role as 'user' | 'assistant' | 'system',
			content: item.content as string
		}));

	const messages = [
		{
			role: 'system',
			content:
				'You are a helpful assistant. Use the provided context to answer the user succinctly. If the context is insufficient, say so. Answer in Markdown, include and cite the URL in your answer from the context.'
		},
		...sanitizedHistory,
		{
			role: 'system',
			content: `Context from Database:\n${context || 'n/a'}`
		},
    {
			role: 'user',
			content: `User-Prompt:\n${prompt}`
		}
	] as const;

  console.log(messages);

	try {
		const completion = await client.chat.completions.create({
			model: isAzure && AZURE_MODEL ? AZURE_MODEL : CHAT_MODEL || 'gpt-4o-mini',
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
