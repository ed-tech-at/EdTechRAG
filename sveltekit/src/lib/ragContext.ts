export type RagConfig = {
	systemprompt?: string;
	chunkSize?: number;
	chunkOverlap?: number;
	numberDocuments?: number;
	metaTags?: string[];
	queryRewriteEnabled?: boolean;
	queryRewriteModel?: string;
	queryRewriteCount?: number;
	queryRewriteDocsPerSearch?: number;
	queryRewriteIncludeHistory?: boolean;
	queryRewriteHistoryLimit?: number;
	queryRewriteContext?: string;
	queryRewriteApiLanguage?: string;
	queryRewriteReasoningEffort?: string;
	queryRewriteTextVerbosity?: string;
	requireUserterms?: boolean;
	usertermsDurationMonths?: number;
	/* -- Search embed (static/embed/search) -- */
	searchMode?: string;
	searchResultLimit?: number;
	searchSnippetLength?: number;
	/* -- AI overview above the search results -- */
	aiOverviewEnabled?: boolean;
	aiOverviewModel?: string;
	aiOverviewSystemprompt?: string;
	aiOverviewContext?: string;
	aiOverviewDocuments?: number;
	aiOverviewApiLanguage?: string;
	aiOverviewReasoningEffort?: string;
	aiOverviewTextVerbosity?: string;
	aiOverviewRequireUserterms?: boolean;
	aiOverviewUsertermsDurationMonths?: number;
	/* -- Webview (the /webview/[repoUrl] full-page chat) -- */
	webviewIntroHtml?: string;
	webviewRequireUserterms?: boolean;
	webviewUsertermsUrl?: string;
	webviewUsertermsDurationMonths?: number;
};

export type QueryRewriteConfig = {
	enabled: boolean;
	model?: string;
	count: number;
	docsPerSearch: number;
	includeHistory: boolean;
	/** How many of the last chat messages the rewrite prompt may see. */
	historyLimit: number;
	context?: string;
	// Optional overrides; undefined means "inherit the repo's chat setting".
	apiLanguage?: string;
	reasoningEffort?: string;
	textVerbosity?: string;
};

/**
 * Search results and the AI overview above them (static/embed/search).
 *
 * Deliberately a separate config from queryRewrite even though both drive an LLM
 * call: query rewrite makes retrieval better and stays invisible, the overview is
 * a visible answer the visitor has to consent to. Sharing a model or a verbosity
 * setting between the two would mean one of them cannot be tuned without moving
 * the other.
 */
export type AiOverviewConfig = {
	enabled: boolean;
	model?: string;
	systemprompt?: string;
	/** Extra instruction prepended to the user message - the counterpart of queryRewriteContext. */
	context?: string;
	/** How many retrieved documents the overview is allowed to summarise. */
	documents: number;
	// Optional overrides; undefined means "inherit the repo's chat setting".
	apiLanguage?: string;
	reasoningEffort?: string;
	textVerbosity?: string;
	/**
	 * Consent gate. Separate from `requireUserterms` (the chatbot): a site may run
	 * the search without a chatbot, and the visitor consents to the overview, not
	 * to a conversation.
	 */
	requireUserterms: boolean;
	usertermsDurationMonths: number;
};

export type SearchConfig = {
	/**
	 * How the result list is found.
	 *
	 * 'fulltext' searches the DATABASE ONLY - Postgres full-text search over the
	 * stored chunks, no embedding call, no LLM call. This is the default, because a
	 * site search runs on every visitor query and paying an embedding call for
	 * "which page mentions Notenexport" is spending money on a job SQL already does.
	 *
	 * 'vector' is the semantic path the chatbot uses: it embeds the query and
	 * compares vectors. Better for questions phrased differently from the text,
	 * worse for exact terms - and it costs one API call per search.
	 *
	 * This governs the RESULT LIST only. The AI overview always retrieves
	 * semantically (RAG) and shows its own matches above the list - but only after
	 * the visitor consented, because that retrieval is what costs the API call.
	 */
	mode: SearchMode;
	/** How many documents (not chunks) the result list shows at most. */
	resultLimit: number;
	/** Characters per snippet. Long enough to judge a hit, short enough to scan. */
	snippetLength: number;
};

export const SEARCH_MODES = ['fulltext', 'vector'] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

// The three enums are the same values the chat client accepts; the constants stay
// named after query rewrite because that is where they were first needed.
const QUERY_REWRITE_API_LANGUAGES = ['chat/completions', 'responses'];
const QUERY_REWRITE_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'];
const QUERY_REWRITE_TEXT_VERBOSITIES = ['low', 'medium', 'high'];

