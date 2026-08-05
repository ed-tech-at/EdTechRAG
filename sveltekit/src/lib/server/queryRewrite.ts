import {
	getChatClient,
	type ApiLanguage,
	type ReasoningEffort,
	type TextVerbosity
} from '$lib/server/openaiClient';
import { findRepositoryContext, type RagResult } from '$lib/server/rag';
import { getNumberDocuments, getQueryRewriteConfig, type RagConfig } from '$lib/ragContext';

export type RewriteHistoryItem = { role?: string; content?: string };

type RewriteQueriesParams = {
	repoUrl: string;
	prompt: string;
	history?: RewriteHistoryItem[];
	count: number;
	model?: string;
	includeHistory: boolean;
	context?: string;
	// Optional overrides; when omitted the repo's chat defaults are used.
	apiLanguage?: string;
	reasoningEffort?: string;
	textVerbosity?: string;
};

const REWRITE_SYSTEM_PROMPT = `You are a search query optimizer for a retrieval system.
Rewrite the user's question into optimized search queries that improve retrieval quality.
Rules:
1. Preserve the original meaning and language of the question.
2. Remove conversational filler; make queries explicit and keyword-rich.
3. Resolve references (e.g. "it", "that") using the conversation context when provided.
4. Return ONLY valid JSON of the form {"queries": ["...", "..."]} with no extra text.`;

const buildHistoryText = (history: RewriteHistoryItem[]): string => {
	const lines = history
		.filter(
			(item): item is { role: string; content: string } =>
				typeof item?.role === 'string' && typeof item?.content === 'string'
		)
		.slice(-6)
		.map((item) => `${item.role}: ${item.content}`);
	return lines.length > 0 ? lines.join('\n') : '';
};

const extractQueries = (raw: string): string[] => {
	if (!raw) return [];
	// Strip Markdown code fences if the model wrapped the JSON.
	let text = raw.trim();
	const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenceMatch) text = fenceMatch[1].trim();

	// Fall back to the first {...} block if there is surrounding prose.
	if (!text.startsWith('{')) {
		const braceStart = text.indexOf('{');
		const braceEnd = text.lastIndexOf('}');
		if (braceStart !== -1 && braceEnd > braceStart) {
			text = text.slice(braceStart, braceEnd + 1);
		}
	}

	try {
		const parsed = JSON.parse(text) as unknown;
		const queries =
			parsed && typeof parsed === 'object' && 'queries' in parsed
				? (parsed as { queries?: unknown }).queries
				: parsed;
		if (Array.isArray(queries)) {
			return queries
				.filter((q): q is string => typeof q === 'string')
				.map((q) => q.trim())
				.filter(Boolean);
		}
	} catch {
		/* fall through to empty */
	}
	return [];
};

/**
 * Ask the (small) rewrite model to turn the user prompt into `count` optimized
 * search queries. Reuses the repository's chat client but overrides the model
 * with the configured rewrite model when present. Always falls back to the
 * original prompt so retrieval never breaks on a bad rewrite.
 */
