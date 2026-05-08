import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Prisma } from '../../../../generated/prisma/client';
import prisma from '$lib/server/db';
import { findRepositoryContext } from '$lib/server/rag';
import { requireAllowedRepository } from '$lib/server/repository';
import { getNumberDocuments, parseRagConfig } from '$lib/ragContext';

const DEFAULT_CHAT_BASE = '';
const DEFAULT_EMBEDDING_BASE = '';
const DEFAULT_CHAT_MODEL = '';
const DEFAULT_EMBEDDING_MODEL = '';
const DEFAULT_GITHUB2_BASE = '';

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const stringValue = (value: unknown, fallback = '') =>
	typeof value === 'string' && value.trim() ? value.trim() : fallback;

const optionalString = (value: FormDataEntryValue | null) =>
	typeof value === 'string' && value.trim() ? value.trim() : undefined;

const requiredString = (
	formData: FormData,
	name: string,
	label: string,
	errors: string[]
) => {
	const value = optionalString(formData.get(name));
	if (!value) {
		errors.push(`${label} is required.`);
		return '';
	}
	return value;
};

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
			hasSharedSecret: Boolean(
				stringValue(updateConfig.Github2EdTechRAG_SHARED_SECRET) ||
					stringValue(updateConfig.GitLab2EdTechRAG_SHARED_SECRET)
			)
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
			systemprompt: rag?.systemprompt ?? ''
		}
	};
};

const formState = (
	repoUrl: string,
	formData: FormData,
	hasSharedSecret: boolean,
	hasOpenAiApiKey: boolean,
	hasEmbeddingApiKey: boolean
) => {
	const githubBase = optionalString(formData.get('github2_public_base_url')) ?? DEFAULT_GITHUB2_BASE;
	const webhookPath = optionalString(formData.get('github2_webhook_path')) ?? '';

	return {
		repositoryName: optionalString(formData.get('name')) ?? deriveName(repoUrl),
		repositoryUrl: repoUrl,
		github: {
			repositoryPath: optionalString(formData.get('repository_path')) ?? '',
			webhookPath,
			publicBaseUrl: githubBase,
			hasSharedSecret
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
			systemprompt: typeof formData.get('systemprompt') === 'string' ? String(formData.get('systemprompt')) : ''
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
					systemprompt: ''
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
		const hadSharedSecret = Boolean(
			stringValue(existingUpdateConfig.Github2EdTechRAG_SHARED_SECRET) ||
				stringValue(existingUpdateConfig.GitLab2EdTechRAG_SHARED_SECRET)
		);
		const hadOpenAiApiKey = Boolean(stringValue(existingLLM.OPENAI_API_KEY));
		const hadEmbeddingApiKey = Boolean(stringValue(existingLLM.OPENAI_API_KEY_EMBEDDING));

		const errors: string[] = [];
		const name = requiredString(formData, 'name', 'Repository name', errors);
		const repositoryPath = requiredString(formData, 'repository_path', 'GitHub repository path', errors);
		const sharedSecret = optionalString(formData.get('Github2EdTechRAG_SHARED_SECRET'));
		const openAiApiKey = optionalString(formData.get('OPENAI_API_KEY'));
		const embeddingApiKey = optionalString(formData.get('OPENAI_API_KEY_EMBEDDING'));

		if (!existing && !sharedSecret) {
			errors.push('EdTechRAG shared secret is required for new repositories.');
		}
		if (!existing && !openAiApiKey) {
			errors.push('LLM API key is required for new repositories.');
		}

		const publicBaseUrl = optionalString(formData.get('github2_public_base_url')) ?? DEFAULT_GITHUB2_BASE;
		const webhookPath = optionalString(formData.get('github2_webhook_path')) ?? '';
		const webhookUrl = webhookPath
			? `${publicBaseUrl.replace(/\/$/, '')}/webhook?path=${encodeURIComponent(webhookPath)}`
			: `${publicBaseUrl.replace(/\/$/, '')}/webhook`;
		const chatBase = requiredString(formData, 'OPENAI_API_BASE', 'Chat API base', errors);
		const chatModel = requiredString(formData, 'CHAT_MODEL', 'Chat model', errors);
		const apiLanguage = requiredString(formData, 'API_LANGUAGE', 'API language', errors);
		const embeddingBase = requiredString(
			formData,
			'OPENAI_API_BASE_EMBEDDING',
			'Embedding API base',
			errors
		);
		const embeddingModel = requiredString(formData, 'EMBEDDING_MODEL', 'Embedding model', errors);

		const chunkSize = optionalNumber(formData.get('chunkSize'));
		const chunkOverlap = optionalNumber(formData.get('chunkOverlap'));
		const numberDocuments = optionalNumber(formData.get('numberDocuments'));
		if (numberDocuments !== undefined && numberDocuments < 1) {
			errors.push('Number of documents must be at least 1.');
		}

		if (errors.length > 0) {
			return fail(400, {
				success: false,
				message: errors.join(' '),
				config: formState(
					repoUrl,
					formData,
					Boolean(sharedSecret) || hadSharedSecret,
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
			github2_public_base_url: publicBaseUrl
		};
		if (sharedSecret) {
			nextUpdateConfig.Github2EdTechRAG_SHARED_SECRET = sharedSecret;
			nextUpdateConfig.GitLab2EdTechRAG_SHARED_SECRET = sharedSecret;
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
				typeof formData.get('systemprompt') === 'string' ? String(formData.get('systemprompt')) : '',
			numberDocuments: numberDocuments ?? 4,
			metaTags: metaTagsFromForm(formData.get('metaTags'))
		};
		if (chunkSize !== undefined) nextRag.chunkSize = chunkSize;
		else delete nextRag.chunkSize;
		if (chunkOverlap !== undefined) nextRag.chunkOverlap = chunkOverlap;
		else delete nextRag.chunkOverlap;

		try {
			await prisma.repository.upsert({
				where: { url: repoUrl },
				create: {
					url: repoUrl,
					name,
					updateConfig: nextUpdateConfig as Prisma.InputJsonValue,
					LLM_API: nextLLM as Prisma.InputJsonValue,
					ragConfig: nextRag as Prisma.InputJsonValue
				},
				update: {
					name,
					updateConfig: nextUpdateConfig as Prisma.InputJsonValue,
					LLM_API: nextLLM as Prisma.InputJsonValue,
					ragConfig: nextRag as Prisma.InputJsonValue
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
					Boolean(sharedSecret) || hadSharedSecret,
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
					Boolean(sharedSecret) || hadSharedSecret,
					Boolean(openAiApiKey) || hadOpenAiApiKey,
					Boolean(embeddingApiKey) || hadEmbeddingApiKey
				)
			});
		}
	},
	search: async ({ cookies, request, params, url }) => {
		const { repoUrl } = params;
		await requireAllowedRepository(cookies, url, repoUrl);
		const formData = await request.formData();
		const query = formData.get('query');

		if (!query || typeof query !== 'string' || !query.trim()) {
			return fail(400, { success: false, message: 'Please enter a search query.' });
		}

		try {
			const repository = await prisma.repository.findUnique({
				where: { url: repoUrl },
				select: { ragConfig: true }
			});

			if (!repository) {
				return fail(404, { success: false, message: 'Create the repository before searching.' });
			}

			const ragConfig = parseRagConfig(repository.ragConfig);
			return await findRepositoryContext(repoUrl, query, getNumberDocuments(ragConfig));
		} catch (err) {
			console.error('Repository search error', err);
			return fail(500, { success: false, message: 'Search failed. See server logs.' });
		}
	}
};
