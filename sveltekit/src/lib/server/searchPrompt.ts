import type { ChatMessage } from '$lib/server/chatStream';

/**
 * The prompt of the AI overview above the search results.
 *
 * Deliberately NOT buildChatMessages: that one carries a conversation (history,
 * a system prompt written for a chatbot persona) and repeats the user prompt
 * after the context to keep a chat model on track. An overview has no history and
 * exactly one job - summarise these results and say where each statement comes
 * from.
 */

const DEFAULT_SYSTEM_PROMPT = [
	'You write a short overview of search results for a website visitor.',
	'Rules:',
	'1. Use ONLY the provided context. If it does not answer the question, say so in one sentence and stop.',
	'2. Answer in the language of the question.',
	'3. Three to six sentences, or a short bullet list. No greeting, no closing remark.',
	'4. Cite sources as Markdown links using the URL given with each context entry.',
	'5. Never invent a URL, a title, a date or a number that is not in the context.'
].join('\n');

export function buildOverviewMessages({
	systemprompt,
	context,
	query,
	extraContext
}: {
	/** Per-repository override; empty falls back to DEFAULT_SYSTEM_PROMPT. */
	systemprompt?: string;
	/** formatRagContext() output - URL, metadata and content per entry. */
	context: string;
	query: string;
	/** aiOverviewContext: background about the site, prepended to the user message. */
	extraContext?: string;
}): ChatMessage[] {
	const system = systemprompt?.trim() ? systemprompt.trim() : DEFAULT_SYSTEM_PROMPT;

	const user = [
		extraContext?.trim() ? `BACKGROUND:\n${extraContext.trim()}` : undefined,
		`SEARCH QUERY:\n${query}`,
		`CONTEXT:\n${context || 'n/a'}`
	]
		.filter((part): part is string => part !== undefined)
		.join('\n\n');

	return [
		{ role: 'system', content: system },
		{ role: 'user', content: user }
	];
}

export { DEFAULT_SYSTEM_PROMPT as DEFAULT_OVERVIEW_SYSTEM_PROMPT };
