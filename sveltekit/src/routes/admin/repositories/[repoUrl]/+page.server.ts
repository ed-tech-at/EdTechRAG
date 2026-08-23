import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { Actions, PageServerLoad } from './$types';
import type { Prisma } from '../../../../generated/prisma/client';
import prisma from '$lib/server/db';
import { requireAllowedRepository } from '$lib/server/repository';
import {
	defaultRepositoryAccess,
	parseAccessCheckbox,
	parseEmbedAllowedHostRegex,
	validateRepositoryAccess
} from '$lib/server/repositoryAccess';
import {
	getNumberDocuments,
	INTERNAL_META_KEYS,
	isMetaLabelLang,
	META_LABEL_ANY_LANG,
	META_LABEL_MAX_ENTRIES,
	META_LABEL_MAX_LENGTH,
	META_TAGS_ALL,
	normalizeMetaKey,
	parseRagConfig,
	USERTERMS_MAX_MONTHS,
	USERTERMS_MIN_MONTHS,
	type MetaLabelTable
} from '$lib/ragContext';
import { canManageUsers, SITE_ROLE } from '$lib/siteRole';

const DEFAULT_CHAT_BASE = '';
const DEFAULT_EMBEDDING_BASE = '';
const DEFAULT_CHAT_MODEL = '';
const DEFAULT_EMBEDDING_MODEL = '';
const DEFAULT_GITHUB2_BASE = '';

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const stringValue = (value: unknown, fallback = '') =>
	typeof value === 'string' && value.trim() ? value.trim() : fallback;

const optionalString = (value: FormDataEntryValue | null) =>
	typeof value === 'string' && value.trim() ? value.trim() : undefined;

const optionalNumber = (value: FormDataEntryValue | null) => {
	if (typeof value !== 'string' || !value.trim()) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? Math.floor(parsed) : undefined;
};

const metaTagsFromForm = (value: FormDataEntryValue | null) =>
	typeof value === 'string'
		? value
				.split(/[\n,]/)
				.map((item) => item.trim())
				.filter(Boolean)
		: [];

/**
 * Same field format as metaTagsFromForm, but normalised to the key form the ingest
 * pipeline stores. Typing `Podcast Folge` should find `podcast_folge` rather than
 * quietly matching nothing.
 */
const searchMetaTagsFromForm = (value: FormDataEntryValue | null) =>
	metaTagsFromForm(value).map((tag) => (tag === META_TAGS_ALL ? tag : normalizeMetaKey(tag)));

/**
 * The naming table, one mapping per line:
 *
 *   episode.de = Podcast-Folge      a label for German pages
 *   episode.en = Podcast Episode    a label for English pages
 *   speaker    = Gast               a label for every language
 *
 * Malformed lines are REPORTED, not skipped. A silently dropped line is how an
 * admin ends up staring at a label that never appears and no message saying why.
 */
const metaLabelsFromForm = (
	value: FormDataEntryValue | null,
	errors: string[]
): MetaLabelTable => {
	if (typeof value !== 'string') return {};

	const table: MetaLabelTable = {};
	// Textareas submit CRLF; a stray \r would otherwise end up inside a stored label.
	const lines = value.split(/\r?\n/);

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i].trim();
		if (!line || line.startsWith('#')) continue;

		const at = line.indexOf('=');
		if (at < 0) {
			errors.push(`Meta label line ${i + 1}: expected "key = label" or "key.de = label".`);
			continue;
		}

		// First '=' only: a label may legitimately contain one.
		const rawKey = line.slice(0, at).trim();
		const label = line.slice(at + 1).trim();

		/*
		 * The language suffix is split off the LAST dot, and only when what follows
		 * actually looks like a language. A meta key may itself contain a dot
		 * (`runtime.min`), which would otherwise be read as key `runtime` in a
		 * language called `min`.
		 */
		let key = rawKey;
		let lang = META_LABEL_ANY_LANG;
		const dot = rawKey.lastIndexOf('.');
		if (dot > 0) {
			const suffix = rawKey.slice(dot + 1).trim().toLowerCase();
			if (isMetaLabelLang(suffix)) {
				key = rawKey.slice(0, dot);
				lang = suffix;
			}
		}

		key = normalizeMetaKey(key);

		if (!key || key === META_TAGS_ALL) {
			errors.push(`Meta label line ${i + 1}: missing a metadata key before the "=".`);
			continue;
		}
		if (!label) {
			errors.push(`Meta label line ${i + 1}: missing a label after the "=".`);
			continue;
		}
		if (label.length > META_LABEL_MAX_LENGTH) {
			errors.push(
				`Meta label line ${i + 1}: label longer than ${META_LABEL_MAX_LENGTH} characters.`
			);
			continue;
		}
		// url and title are their own search-result fields and never appear in the
		// meta line, so a label for them could never be shown.
		if (key === 'url' || key === 'title' || INTERNAL_META_KEYS.has(key)) {
			errors.push(`Meta label line ${i + 1}: "${key}" is never emitted, so it cannot be labelled.`);
			continue;
		}
		if (table[key] && table[key][lang] !== undefined) {
			errors.push(`Meta label line ${i + 1}: "${key}" already has a label for "${lang}".`);
			continue;
		}

		if (!table[key]) table[key] = {};
		table[key][lang] = label;
	}

	const count = Object.keys(table).length;
	if (count > META_LABEL_MAX_ENTRIES) {
		errors.push(`At most ${META_LABEL_MAX_ENTRIES} labelled metadata keys (got ${count}).`);
	}

	return table;
};

