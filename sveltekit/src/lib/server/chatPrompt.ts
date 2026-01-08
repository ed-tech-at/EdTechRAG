export type ChatHistoryItem = { role?: string; content?: string };

const SYSTEM_PROMPT =
	// 'You are a helpful assistant. Use the provided context to answer the user succinctly. If the context is insufficient, say so.';
'You are a helpful assistant. Use the provided context to answer the user succinctly. If the context is insufficient, say so. Answer in Markdown, include and cite the URL in your answer from the context.';
		
export function buildChatMessages({
	systemprompt,
	prompt,
	context,
	history = []
}: {
	systemprompt: string;
	prompt: string;
	context: string;
	history?: ChatHistoryItem[];
}) {
	const VALID_ROLES = ['user', 'assistant', 'system'] as const;

	const sanitizedHistory = (history ?? [])
		.filter(
			(item): item is { role: 'user' | 'assistant' | 'system'; content: string } =>
				typeof item?.role === 'string' &&
				VALID_ROLES.includes(item.role as any) &&
				typeof item?.content === 'string'
		)
		.map((item) => ({ role: item.role, content: item.content }));
	const limitedHistory =
		sanitizedHistory.length > 10 ? sanitizedHistory.slice(-10) : sanitizedHistory;

	// console.log("chatPrmopt")
	// console.log({ systemprompt, history: limitedHistory, context, prompt });

	return [
		{ role: 'system', content: systemprompt },
		...limitedHistory,
		{ role: 'user', content: `User-Prompt:\n${prompt} \n\n CONTEXT:\n${context || 'n/a'}\n\nAGAIN: User-Prompt:\n${prompt}` }
	] as const;
}