const optionalEnum = (value: unknown, allowed: string[]): string | undefined =>
	typeof value === 'string' && allowed.includes(value) ? value : undefined;

const optionalPositiveInt = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;

/**
 * How many of the last chat messages go into the rewrite prompt when
 * `queryRewriteIncludeHistory` is on. Messages, not turns - six is roughly three
 * question/answer rounds, enough to resolve "it" or "that" without paying for the
 * whole conversation on every search.
 */
export const QUERY_REWRITE_DEFAULT_HISTORY_LIMIT = 6;

const optionalTrimmed = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim() ? value.trim() : undefined;

export type RagContextResult = {
	content?: string | null;
	remoteUrl?: string;
	meta?: Record<string, unknown> | unknown;
};

export function parseRagConfig(value: unknown): RagConfig | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}

	const raw = value as Record<string, unknown>;
	const metaTags = Array.isArray(raw.metaTags)
		? raw.metaTags
				.filter((tag): tag is string => typeof tag === 'string')
				.map((tag) => tag.trim())
				.filter(Boolean)
		: undefined;

	return {
		systemprompt: typeof raw.systemprompt === 'string' ? raw.systemprompt : undefined,
		chunkSize: typeof raw.chunkSize === 'number' ? raw.chunkSize : undefined,
		chunkOverlap: typeof raw.chunkOverlap === 'number' ? raw.chunkOverlap : undefined,
		numberDocuments: typeof raw.numberDocuments === 'number' ? raw.numberDocuments : undefined,
		metaTags,
		queryRewriteEnabled:
			typeof raw.queryRewriteEnabled === 'boolean' ? raw.queryRewriteEnabled : undefined,
		queryRewriteModel:
			typeof raw.queryRewriteModel === 'string' && raw.queryRewriteModel.trim()
				? raw.queryRewriteModel.trim()
				: undefined,
		queryRewriteCount:
			typeof raw.queryRewriteCount === 'number' ? raw.queryRewriteCount : undefined,
		queryRewriteDocsPerSearch:
			typeof raw.queryRewriteDocsPerSearch === 'number' ? raw.queryRewriteDocsPerSearch : undefined,
		queryRewriteIncludeHistory:
			typeof raw.queryRewriteIncludeHistory === 'boolean'
				? raw.queryRewriteIncludeHistory
				: undefined,
		queryRewriteHistoryLimit: optionalPositiveInt(raw.queryRewriteHistoryLimit),
		queryRewriteContext:
			typeof raw.queryRewriteContext === 'string' && raw.queryRewriteContext.trim()
				? raw.queryRewriteContext.trim()
				: undefined,
		queryRewriteApiLanguage: optionalEnum(raw.queryRewriteApiLanguage, QUERY_REWRITE_API_LANGUAGES),
		queryRewriteReasoningEffort: optionalEnum(
			raw.queryRewriteReasoningEffort,
			QUERY_REWRITE_REASONING_EFFORTS
		),
		queryRewriteTextVerbosity: optionalEnum(
			raw.queryRewriteTextVerbosity,
			QUERY_REWRITE_TEXT_VERBOSITIES
		),
		requireUserterms: typeof raw.requireUserterms === 'boolean' ? raw.requireUserterms : undefined,
		usertermsDurationMonths:
			typeof raw.usertermsDurationMonths === 'number' ? raw.usertermsDurationMonths : undefined,
		searchMode: optionalEnum(raw.searchMode, [...SEARCH_MODES]),
		searchResultLimit: optionalPositiveInt(raw.searchResultLimit),
		searchSnippetLength: optionalPositiveInt(raw.searchSnippetLength),
		aiOverviewEnabled:
			typeof raw.aiOverviewEnabled === 'boolean' ? raw.aiOverviewEnabled : undefined,
		aiOverviewModel: optionalTrimmed(raw.aiOverviewModel),
		aiOverviewSystemprompt: optionalTrimmed(raw.aiOverviewSystemprompt),
		aiOverviewContext: optionalTrimmed(raw.aiOverviewContext),
		aiOverviewDocuments: optionalPositiveInt(raw.aiOverviewDocuments),
		aiOverviewApiLanguage: optionalEnum(raw.aiOverviewApiLanguage, QUERY_REWRITE_API_LANGUAGES),
		aiOverviewReasoningEffort: optionalEnum(
			raw.aiOverviewReasoningEffort,
			QUERY_REWRITE_REASONING_EFFORTS
		),
		aiOverviewTextVerbosity: optionalEnum(
			raw.aiOverviewTextVerbosity,
			QUERY_REWRITE_TEXT_VERBOSITIES
		),
		aiOverviewRequireUserterms:
			typeof raw.aiOverviewRequireUserterms === 'boolean'
				? raw.aiOverviewRequireUserterms
				: undefined,
		aiOverviewUsertermsDurationMonths: optionalPositiveInt(raw.aiOverviewUsertermsDurationMonths),
		// Kept untrimmed on purpose: this is raw HTML an admin authored (may contain
		// <img> logos); reformatting it here would surprise the author.
		webviewIntroHtml:
			typeof raw.webviewIntroHtml === 'string' && raw.webviewIntroHtml.trim()
				? raw.webviewIntroHtml
				: undefined,
		webviewRequireUserterms:
			typeof raw.webviewRequireUserterms === 'boolean' ? raw.webviewRequireUserterms : undefined,
		webviewUsertermsUrl: optionalTrimmed(raw.webviewUsertermsUrl),
		webviewUsertermsDurationMonths: optionalPositiveInt(raw.webviewUsertermsDurationMonths)
	};
}