/**
 * Table -> textarea text, in a stable order (keys sorted, the any-language slot
 * first) so reopening the page does not reshuffle what was typed.
 *
 * Only used for DB -> form. A failed submit echoes the raw text instead, so the
 * line that caused the error is still there to be fixed.
 */
const metaLabelsToForm = (table: MetaLabelTable | undefined): string => {
	if (!table) return '';
	const lines: string[] = [];
	for (const key of Object.keys(table).sort()) {
		const langs = table[key];
		const ordered = Object.keys(langs).sort((a, b) =>
			a === META_LABEL_ANY_LANG ? -1 : b === META_LABEL_ANY_LANG ? 1 : a.localeCompare(b)
		);
		for (const lang of ordered) {
			lines.push(
				lang === META_LABEL_ANY_LANG ? `${key} = ${langs[lang]}` : `${key}.${lang} = ${langs[lang]}`
			);
		}
	}
	return lines.join('\n');
};

const deriveName = (repoUrl: string) => {
	const cleaned = repoUrl.replace(/\/$/, '');
	const last = cleaned.split('/').filter(Boolean).pop();
	return last || repoUrl;
};

const publicConfig = (repository: {
	name: string;
	url: string;
	updateConfig: unknown;
	LLM_API: unknown;
	ragConfig: unknown;
	activeSimplePage: boolean;
	activeSinglePage: boolean;
	activeParameterPage: boolean;
	activeWebviewPage: boolean;
	activeEmbedApi: boolean;
	activeSearchApi: boolean;
	embedAllowedHostRegex: string | null;
}) => {
	const updateConfig = asRecord(repository.updateConfig);
	const llm = asRecord(repository.LLM_API);
	const rag = parseRagConfig(repository.ragConfig);

	return {
		repositoryName: repository.name,
		repositoryUrl: repository.url,
		github: {
			repositoryPath: stringValue(updateConfig.repository_path),
			webhookPath: stringValue(updateConfig.github2_webhook_path),
			publicBaseUrl: stringValue(updateConfig.github2_public_base_url, DEFAULT_GITHUB2_BASE),
			hasSharedSecret: Boolean(stringValue(updateConfig.Github2EdTechRAG_SHARED_SECRET))
		},
		gitlab: {
			apiUrl: stringValue(updateConfig.gitlab_api_url),
			ref: stringValue(updateConfig.ref),
			hasPrivateToken: Boolean(stringValue(updateConfig['PRIVATE-TOKEN'])),
			hasSharedSecret: Boolean(stringValue(updateConfig.GitLab2EdTechRAG_SHARED_SECRET))
		},
		llm: {
			hasOpenAiApiKey: Boolean(stringValue(llm.OPENAI_API_KEY)),
			hasEmbeddingApiKey: Boolean(stringValue(llm.OPENAI_API_KEY_EMBEDDING)),
			openAiApiBase: stringValue(llm.OPENAI_API_BASE, DEFAULT_CHAT_BASE),
			chatModel: stringValue(llm.CHAT_MODEL, DEFAULT_CHAT_MODEL),
			apiLanguage: stringValue(llm.API_LANGUAGE, 'chat/completions'),
			reasoningEffort: stringValue(llm.reasoning_effort, 'none'),
			textVerbosity: stringValue(llm.text_verbosity, 'medium'),
			// azureUrl: stringValue(llm.AZURE_URL),
			// azureModel: stringValue(llm.AZURE_MODEL),
			// azureApiVersion: stringValue(llm.AZURE_API_VERSION, ''),
			embeddingBase: stringValue(llm.OPENAI_API_BASE_EMBEDDING, DEFAULT_EMBEDDING_BASE),
			embeddingModel: stringValue(llm.EMBEDDING_MODEL, DEFAULT_EMBEDDING_MODEL)
		},
		rag: {
			chunkSize: rag?.chunkSize,
			chunkOverlap: rag?.chunkOverlap,
			numberDocuments: getNumberDocuments(rag),
			metaTags: rag?.metaTags ?? [],
			systemprompt: rag?.systemprompt ?? '',
			queryRewriteEnabled: rag?.queryRewriteEnabled === true,
			queryRewriteModel: rag?.queryRewriteModel ?? '',
			queryRewriteCount: rag?.queryRewriteCount,
			queryRewriteDocsPerSearch: rag?.queryRewriteDocsPerSearch,
			queryRewriteIncludeHistory: rag?.queryRewriteIncludeHistory === true,
			queryRewriteHistoryLimit: rag?.queryRewriteHistoryLimit,
			queryRewriteContext: rag?.queryRewriteContext ?? '',
			queryRewriteApiLanguage: rag?.queryRewriteApiLanguage ?? '',
			queryRewriteReasoningEffort: rag?.queryRewriteReasoningEffort ?? '',
			queryRewriteTextVerbosity: rag?.queryRewriteTextVerbosity ?? '',
			requireUserterms: rag?.requireUserterms === true,
			usertermsDurationMonths: rag?.usertermsDurationMonths,
			searchMode: rag?.searchMode ?? 'fulltext',
			searchResultLimit: rag?.searchResultLimit,
			searchSnippetLength: rag?.searchSnippetLength,
			searchMetaTags: rag?.searchMetaTags ?? [],
			searchMetaLabels: metaLabelsToForm(rag?.searchMetaLabels),
			aiOverviewEnabled: rag?.aiOverviewEnabled === true,
			aiOverviewModel: rag?.aiOverviewModel ?? '',
			aiOverviewSystemprompt: rag?.aiOverviewSystemprompt ?? '',
			aiOverviewContext: rag?.aiOverviewContext ?? '',
			aiOverviewDocuments: rag?.aiOverviewDocuments,
			aiOverviewApiLanguage: rag?.aiOverviewApiLanguage ?? '',
			aiOverviewReasoningEffort: rag?.aiOverviewReasoningEffort ?? '',
			aiOverviewTextVerbosity: rag?.aiOverviewTextVerbosity ?? '',
			// Not stored yet means "required" - see getAiOverviewConfig.
			aiOverviewRequireUserterms: rag?.aiOverviewRequireUserterms !== false,
			aiOverviewUsertermsDurationMonths: rag?.aiOverviewUsertermsDurationMonths,
			webviewIntroHtml: rag?.webviewIntroHtml ?? '',
			webviewRequireUserterms: rag?.webviewRequireUserterms === true,
			webviewUsertermsUrl: rag?.webviewUsertermsUrl ?? '',
			webviewUsertermsDurationMonths: rag?.webviewUsertermsDurationMonths
		},
		access: {
			activeSimplePage: repository.activeSimplePage,
			activeSinglePage: repository.activeSinglePage,
			activeParameterPage: repository.activeParameterPage,
			activeWebviewPage: repository.activeWebviewPage,
			activeEmbedApi: repository.activeEmbedApi,
			activeSearchApi: repository.activeSearchApi,
			embedAllowedHostRegex: repository.embedAllowedHostRegex ?? ''
		}
	};
};

