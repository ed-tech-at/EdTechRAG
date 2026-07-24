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
};

export type QueryRewriteConfig = {
	enabled: boolean;
	model?: string;
	count: number;
	docsPerSearch: number;
	includeHistory: boolean;
	context?: string;
};

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
				: undefined
	};
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
				: undefined
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