/*
 * User-terms consent.
 *
 * The acceptance timestamp is produced by the embed widget in the visitor's browser, so it is an
 * attestation and not a proof: a hand-crafted request from an allowed origin can invent a value.
 * `requireUserterms` therefore enforces the consent flow for real users; the origin regex
 * (embedAllowedHostRegex) stays the outer gate.
 */

export const USERTERMS_DEFAULT_MONTHS = 12;
export const USERTERMS_MIN_MONTHS = 1;
export const USERTERMS_MAX_MONTHS = 60;

// A "month" is a fixed 30 days here. Calendar math (setMonth(+12)) is timezone/DST dependent and
// clamps Feb 29, which would make the client and the server disagree at the expiry boundary.
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// The server accepts acceptances that are slightly older than the configured window, so the widget
// (which uses the plain window) always re-prompts before the server would answer 403.
export const USERTERMS_GRACE_MS = 6 * 24 * 60 * 60 * 1000;

// Consumer clocks are routinely minutes to hours off; a strict "no future timestamps" rule would
// produce an unrecoverable 403 for those visitors.
export const USERTERMS_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

/** Clamp to the allowed window; anything unusable falls back to the default. */
const clampMonths = (months: unknown): number =>
	typeof months !== 'number' || !Number.isFinite(months)
		? USERTERMS_DEFAULT_MONTHS
		: Math.min(Math.max(Math.floor(months), USERTERMS_MIN_MONTHS), USERTERMS_MAX_MONTHS);

export function getUsertermsDurationMonths(ragConfig: RagConfig | undefined): number {
	return clampMonths(ragConfig?.usertermsDurationMonths);
}

export function getUsertermsMaxAgeMs(ragConfig: RagConfig | undefined): number {
	return getUsertermsDurationMonths(ragConfig) * MONTH_MS + USERTERMS_GRACE_MS;
}

/** Months -> the server-side acceptance window, grace included. */
export const usertermsMaxAgeMsForMonths = (months: number): number =>
	clampMonths(months) * MONTH_MS + USERTERMS_GRACE_MS;

/**
 * Validates a client-supplied acceptance timestamp and returns it in canonical ISO form,
 * or null when it is missing, malformed, too far in the future or expired.
 */
export function validateTermsAcceptedAt(
	value: unknown,
	maxAgeMs: number,
	now: number = Date.now()
): string | null {
	if (typeof value !== 'string') return null;
	// Keep junk out of the database before parsing; a valid ISO timestamp is well under 40 chars.
	if (!value || value.length > 40) return null;

	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) return null;
	if (parsed > now + USERTERMS_FUTURE_SKEW_MS) return null;
	if (now - parsed > maxAgeMs) return null;

	return new Date(parsed).toISOString();
}