const formState = (
	repoUrl: string,
	formData: FormData,
	hasGithubSharedSecret: boolean,
	hasGitlabSharedSecret: boolean,
	hasGitlabPrivateToken: boolean,
	hasOpenAiApiKey: boolean,
	hasEmbeddingApiKey: boolean
) => {
	const githubBase =
		optionalString(formData.get('github2_public_base_url')) ?? DEFAULT_GITHUB2_BASE;
	const webhookPath = optionalString(formData.get('github2_webhook_path')) ?? '';

	return {
		repositoryName: optionalString(formData.get('name')) ?? deriveName(repoUrl),
		repositoryUrl: repoUrl,
		github: {
			repositoryPath: optionalString(formData.get('repository_path')) ?? '',
			webhookPath,
			publicBaseUrl: githubBase,
			hasSharedSecret: hasGithubSharedSecret
		},
		gitlab: {
			apiUrl: optionalString(formData.get('gitlab_api_url')) ?? '',
			ref: optionalString(formData.get('ref')) ?? '',
			hasPrivateToken: hasGitlabPrivateToken,
			hasSharedSecret: hasGitlabSharedSecret
		},
		llm: {
			hasOpenAiApiKey,
			hasEmbeddingApiKey,
			openAiApiBase: optionalString(formData.get('OPENAI_API_BASE')) ?? DEFAULT_CHAT_BASE,
			chatModel: optionalString(formData.get('CHAT_MODEL')) ?? DEFAULT_CHAT_MODEL,
			apiLanguage: optionalString(formData.get('API_LANGUAGE')) ?? 'chat/completions',
			reasoningEffort: optionalString(formData.get('reasoning_effort')) ?? 'none',
			textVerbosity: optionalString(formData.get('text_verbosity')) ?? 'medium',
			// azureUrl: optionalString(formData.get('AZURE_URL')) ?? '',
			// azureModel: optionalString(formData.get('AZURE_MODEL')) ?? '',
			// azureApiVersion: optionalString(formData.get('AZURE_API_VERSION')) ?? '',
			embeddingBase:
				optionalString(formData.get('OPENAI_API_BASE_EMBEDDING')) ?? DEFAULT_EMBEDDING_BASE,
			embeddingModel: optionalString(formData.get('EMBEDDING_MODEL')) ?? DEFAULT_EMBEDDING_MODEL
		},
		rag: {
			chunkSize: optionalNumber(formData.get('chunkSize')),
			chunkOverlap: optionalNumber(formData.get('chunkOverlap')),
			numberDocuments: optionalNumber(formData.get('numberDocuments')) ?? 4,
			metaTags: metaTagsFromForm(formData.get('metaTags')),
			systemprompt:
				typeof formData.get('systemprompt') === 'string'
					? String(formData.get('systemprompt'))
					: '',
			queryRewriteEnabled: parseAccessCheckbox(formData, 'queryRewriteEnabled'),
			queryRewriteModel: optionalString(formData.get('queryRewriteModel')) ?? '',
			queryRewriteCount: optionalNumber(formData.get('queryRewriteCount')),
			queryRewriteDocsPerSearch: optionalNumber(formData.get('queryRewriteDocsPerSearch')),
			queryRewriteIncludeHistory: parseAccessCheckbox(formData, 'queryRewriteIncludeHistory'),
			queryRewriteHistoryLimit: optionalNumber(formData.get('queryRewriteHistoryLimit')),
			queryRewriteContext: optionalString(formData.get('queryRewriteContext')) ?? '',
			queryRewriteApiLanguage: optionalString(formData.get('queryRewriteApiLanguage')) ?? '',
			queryRewriteReasoningEffort:
				optionalString(formData.get('queryRewriteReasoningEffort')) ?? '',
			queryRewriteTextVerbosity: optionalString(formData.get('queryRewriteTextVerbosity')) ?? '',
			requireUserterms: parseAccessCheckbox(formData, 'requireUserterms'),
			usertermsDurationMonths: optionalNumber(formData.get('usertermsDurationMonths')),
			searchMode: optionalString(formData.get('searchMode')) ?? 'fulltext',
			searchResultLimit: optionalNumber(formData.get('searchResultLimit')),
			searchSnippetLength: optionalNumber(formData.get('searchSnippetLength')),
			searchMetaTags: searchMetaTagsFromForm(formData.get('searchMetaTags')),
			/*
			 * Echoed VERBATIM, not re-serialised from the parsed table.
			 *
			 * This shape is what a failed submit renders, and the line that caused the
			 * failure was rejected - so a canonical re-serialisation would drop exactly
			 * the line the admin has to look at to fix it.
			 */
			searchMetaLabels:
				typeof formData.get('searchMetaLabels') === 'string'
					? String(formData.get('searchMetaLabels'))
					: '',
			aiOverviewEnabled: parseAccessCheckbox(formData, 'aiOverviewEnabled'),
			aiOverviewModel: optionalString(formData.get('aiOverviewModel')) ?? '',
			aiOverviewSystemprompt: optionalString(formData.get('aiOverviewSystemprompt')) ?? '',
			aiOverviewContext: optionalString(formData.get('aiOverviewContext')) ?? '',
			aiOverviewDocuments: optionalNumber(formData.get('aiOverviewDocuments')),
			aiOverviewApiLanguage: optionalString(formData.get('aiOverviewApiLanguage')) ?? '',
			aiOverviewReasoningEffort: optionalString(formData.get('aiOverviewReasoningEffort')) ?? '',
			aiOverviewTextVerbosity: optionalString(formData.get('aiOverviewTextVerbosity')) ?? '',
			aiOverviewRequireUserterms: parseAccessCheckbox(formData, 'aiOverviewRequireUserterms'),
			aiOverviewUsertermsDurationMonths: optionalNumber(
				formData.get('aiOverviewUsertermsDurationMonths')
			),
			webviewIntroHtml:
				typeof formData.get('webviewIntroHtml') === 'string'
					? String(formData.get('webviewIntroHtml'))
					: '',
			webviewRequireUserterms: parseAccessCheckbox(formData, 'webviewRequireUserterms'),
			webviewUsertermsUrl: optionalString(formData.get('webviewUsertermsUrl')) ?? '',
			webviewUsertermsDurationMonths: optionalNumber(formData.get('webviewUsertermsDurationMonths'))
		},
		access: {
			activeSimplePage: parseAccessCheckbox(formData, 'activeSimplePage'),
			activeSinglePage: parseAccessCheckbox(formData, 'activeSinglePage'),
			activeParameterPage: parseAccessCheckbox(formData, 'activeParameterPage'),
			activeWebviewPage: parseAccessCheckbox(formData, 'activeWebviewPage'),
			activeEmbedApi: parseAccessCheckbox(formData, 'activeEmbedApi'),
			activeSearchApi: parseAccessCheckbox(formData, 'activeSearchApi'),
			embedAllowedHostRegex: parseEmbedAllowedHostRegex(formData) ?? ''
		}
	};
};