export async function rewriteQueries({
	repoUrl,
	prompt,
	history = [],
	count,
	model,
	includeHistory,
	context,
	apiLanguage,
	reasoningEffort,
	textVerbosity
}: RewriteQueriesParams): Promise<string[]> {
	const fallback = [prompt];

	try {
		const {
			client,
			model: defaultModel,
			apiLanguage: defaultApiLanguage,
			reasoningEffort: defaultReasoningEffort,
			textVerbosity: defaultTextVerbosity
		} = await getChatClient(repoUrl);
		const rewriteModel = model && model.trim() ? model.trim() : defaultModel;

		// Each override falls back to the repo's chat default when not set.
		const effectiveApiLanguage = (apiLanguage as ApiLanguage) || defaultApiLanguage;
		const effectiveReasoning =
			(reasoningEffort as ReasoningEffort | undefined) ?? defaultReasoningEffort;
		const effectiveVerbosity = (textVerbosity as TextVerbosity | undefined) ?? defaultTextVerbosity;

		const contextText = context && context.trim() ? context.trim() : '';
		const historyText = includeHistory ? buildHistoryText(history) : '';
		const userContent =
			`Generate ${count} search ${count === 1 ? 'query' : 'queries'}.` +
			(contextText ? `\n\nContext:\n${contextText}` : '') +
			(historyText ? `\n\nConversation so far:\n${historyText}` : '') +
			`\n\nUser Question:\n${prompt}`;

		let raw = '';
		if (effectiveApiLanguage === 'responses') {
			const response = await client.responses.create({
				model: rewriteModel,
				input: [
					{ role: 'system', content: REWRITE_SYSTEM_PROMPT },
					{ role: 'user', content: userContent }
				],
				stream: false,
				...(effectiveReasoning ? { reasoning: { effort: effectiveReasoning } } : {}),
				...(effectiveVerbosity ? { text: { verbosity: effectiveVerbosity } } : {})
			});
			raw = response.output_text ?? '';
		} else {
			const completion = await client.chat.completions.create({
				model: rewriteModel,
				messages: [
					{ role: 'system', content: REWRITE_SYSTEM_PROMPT },
					{ role: 'user', content: userContent }
				],
				stream: false
			});
			raw = completion.choices?.[0]?.message?.content ?? '';
		}

		const queries = extractQueries(raw);
		if (queries.length === 0) return fallback;
		return queries.slice(0, count);
	} catch (err) {
		console.error('Query rewrite failed, falling back to original prompt', err);
		return fallback;
	}
}

type RetrieveWithRewriteParams = {
	repoUrl: string;
	prompt: string;
	history?: RewriteHistoryItem[];
	ragConfig: RagConfig | undefined;
	/** Force the rewrite step even when the repo config has it disabled (diagnostic view). */
	forceRewrite?: boolean;
	/**
	 * How many chunks to retrieve, overriding ragConfig.numberDocuments.
	 *
	 * The search endpoint needs it: its result list shows DOCUMENTS, and several
	 * chunks of one page collapse into one entry - so it has to ask for more chunks
	 * than it wants results. An explicit parameter and not a doctored ragConfig, so
	 * the call site says what it does.
	 *
	 * Only the FALLBACK is overridden: an explicitly configured
	 * queryRewriteDocsPerSearch still wins, because that is a deliberate setting.
	 */
	documents?: number;
	/** Restrict retrieval to one language (meta.lang). See findRepositoryContext. */
	lang?: string;
};

export type RetrieveWithRewriteResult = {
	queries: string[];
	results: RagResult[];
	rewriteApplied: boolean;
};

/**
 * Retrieve context for a prompt, optionally expanding it into several search
 * queries first. Results from all queries are deduplicated by chunk id (keeping
 * the highest similarity) and sorted by similarity descending.
 */
export async function retrieveWithRewrite({
	repoUrl,
	prompt,
	history = [],
	ragConfig,
	forceRewrite = false,
	documents,
	lang
}: RetrieveWithRewriteParams): Promise<RetrieveWithRewriteResult> {
	const fallbackDocs =
		documents && documents > 0 ? Math.floor(documents) : getNumberDocuments(ragConfig);
	const rewrite = getQueryRewriteConfig(ragConfig, fallbackDocs);

	if (!rewrite.enabled && !forceRewrite) {
		const { results } = await findRepositoryContext(repoUrl, prompt, fallbackDocs, lang);
		return { queries: [prompt], results, rewriteApplied: false };
	}

	const queries = await rewriteQueries({
		repoUrl,
		prompt,
		history,
		count: rewrite.count,
		model: rewrite.model,
		includeHistory: rewrite.includeHistory,
		context: rewrite.context,
		apiLanguage: rewrite.apiLanguage,
		reasoningEffort: rewrite.reasoningEffort,
		textVerbosity: rewrite.textVerbosity
	});

	const merged = new Map<string, RagResult>();
	for (const query of queries) {
		const { results } = await findRepositoryContext(repoUrl, query, rewrite.docsPerSearch, lang);
		for (const result of results) {
			const existing = merged.get(result.id);
			if (!existing || result.similarity > existing.similarity) {
				merged.set(result.id, result);
			}
		}
	}

	const results = Array.from(merged.values()).sort((a, b) => b.similarity - a.similarity);
	return { queries, results, rewriteApplied: true };
}