export function getQueryRewriteConfig(
	ragConfig: RagConfig | undefined,
	fallbackDocs: number = 4
): QueryRewriteConfig {
	const count =
		typeof ragConfig?.queryRewriteCount === 'number' && ragConfig.queryRewriteCount > 0
			? Math.floor(ragConfig.queryRewriteCount)
			: 3;
	const docsPerSearch =
		typeof ragConfig?.queryRewriteDocsPerSearch === 'number' &&
		ragConfig.queryRewriteDocsPerSearch > 0
			? Math.floor(ragConfig.queryRewriteDocsPerSearch)
			: fallbackDocs;

	return {
		enabled: ragConfig?.queryRewriteEnabled === true,
		model:
			typeof ragConfig?.queryRewriteModel === 'string' && ragConfig.queryRewriteModel.trim()
				? ragConfig.queryRewriteModel.trim()
				: undefined,
		count,
		docsPerSearch,
		includeHistory: ragConfig?.queryRewriteIncludeHistory === true,
		historyLimit:
			optionalPositiveInt(ragConfig?.queryRewriteHistoryLimit) ??
			QUERY_REWRITE_DEFAULT_HISTORY_LIMIT,
		context:
			typeof ragConfig?.queryRewriteContext === 'string' && ragConfig.queryRewriteContext.trim()
				? ragConfig.queryRewriteContext.trim()
				: undefined,
		apiLanguage: optionalEnum(ragConfig?.queryRewriteApiLanguage, QUERY_REWRITE_API_LANGUAGES),
		reasoningEffort: optionalEnum(
			ragConfig?.queryRewriteReasoningEffort,
			QUERY_REWRITE_REASONING_EFFORTS
		),
		textVerbosity: optionalEnum(
			ragConfig?.queryRewriteTextVerbosity,
			QUERY_REWRITE_TEXT_VERBOSITIES
		)
	};
}

/** Defaults of the search result list. */
export const SEARCH_DEFAULT_RESULT_LIMIT = 10;
export const SEARCH_DEFAULT_SNIPPET_LENGTH = 320;

export function getSearchConfig(ragConfig: RagConfig | undefined): SearchConfig {
	return {
		// 'fulltext' unless the repository asks for the semantic path - see SearchConfig.
		mode: ragConfig?.searchMode === 'vector' ? 'vector' : 'fulltext',
		resultLimit: ragConfig?.searchResultLimit ?? SEARCH_DEFAULT_RESULT_LIMIT,
		snippetLength: ragConfig?.searchSnippetLength ?? SEARCH_DEFAULT_SNIPPET_LENGTH
	};
}

/**
 * The AI overview above the search results.
 *
 * `enabled` false is the default on purpose: a repository that was configured
 * before this feature existed must not start spending tokens - and showing an
 * answer - because the code was updated.
 */
export function getAiOverviewConfig(
	ragConfig: RagConfig | undefined,
	fallbackDocs: number = 4
): AiOverviewConfig {
	return {
		enabled: ragConfig?.aiOverviewEnabled === true,
		model: ragConfig?.aiOverviewModel,
		systemprompt: ragConfig?.aiOverviewSystemprompt,
		context: ragConfig?.aiOverviewContext,
		documents: ragConfig?.aiOverviewDocuments ?? fallbackDocs,
		apiLanguage: optionalEnum(ragConfig?.aiOverviewApiLanguage, QUERY_REWRITE_API_LANGUAGES),
		reasoningEffort: optionalEnum(
			ragConfig?.aiOverviewReasoningEffort,
			QUERY_REWRITE_REASONING_EFFORTS
		),
		textVerbosity: optionalEnum(ragConfig?.aiOverviewTextVerbosity, QUERY_REWRITE_TEXT_VERBOSITIES),
		// Consent required unless the repo says otherwise: the safe default for a
		// feature that sends the visitor's question to a language model.
		requireUserterms: ragConfig?.aiOverviewRequireUserterms !== false,
		usertermsDurationMonths: clampMonths(
			ragConfig?.aiOverviewUsertermsDurationMonths ?? ragConfig?.usertermsDurationMonths
		)
	};
}

/**
 * The /webview/[repoUrl] full-page chat.
 *
 * `introHtml` is raw HTML written by the repository admin (so external logos via
 * <img> are possible) - it is rendered unescaped and must never be filled from
 * visitor input.
 */
export type WebviewConfig = {
	introHtml: string;
	requireUserterms: boolean;
	usertermsUrl?: string;
	usertermsDurationMonths: number;
};

export function getWebviewConfig(ragConfig: RagConfig | undefined): WebviewConfig {
	return {
		introHtml: ragConfig?.webviewIntroHtml ?? '',
		requireUserterms: ragConfig?.webviewRequireUserterms === true,
		usertermsUrl: ragConfig?.webviewUsertermsUrl,
		// Falls back to the chatbot's consent window, then to the 12-month default -
		// same chain as the AI overview.
		usertermsDurationMonths: clampMonths(
			ragConfig?.webviewUsertermsDurationMonths ?? ragConfig?.usertermsDurationMonths
		)
	};
}