export const load: PageServerLoad = async ({ cookies, params, url }) => {
	const { repoUrl } = params;
	await requireAllowedRepository(cookies, url, repoUrl);

	const repository = await prisma.repository.findUnique({
		where: { url: repoUrl }
	});

	if (!repository) {
		return {
			repositoryExists: false,
			config: {
				repositoryName: deriveName(repoUrl),
				repositoryUrl: repoUrl,
				github: {
					repositoryPath: '',
					webhookPath: '',
					publicBaseUrl: DEFAULT_GITHUB2_BASE,
					hasSharedSecret: false
				},
				gitlab: {
					apiUrl: '',
					ref: '',
					hasPrivateToken: false,
					hasSharedSecret: false
				},
				llm: {
					hasOpenAiApiKey: false,
					hasEmbeddingApiKey: false,
					openAiApiBase: DEFAULT_CHAT_BASE,
					chatModel: DEFAULT_CHAT_MODEL,
					apiLanguage: 'chat/completions',
					reasoningEffort: 'none',
					textVerbosity: 'medium',
					// azureUrl: '',
					// azureModel: '',
					// azureApiVersion: '',
					embeddingBase: DEFAULT_EMBEDDING_BASE,
					embeddingModel: DEFAULT_EMBEDDING_MODEL
				},
				rag: {
					chunkSize: undefined,
					chunkOverlap: undefined,
					numberDocuments: 4,
					metaTags: [],
					systemprompt: '',
					queryRewriteEnabled: false,
					queryRewriteModel: '',
					queryRewriteCount: undefined,
					queryRewriteDocsPerSearch: undefined,
					queryRewriteIncludeHistory: false,
					queryRewriteHistoryLimit: undefined,
					queryRewriteContext: '',
					queryRewriteApiLanguage: '',
					queryRewriteReasoningEffort: '',
					queryRewriteTextVerbosity: '',
					requireUserterms: false,
					usertermsDurationMonths: undefined,
					searchMode: 'fulltext',
					searchResultLimit: undefined,
					searchSnippetLength: undefined,
					searchMetaTags: [],
					searchMetaLabels: '',
					aiOverviewEnabled: false,
					aiOverviewModel: '',
					aiOverviewSystemprompt: '',
					aiOverviewContext: '',
					aiOverviewDocuments: undefined,
					aiOverviewApiLanguage: '',
					aiOverviewReasoningEffort: '',
					aiOverviewTextVerbosity: '',
					// A new repository gets the safe default: consent required.
					aiOverviewRequireUserterms: true,
					aiOverviewUsertermsDurationMonths: undefined,
					webviewIntroHtml: '',
					webviewRequireUserterms: false,
					webviewUsertermsUrl: '',
					webviewUsertermsDurationMonths: undefined
				},
				access: {
					...defaultRepositoryAccess,
					embedAllowedHostRegex: ''
				}
			}
		};
	}

	return {
		repositoryExists: true,
		config: publicConfig(repository)
	};
};

