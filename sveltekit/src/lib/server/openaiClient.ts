import OpenAI from 'openai';
import prisma from '$lib/server/db';

type LLMConfig = {
	apiKey: string;
	chatBase: string;
	chatModel: string;
	azureUrl?: string;
	azureModel?: string;
	azureApiVersion?: string;
	embeddingBase: string;
	embeddingModel: string;
};

const requireString = (value: unknown, key: string): string => {
	if (typeof value === 'string' && value.trim()) return value.trim();
	throw new Error(`Missing LLM config: ${key}`);
};

export async function loadRepoConfig(repoUrl: string): Promise<LLMConfig> {
	if (!repoUrl) throw new Error('repoUrl required for LLM config');

	const repo = await prisma.repository.findUnique({
		where: { url: repoUrl },
		select: { LLM_API: true }
	});

	if (!repo?.LLM_API) {
		throw new Error(`Missing LLM_API config for repository ${repoUrl}`);
	}

	const cfg = repo.LLM_API as Record<string, unknown>;

	const apiKey = requireString(cfg.OPENAI_API_KEY, 'OPENAI_API_KEY');
	const chatBase = requireString(cfg.OPENAI_API_BASE, 'OPENAI_API_BASE');
	const chatModel = requireString(cfg.CHAT_MODEL, 'CHAT_MODEL');
	const embeddingBase = requireString(cfg.OPENAI_API_BASE_EMBEDDING, 'OPENAI_API_BASE_EMBEDDING');
	const embeddingModel = requireString(cfg.EMBEDDING_MODEL, 'EMBEDDING_MODEL');

	const azureUrl = typeof cfg.AZURE_URL === 'string' && cfg.AZURE_URL.trim() ? cfg.AZURE_URL.trim() : undefined;
	const azureModel =
		typeof cfg.AZURE_MODEL === 'string' && cfg.AZURE_MODEL.trim() ? cfg.AZURE_MODEL.trim() : undefined;
	const azureApiVersion =
		typeof cfg.AZURE_API_VERSION === 'string' && cfg.AZURE_API_VERSION.trim()
			? cfg.AZURE_API_VERSION.trim()
			: undefined;

	return {
		apiKey,
		chatBase,
		chatModel,
		azureUrl,
		azureModel,
		azureApiVersion: azureApiVersion || '2024-02-01',
		embeddingBase,
		embeddingModel
	};
}

export async function getChatClient(repoUrl: string) {
	const cfg = await loadRepoConfig(repoUrl);
	const isAzure = Boolean(cfg.azureUrl && cfg.azureModel);

	const client = new OpenAI({
		apiKey: cfg.apiKey,
		baseURL: isAzure ? `${cfg.azureUrl}/openai/deployments/${cfg.azureModel}` : cfg.chatBase,
		defaultQuery: isAzure ? { 'api-version': cfg.azureApiVersion || '2024-02-01' } : undefined,
		defaultHeaders: isAzure ? { 'api-key': cfg.apiKey } : undefined
	});

	const model = isAzure ? cfg.azureModel! : cfg.chatModel;

	return { client, model };
}

export async function getEmbeddingConfig(repoUrl: string) {
	const cfg = await loadRepoConfig(repoUrl);
	return {
		apiKey: cfg.apiKey,
		embeddingBase: cfg.embeddingBase,
		embeddingModel: cfg.embeddingModel
	};
}
