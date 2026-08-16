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
	'3. Three to six sentences, or a short bullet list.'
].join('\n');

/**
 * How the answer must LOOK - always appended, and deliberately not part of the
 * overridable prompt above.
 *
 * The reason is a bug that only showed up on some repositories: a repository can
 * replace the system prompt in the admin UI, and doing so replaced the citation
 * and formatting rules along with the wording. The overview then came back with
 * bare URLs in the middle of a sentence, because nothing had asked for links -
 * and the embed's renderer turns [label](url) into a link, not a naked address.
 * A repository owner overrides the VOICE; the SHAPE is not theirs to drop.
 *
 * The list is exactly what static/embed/search/edtechrag-search.js can render.
 * Anything else - headings, tables, fenced code - reaches the visitor as literal
 * characters, so asking for it would be asking for damage. Whoever extends the
 * renderer extends this list, and the other way round.
 */
const OUTPUT_FORMAT_RULES = [
	'Output format (always):',
	'- Markdown, and ONLY these constructs: paragraphs, "- " bullet lists, **bold**, *italic*, [label](url).',
	'- Never write a bare URL. Every address belongs inside [label](url), and the label is the page title, never the address itself.',
	'- Cite with the URL given with each context entry. Never invent a URL, a title, a date or a number that is not in the context.',
	'- No headings, no tables, no code fences, no images, no footnotes: they are shown as literal characters.',
	'- No greeting, no closing remark.'
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
	const voice = systemprompt?.trim() ? systemprompt.trim() : DEFAULT_SYSTEM_PROMPT;
	// Die Formatregeln stehen ZULETZT - bei widerspruechlichen Anweisungen folgt ein
	// Modell in aller Regel der spaeteren, und diese hier sind die, an denen der
	// Darsteller im Embed haengt.
	const system = `${voice}\n\n${OUTPUT_FORMAT_RULES}`;

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

export {
	DEFAULT_SYSTEM_PROMPT as DEFAULT_OVERVIEW_SYSTEM_PROMPT,
	OUTPUT_FORMAT_RULES as OVERVIEW_OUTPUT_FORMAT_RULES
};
