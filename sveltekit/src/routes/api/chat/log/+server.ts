import type { RequestHandler } from '@sveltejs/kit';
import prisma from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch (err) {
		return new Response('Invalid JSON body', { status: 400 });
	}

	const question =
		body && typeof body === 'object' && 'question' in body && typeof (body as any).question === 'string'
			? (body as any).question
			: undefined;
	const context =
		body && typeof body === 'object' && 'context' in body && typeof (body as any).context === 'string'
			? (body as any).context
			: undefined;
	const answer =
		body && typeof body === 'object' && 'answer' in body && typeof (body as any).answer === 'string'
			? (body as any).answer
			: undefined;
	const repositoryUrl =
		body &&
		typeof body === 'object' &&
		'repositoryUrl' in body &&
		typeof (body as any).repositoryUrl === 'string'
			? (body as any).repositoryUrl
			: undefined;
	const endpoint =
		body && typeof body === 'object' && 'endpoint' in body && typeof (body as any).endpoint === 'string'
			? (body as any).endpoint
			: undefined;

	try {
		await prisma.chatLog.create({
			data: {
				question,
				context,
				answer,
				repositoryUrl,
				endpoint
			}
		});

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	} catch (err) {
		console.error('Log error', err);
		return new Response('Failed to log chat', { status: 500 });
	}
};
