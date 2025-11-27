import OpenAI from 'openai';
import {
	OPENAI_API_KEY,
	OPENAI_API_BASE,
	CHAT_MODEL,
	AZURE_URL,
	AZURE_MODEL,
	AZURE_API_VERSION
} from '$env/static/private';

export function getChatClient() {
	const isAzure = Boolean(AZURE_URL);

	const client = new OpenAI({
		apiKey: OPENAI_API_KEY,
		baseURL:
			isAzure && AZURE_URL && AZURE_MODEL
				? `${AZURE_URL}/openai/deployments/${AZURE_MODEL}`
				: OPENAI_API_BASE,
		defaultQuery: isAzure ? { 'api-version': AZURE_API_VERSION || '2024-02-01' } : undefined,
		defaultHeaders: isAzure ? { 'api-key': OPENAI_API_KEY } : undefined
	});

	const model = isAzure && AZURE_MODEL ? AZURE_MODEL : CHAT_MODEL || 'gpt-4o-mini';

	return { client, model };
}
