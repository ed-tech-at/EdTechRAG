import { error } from '@sveltejs/kit';

export type RepositoryAccess = {
	activeSimplePage: boolean;
	activeSinglePage: boolean;
	activeParameterPage: boolean;
	activeEmbedApi: boolean;
	embedAllowedHostRegex: string | null;
};

type PublicPage = 'simple' | 'single' | 'parameter';

const pageFlag: Record<PublicPage, keyof RepositoryAccess> = {
	simple: 'activeSimplePage',
	single: 'activeSinglePage',
	parameter: 'activeParameterPage'
};

export const defaultRepositoryAccess: RepositoryAccess = {
	activeSimplePage: false,
	activeSinglePage: false,
	activeParameterPage: false,
	activeEmbedApi: false,
	embedAllowedHostRegex: null
};

export const parseAccessCheckbox = (formData: FormData, name: string) => formData.get(name) === 'on';

export const parseEmbedAllowedHostRegex = (formData: FormData) => {
	const value = formData.get('embedAllowedHostRegex');
	return typeof value === 'string' && value.trim() ? value.trim() : null;
};

export const validateRepositoryAccess = (
	access: Pick<RepositoryAccess, 'activeEmbedApi' | 'embedAllowedHostRegex'>,
	errors: string[]
) => {
	if (!access.activeEmbedApi) return;

	if (!access.embedAllowedHostRegex) {
		errors.push('Allowed embed host regex is required when the embed API is active.');
		return;
	}

	try {
		new RegExp(access.embedAllowedHostRegex);
	} catch {
		errors.push('Allowed embed host regex is not a valid regular expression.');
	}
};

export const assertPublicPageActive = (repository: Partial<RepositoryAccess>, page: PublicPage) => {
	if (!repository[pageFlag[page]]) {
		throw error(403, 'This public repository view is not active.');
	}
};

export const embedCorsHeaders = (origin: string): Record<string, string> => ({
	'Access-Control-Allow-Origin': origin,
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	Vary: 'Origin'
});

const originHostname = (origin: string | null) => {
	if (!origin) return null;
	try {
		return new URL(origin).hostname;
	} catch {
		return null;
	}
};

export const getAllowedEmbedOrigin = (
	repository: Pick<RepositoryAccess, 'activeEmbedApi' | 'embedAllowedHostRegex'>,
	origin: string | null
) => {
	if (!repository.activeEmbedApi || !repository.embedAllowedHostRegex) return null;

	const hostname = originHostname(origin);
	if (!hostname) return null;

	try {
		return new RegExp(repository.embedAllowedHostRegex).test(hostname) ? origin : null;
	} catch {
		return null;
	}
};