export function getSystemPrompt(ragConfig: RagConfig | undefined): string {
	return typeof ragConfig?.systemprompt === 'string' ? ragConfig.systemprompt : '';
}

export function getNumberDocuments(ragConfig: RagConfig | undefined, fallback: number = 4): number {
	return typeof ragConfig?.numberDocuments === 'number' && ragConfig.numberDocuments > 0
		? ragConfig.numberDocuments
		: fallback;
}

export function getMetaTags(ragConfig: RagConfig | undefined): string[] {
	return ragConfig?.metaTags ?? [];
}

/**
 * The wildcard for `Meta tags`: take every key the document actually carries,
 * instead of listing them.
 *
 * Useful because the ingest side already stores EVERYTHING. /api/gitlab/chunk
 * writes all HTML-comment keys of a markdown file into DataFile.meta unfiltered -
 * `metaTags` never governed what is fetched, only what is handed on. Before this,
 * a new fact in the export (say RUNTIME_TO) was in the database but invisible until
 * someone remembered to add it here.
 */
export const META_TAGS_ALL = '*';

/**
 * Keys the ingest pipeline writes for its own bookkeeping. They are never content
 * and must never be emitted - not to the chatbot and not into a search result.
 *
 * `fetch_url` is the one that matters: it is the internal GitLab Files API address
 * the text was pulled from, including the project id. Handed to a language model it
 * becomes a URL the model may cite; handed to the search embed it is readable by
 * every allowed origin. The public address lives in `url`, which is a different
 * key on purpose.
 */
export const INTERNAL_META_KEYS = new Set([
	'fetch_url',
	'source',
	'status',
	'headsha',
	'basesha',
	'path',
	'workdir',
	'branch',
	'ref',
	'repository_full_name',
	'github_default_branch'
]);

/**
 * The keys to emit for ONE document: the configured list, or - with '*' - every key
 * the document has, minus the bookkeeping above.
 *
 * Resolved per document and not once per repository, because with '*' the answer
 * depends on the document: an article carries `category`, a project `runtime`.
 */
export function resolveMetaTags(meta: unknown, metaTags: string[]): string[] {
	if (!metaTags.includes(META_TAGS_ALL)) return metaTags;

	const record = getMetaRecord(meta);
	return Object.keys(record).filter((key) => !INTERNAL_META_KEYS.has(key.toLowerCase()));
}

function getMetaRecord(meta: unknown): Record<string, unknown> {
	return meta && typeof meta === 'object' && !Array.isArray(meta)
		? (meta as Record<string, unknown>)
		: {};
}

function stringifyMetaValue(value: unknown): string | undefined {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed || undefined;
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	if (Array.isArray(value)) {
		const items = value
			.map((item) => stringifyMetaValue(item))
			.filter((item): item is string => Boolean(item));
		return items.length > 0 ? items.join(', ') : undefined;
	}

	return undefined;
}

export function getRagContextUrl(result: RagContextResult): string {
	const meta = getMetaRecord(result.meta);
	return stringifyMetaValue(meta.url) ?? result.remoteUrl ?? '—';
}

export function getRagMetadataJson(
	result: RagContextResult,
	metaTags: string[] = []
): Record<string, string> {
	const meta = getMetaRecord(result.meta);
	const metadata: Record<string, string> = {};
	const includeUrl = metaTags.length > 0;

	if (includeUrl) {
		const url = getRagContextUrl(result);
		if (url !== '—') {
			metadata.url = url;
		}
	}

	for (const tag of resolveMetaTags(result.meta, metaTags)) {
		if (tag.toLowerCase() === 'url') {
			continue;
		}
		const value = stringifyMetaValue(meta[tag]);
		if (value !== undefined) {
			metadata[tag] = value;
		}
	}

	return metadata;
}

export function formatRagContextEntry(result: RagContextResult, metaTags: string[] = []): string {
	const lines = [
		`URL: ${getRagContextUrl(result)}`,
		`METADATA_JSON:\n${JSON.stringify(getRagMetadataJson(result, metaTags))}`
	];

	lines.push(`CONTENT:\n${result.content ?? '—'}`);

	return lines.join('\n');
}

export function formatRagContext(results: RagContextResult[], metaTags: string[] = []): string {
	return results.map((result) => formatRagContextEntry(result, metaTags)).join('\n\n');
}
