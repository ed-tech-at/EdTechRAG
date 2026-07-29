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
	queryRewriteContext?: string;
	queryRewriteApiLanguage?: string;
	queryRewriteReasoningEffort?: string;
	queryRewriteTextVerbosity?: string;
	requireUserterms?: boolean;
	usertermsDurationMonths?: number;
};

export type QueryRewriteConfig = {
	enabled: boolean;
	model?: string;
	count: number;
	docsPerSearch: number;
	includeHistory: boolean;
	context?: string;
	// Optional overrides; undefined means "inherit the repo's chat setting".
	apiLanguage?: string;
	reasoningEffort?: string;
	textVerbosity?: string;
};

const QUERY_REWRITE_API_LANGUAGES = ['chat/completions', 'responses'];
const QUERY_REWRITE_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'];
const QUERY_REWRITE_TEXT_VERBOSITIES = ['low', 'medium', 'high'];

const optionalEnum = (value: unknown, allowed: string[]): string | undefined =>
	typeof value === 'string' && allowed.includes(value) ? value : undefined;

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
			typeof raw.usertermsDurationMonths === 'number' ? raw.usertermsDurationMonths : undefined
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

export function getUsertermsDurationMonths(ragConfig: RagConfig | undefined): number {
	const months = ragConfig?.usertermsDurationMonths;
	if (typeof months !== 'number' || !Number.isFinite(months)) return USERTERMS_DEFAULT_MONTHS;
	return Math.min(Math.max(Math.floor(months), USERTERMS_MIN_MONTHS), USERTERMS_MAX_MONTHS);
}

export function getUsertermsMaxAgeMs(ragConfig: RagConfig | undefined): number {
	return getUsertermsDurationMonths(ragConfig) * MONTH_MS + USERTERMS_GRACE_MS;
}

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
		context:
			typeof ragConfig?.queryRewriteContext === 'string' && ragConfig.queryRewriteContext.trim()
				? ragConfig.queryRewriteContext.trim()
				: undefined,
		apiLanguage: optionalEnum(ragConfig?.queryRewriteApiLanguage, QUERY_REWRITE_API_LANGUAGES),
		reasoningEffort: optionalEnum(
			ragConfig?.queryRewriteReasoningEffort,
			QUERY_REWRITE_REASONING_EFFORTS
		),
		textVerbosity: optionalEnum(ragConfig?.queryRewriteTextVerbosity, QUERY_REWRITE_TEXT_VERBOSITIES)
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

function getMetaRecord(meta: unknown): Record<string, unknown> {
	return meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
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

	for (const tag of metaTags) {
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
