export type ChatHistoryItem = { role?: string; content?: string };

const SYSTEM_PROMPT =
	// 'You are a helpful assistant. Use the provided context to answer the user succinctly. If the context is insufficient, say so.';
'You are a helpful assistant. Use the provided context to answer the user succinctly. If the context is insufficient, say so. Answer in Markdown, include and cite the URL in your answer from the context.';
		
export function buildChatMessages({
	prompt,
	context,
	history = []
}: {
	prompt: string;
	context: string;
	history?: ChatHistoryItem[];
}) {
	const sanitizedHistory = (history ?? [])
		.filter((item) => typeof item?.role === 'string' && typeof item?.content === 'string')
		.map((item) => ({
			role: item.role as 'user' | 'assistant' | 'system',
			content: item.content as string
		}));

	return [
		{ role: 'system', content: SYSTEM_PROMPT },
		...sanitizedHistory,
		{ role: 'user', content: `Context:\n${context || 'n/a'}\n\nPrompt:\n${prompt}` }
	] as const;
}