export const actions: Actions = {
	saveConfig: async ({ cookies, request, params, url }) => {
		const { repoUrl } = params;
		await requireAllowedRepository(cookies, url, repoUrl);

		const formData = await request.formData();
		const existing = await prisma.repository.findUnique({
			where: { url: repoUrl },
			select: { updateConfig: true, LLM_API: true, ragConfig: true }
		});
		const existingUpdateConfig = asRecord(existing?.updateConfig);
		const existingLLM = asRecord(existing?.LLM_API);
		const existingRag = asRecord(existing?.ragConfig);
		const hadGithubSharedSecret = Boolean(
			stringValue(existingUpdateConfig.Github2EdTechRAG_SHARED_SECRET)
		);
		const hadGitlabSharedSecret = Boolean(
			stringValue(existingUpdateConfig.GitLab2EdTechRAG_SHARED_SECRET)
		);
		const hadGitlabPrivateToken = Boolean(stringValue(existingUpdateConfig['PRIVATE-TOKEN']));
		const hadOpenAiApiKey = Boolean(stringValue(existingLLM.OPENAI_API_KEY));
		const hadEmbeddingApiKey = Boolean(stringValue(existingLLM.OPENAI_API_KEY_EMBEDDING));

		const errors: string[] = [];
		const name = optionalString(formData.get('name')) ?? deriveName(repoUrl);
		const repositoryPath = optionalString(formData.get('repository_path')) ?? '';
		const sharedSecret = optionalString(formData.get('Github2EdTechRAG_SHARED_SECRET'));
		const openAiApiKey = optionalString(formData.get('OPENAI_API_KEY'));
		const embeddingApiKey = optionalString(formData.get('OPENAI_API_KEY_EMBEDDING'));

		const gitlabApiUrl = optionalString(formData.get('gitlab_api_url')) ?? '';
		const gitlabRef = optionalString(formData.get('ref')) ?? '';
		const gitlabPrivateToken = optionalString(formData.get('PRIVATE-TOKEN'));
		const gitlabSharedSecret = optionalString(formData.get('GitLab2EdTechRAG_SHARED_SECRET'));

		const publicBaseUrl =
			optionalString(formData.get('github2_public_base_url')) ?? DEFAULT_GITHUB2_BASE;
		const webhookPath = optionalString(formData.get('github2_webhook_path')) ?? '';
		const webhookUrl = webhookPath
			? `${publicBaseUrl.replace(/\/$/, '')}/webhook?path=${encodeURIComponent(webhookPath)}`
			: `${publicBaseUrl.replace(/\/$/, '')}/webhook`;
		const chatBase = optionalString(formData.get('OPENAI_API_BASE')) ?? DEFAULT_CHAT_BASE;
		const chatModel = optionalString(formData.get('CHAT_MODEL')) ?? DEFAULT_CHAT_MODEL;
		const apiLanguage = optionalString(formData.get('API_LANGUAGE')) ?? 'chat/completions';
		const embeddingBase =
			optionalString(formData.get('OPENAI_API_BASE_EMBEDDING')) ?? DEFAULT_EMBEDDING_BASE;
		const embeddingModel =
			optionalString(formData.get('EMBEDDING_MODEL')) ?? DEFAULT_EMBEDDING_MODEL;

		const chunkSize = optionalNumber(formData.get('chunkSize'));
		const chunkOverlap = optionalNumber(formData.get('chunkOverlap'));
		const numberDocuments = optionalNumber(formData.get('numberDocuments'));
		if (numberDocuments !== undefined && numberDocuments < 1) {
			errors.push('Number of documents must be at least 1.');
		}

		const queryRewriteEnabled = parseAccessCheckbox(formData, 'queryRewriteEnabled');
		const queryRewriteModel = optionalString(formData.get('queryRewriteModel'));
		const queryRewriteCount = optionalNumber(formData.get('queryRewriteCount'));
		const queryRewriteDocsPerSearch = optionalNumber(formData.get('queryRewriteDocsPerSearch'));
		const queryRewriteIncludeHistory = parseAccessCheckbox(formData, 'queryRewriteIncludeHistory');
		const queryRewriteHistoryLimit = optionalNumber(formData.get('queryRewriteHistoryLimit'));
		const queryRewriteContext = optionalString(formData.get('queryRewriteContext'));
		const queryRewriteApiLanguage = optionalString(formData.get('queryRewriteApiLanguage'));
		const queryRewriteReasoningEffort = optionalString(formData.get('queryRewriteReasoningEffort'));
		const queryRewriteTextVerbosity = optionalString(formData.get('queryRewriteTextVerbosity'));
		if (queryRewriteCount !== undefined && queryRewriteCount < 1) {
			errors.push('Number of query-rewrite searches must be at least 1.');
		}
		if (queryRewriteDocsPerSearch !== undefined && queryRewriteDocsPerSearch < 1) {
			errors.push('Documents per query-rewrite search must be at least 1.');
		}
		if (queryRewriteHistoryLimit !== undefined && queryRewriteHistoryLimit < 1) {
			errors.push('History messages for query rewrite must be at least 1.');
		}

		const requireUserterms = parseAccessCheckbox(formData, 'requireUserterms');
		const usertermsDurationMonths = optionalNumber(formData.get('usertermsDurationMonths'));
		if (
			usertermsDurationMonths !== undefined &&
			(usertermsDurationMonths < USERTERMS_MIN_MONTHS ||
				usertermsDurationMonths > USERTERMS_MAX_MONTHS)
		) {
			errors.push(
				`User-terms validity must be between ${USERTERMS_MIN_MONTHS} and ${USERTERMS_MAX_MONTHS} months.`
			);
		}

		/* -- Search results and the AI overview above them -- */
		// Anything other than 'vector' means the database-only path - the safe reading
		// of a missing or unknown value, because it spends no API calls.
		const searchMode = formData.get('searchMode') === 'vector' ? 'vector' : 'fulltext';
		const searchResultLimit = optionalNumber(formData.get('searchResultLimit'));
		const searchSnippetLength = optionalNumber(formData.get('searchSnippetLength'));
		if (searchResultLimit !== undefined && searchResultLimit < 1) {
			errors.push('Number of search results must be at least 1.');
		}
		// 40 characters is not a snippet, it is a fragment - and a snippet longer
		// than the chunk itself just pads the result list.
		if (searchSnippetLength !== undefined && searchSnippetLength < 40) {
			errors.push('Snippet length must be at least 40 characters.');
		}

		const searchMetaTags = searchMetaTagsFromForm(formData.get('searchMetaTags'));
		const searchMetaLabels = metaLabelsFromForm(formData.get('searchMetaLabels'), errors);
		/*
		 * A label for a key that is never emitted can never appear, so it is a typo
		 * rather than a preference. Only checkable against an explicit list - with '*'
		 * the key set is per document and not known here.
		 */
		if (!searchMetaTags.includes(META_TAGS_ALL)) {
			for (const key of Object.keys(searchMetaLabels)) {
				if (!searchMetaTags.includes(key)) {
					errors.push(
						`Meta label "${key}" is not in the search metadata tags, so it would never be shown.`
					);
				}
			}
		}

		const aiOverviewEnabled = parseAccessCheckbox(formData, 'aiOverviewEnabled');
		const aiOverviewModel = optionalString(formData.get('aiOverviewModel'));
		const aiOverviewSystemprompt = optionalString(formData.get('aiOverviewSystemprompt'));
		const aiOverviewContext = optionalString(formData.get('aiOverviewContext'));
		const aiOverviewDocuments = optionalNumber(formData.get('aiOverviewDocuments'));
		const aiOverviewApiLanguage = optionalString(formData.get('aiOverviewApiLanguage'));
		const aiOverviewReasoningEffort = optionalString(formData.get('aiOverviewReasoningEffort'));
		const aiOverviewTextVerbosity = optionalString(formData.get('aiOverviewTextVerbosity'));
		const aiOverviewRequireUserterms = parseAccessCheckbox(formData, 'aiOverviewRequireUserterms');
		const aiOverviewUsertermsDurationMonths = optionalNumber(
			formData.get('aiOverviewUsertermsDurationMonths')
		);
		if (aiOverviewDocuments !== undefined && aiOverviewDocuments < 1) {
			errors.push('Documents for the AI overview must be at least 1.');
		}
		if (
			aiOverviewUsertermsDurationMonths !== undefined &&
			(aiOverviewUsertermsDurationMonths < USERTERMS_MIN_MONTHS ||
				aiOverviewUsertermsDurationMonths > USERTERMS_MAX_MONTHS)
		) {
			errors.push(
				`AI-overview consent validity must be between ${USERTERMS_MIN_MONTHS} and ${USERTERMS_MAX_MONTHS} months.`
			);
		}

		/* -- Webview (the /webview full-page chat) -- */
		// The intro is raw HTML on purpose (external logos via <img>); only whitespace-only
		// input counts as empty, the string itself is stored as authored.
		const webviewIntroHtmlRaw = formData.get('webviewIntroHtml');
		const webviewIntroHtml =
			typeof webviewIntroHtmlRaw === 'string' && webviewIntroHtmlRaw.trim()
				? webviewIntroHtmlRaw
				: undefined;
		const webviewRequireUserterms = parseAccessCheckbox(formData, 'webviewRequireUserterms');
		const webviewUsertermsUrl = optionalString(formData.get('webviewUsertermsUrl'));
		const webviewUsertermsDurationMonths = optionalNumber(
			formData.get('webviewUsertermsDurationMonths')
		);
		if (webviewUsertermsUrl !== undefined) {
			try {
				const parsed = new URL(webviewUsertermsUrl);
				if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
					errors.push('Webview user-terms URL must be an http(s) URL.');
				}
			} catch {
				errors.push('Webview user-terms URL is not a valid URL.');
			}
		}
		// Unlike the embeds, the webview has no host page that could supply the terms
		// link - without a URL the consent panel would gate the chat on an unreadable
		// document.
		if (webviewRequireUserterms && !webviewUsertermsUrl) {
			errors.push('Webview user-terms URL is required when the webview requires accepted terms.');
		}
		if (
			webviewUsertermsDurationMonths !== undefined &&
			(webviewUsertermsDurationMonths < USERTERMS_MIN_MONTHS ||
				webviewUsertermsDurationMonths > USERTERMS_MAX_MONTHS)
		) {
			errors.push(
				`Webview consent validity must be between ${USERTERMS_MIN_MONTHS} and ${USERTERMS_MAX_MONTHS} months.`
			);
		}

		const nextAccess = {
			activeSimplePage: parseAccessCheckbox(formData, 'activeSimplePage'),
			activeSinglePage: parseAccessCheckbox(formData, 'activeSinglePage'),
			activeParameterPage: parseAccessCheckbox(formData, 'activeParameterPage'),
			activeWebviewPage: parseAccessCheckbox(formData, 'activeWebviewPage'),
			activeEmbedApi: parseAccessCheckbox(formData, 'activeEmbedApi'),
			activeSearchApi: parseAccessCheckbox(formData, 'activeSearchApi'),
			embedAllowedHostRegex: parseEmbedAllowedHostRegex(formData)
		};
		validateRepositoryAccess(nextAccess, errors);

		if (errors.length > 0) {
			return fail(400, {
				success: false,
				message: errors.join(' '),
				config: formState(
					repoUrl,
					formData,
					Boolean(sharedSecret) || hadGithubSharedSecret,
					Boolean(gitlabSharedSecret) || hadGitlabSharedSecret,
					Boolean(gitlabPrivateToken) || hadGitlabPrivateToken,
					Boolean(openAiApiKey) || hadOpenAiApiKey,
					Boolean(embeddingApiKey) || hadEmbeddingApiKey
				)
			});
		}

		const nextUpdateConfig: Record<string, unknown> = {
			...existingUpdateConfig,
			source: 'github',
			repository_path: repositoryPath,
			github2_webhook_path: webhookPath,
			github2_webhook_url: webhookUrl,
			github2_public_base_url: publicBaseUrl,
			gitlab_api_url: gitlabApiUrl,
			ref: gitlabRef
		};
		if (sharedSecret) {
			nextUpdateConfig.Github2EdTechRAG_SHARED_SECRET = sharedSecret;
		}
		if (gitlabSharedSecret) {
			nextUpdateConfig.GitLab2EdTechRAG_SHARED_SECRET = gitlabSharedSecret;
		}
		if (gitlabPrivateToken) {
			nextUpdateConfig['PRIVATE-TOKEN'] = gitlabPrivateToken;
		}

		const nextLLM: Record<string, unknown> = {
			...existingLLM,
			OPENAI_API_BASE: chatBase,
			CHAT_MODEL: chatModel,
			API_LANGUAGE: apiLanguage,
			reasoning_effort: optionalString(formData.get('reasoning_effort')) ?? 'none',
			text_verbosity: optionalString(formData.get('text_verbosity')) ?? 'medium',
			// AZURE_URL: optionalString(formData.get('AZURE_URL')) ?? '',
			// AZURE_MODEL: optionalString(formData.get('AZURE_MODEL')) ?? '',
			// AZURE_API_VERSION: optionalString(formData.get('AZURE_API_VERSION')) ?? '2024-02-01',
			OPENAI_API_BASE_EMBEDDING: embeddingBase,
			EMBEDDING_MODEL: embeddingModel
		};
		if (openAiApiKey) {
			nextLLM.OPENAI_API_KEY = openAiApiKey;
		}
		if (embeddingApiKey) {
			nextLLM.OPENAI_API_KEY_EMBEDDING = embeddingApiKey;
		}

		const nextRag: Record<string, unknown> = {
			...existingRag,
			systemprompt:
				typeof formData.get('systemprompt') === 'string'
					? String(formData.get('systemprompt'))
					: '',
			numberDocuments: numberDocuments ?? 4,
			metaTags: metaTagsFromForm(formData.get('metaTags')),
			queryRewriteEnabled,
			queryRewriteIncludeHistory,
			requireUserterms,
			searchMode,
			searchMetaTags,
			searchMetaLabels,
			aiOverviewEnabled,
			aiOverviewRequireUserterms,
			webviewRequireUserterms
		};
		if (usertermsDurationMonths !== undefined)
			nextRag.usertermsDurationMonths = usertermsDurationMonths;
		else delete nextRag.usertermsDurationMonths;
		if (chunkSize !== undefined) nextRag.chunkSize = chunkSize;
		else delete nextRag.chunkSize;
		if (chunkOverlap !== undefined) nextRag.chunkOverlap = chunkOverlap;
		else delete nextRag.chunkOverlap;
		if (queryRewriteModel !== undefined) nextRag.queryRewriteModel = queryRewriteModel;
		else delete nextRag.queryRewriteModel;
		if (queryRewriteCount !== undefined) nextRag.queryRewriteCount = queryRewriteCount;
		else delete nextRag.queryRewriteCount;
		if (queryRewriteDocsPerSearch !== undefined)
			nextRag.queryRewriteDocsPerSearch = queryRewriteDocsPerSearch;
		else delete nextRag.queryRewriteDocsPerSearch;
		if (queryRewriteHistoryLimit !== undefined)
			nextRag.queryRewriteHistoryLimit = queryRewriteHistoryLimit;
		else delete nextRag.queryRewriteHistoryLimit;
		if (queryRewriteContext !== undefined) nextRag.queryRewriteContext = queryRewriteContext;
		else delete nextRag.queryRewriteContext;
		if (queryRewriteApiLanguage !== undefined)
			nextRag.queryRewriteApiLanguage = queryRewriteApiLanguage;
		else delete nextRag.queryRewriteApiLanguage;
		if (queryRewriteReasoningEffort !== undefined)
			nextRag.queryRewriteReasoningEffort = queryRewriteReasoningEffort;
		else delete nextRag.queryRewriteReasoningEffort;
		if (queryRewriteTextVerbosity !== undefined)
			nextRag.queryRewriteTextVerbosity = queryRewriteTextVerbosity;
		else delete nextRag.queryRewriteTextVerbosity;
		/*
		 * Same "set or delete" as above, and for the same reason: an empty field must
		 * REMOVE the key, not store an empty string. getAiOverviewConfig falls back to
		 * the repo's chat setting when the key is absent - an empty string would be a
		 * value and would win over that fallback.
		 */
		if (searchResultLimit !== undefined) nextRag.searchResultLimit = searchResultLimit;
		else delete nextRag.searchResultLimit;
		if (searchSnippetLength !== undefined) nextRag.searchSnippetLength = searchSnippetLength;
		else delete nextRag.searchSnippetLength;
		if (aiOverviewModel !== undefined) nextRag.aiOverviewModel = aiOverviewModel;
		else delete nextRag.aiOverviewModel;
		if (aiOverviewSystemprompt !== undefined)
			nextRag.aiOverviewSystemprompt = aiOverviewSystemprompt;
		else delete nextRag.aiOverviewSystemprompt;
		if (aiOverviewContext !== undefined) nextRag.aiOverviewContext = aiOverviewContext;
		else delete nextRag.aiOverviewContext;
		if (aiOverviewDocuments !== undefined) nextRag.aiOverviewDocuments = aiOverviewDocuments;
		else delete nextRag.aiOverviewDocuments;
		if (aiOverviewApiLanguage !== undefined) nextRag.aiOverviewApiLanguage = aiOverviewApiLanguage;
		else delete nextRag.aiOverviewApiLanguage;
		if (aiOverviewReasoningEffort !== undefined)
			nextRag.aiOverviewReasoningEffort = aiOverviewReasoningEffort;
		else delete nextRag.aiOverviewReasoningEffort;
		if (aiOverviewTextVerbosity !== undefined)
			nextRag.aiOverviewTextVerbosity = aiOverviewTextVerbosity;
		else delete nextRag.aiOverviewTextVerbosity;
		if (aiOverviewUsertermsDurationMonths !== undefined)
			nextRag.aiOverviewUsertermsDurationMonths = aiOverviewUsertermsDurationMonths;
		else delete nextRag.aiOverviewUsertermsDurationMonths;
		if (webviewIntroHtml !== undefined) nextRag.webviewIntroHtml = webviewIntroHtml;
		else delete nextRag.webviewIntroHtml;
		if (webviewUsertermsUrl !== undefined) nextRag.webviewUsertermsUrl = webviewUsertermsUrl;
		else delete nextRag.webviewUsertermsUrl;
		if (webviewUsertermsDurationMonths !== undefined)
			nextRag.webviewUsertermsDurationMonths = webviewUsertermsDurationMonths;
		else delete nextRag.webviewUsertermsDurationMonths;

		try {
			await prisma.repository.upsert({
				where: { url: repoUrl },
				create: {
					url: repoUrl,
					name,
					updateConfig: nextUpdateConfig as Prisma.InputJsonValue,
					LLM_API: nextLLM as Prisma.InputJsonValue,
					ragConfig: nextRag as Prisma.InputJsonValue,
					...nextAccess
				},
				update: {
					name,
					updateConfig: nextUpdateConfig as Prisma.InputJsonValue,
					LLM_API: nextLLM as Prisma.InputJsonValue,
					ragConfig: nextRag as Prisma.InputJsonValue,
					...nextAccess
				}
			});

			return {
				success: true,
				configSaved: true,
				message: existing ? 'Repository config saved.' : 'Repository created.',
				repositoryExists: true,
				config: formState(
					repoUrl,
					formData,
					Boolean(sharedSecret) || hadGithubSharedSecret,
					Boolean(gitlabSharedSecret) || hadGitlabSharedSecret,
					Boolean(gitlabPrivateToken) || hadGitlabPrivateToken,
					Boolean(openAiApiKey) || hadOpenAiApiKey,
					Boolean(embeddingApiKey) || hadEmbeddingApiKey
				)
			};
		} catch (err) {
			console.error('Repository config save error', err);
			return fail(500, {
				success: false,
				message: 'Saving repository config failed. See server logs.',
				config: formState(
					repoUrl,
					formData,
					Boolean(sharedSecret) || hadGithubSharedSecret,
					Boolean(gitlabSharedSecret) || hadGitlabSharedSecret,
					Boolean(gitlabPrivateToken) || hadGitlabPrivateToken,
					Boolean(openAiApiKey) || hadOpenAiApiKey,
					Boolean(embeddingApiKey) || hadEmbeddingApiKey
				)
			});
		}
	},

	deleteRepository: async ({ cookies, params, url }) => {
		const { repoUrl } = params;
		const session = await requireAllowedRepository(cookies, url, repoUrl);

		if (!canManageUsers(session.role ?? SITE_ROLE.GUEST)) {
			return fail(403, {
				success: false,
				message: 'Manager access required to delete a repository.'
			});
		}

		try {
			await prisma.repository.delete({ where: { url: repoUrl } });
		} catch (err) {
			console.error('Delete repository error', err);
			return fail(500, { success: false, message: 'Delete failed. See server logs.' });
		}

		throw redirect(303, resolve('/admin/repositories'));
	}
};
