import { error } from '@sveltejs/kit';

export type RepositoryAccess = {
	activeSimplePage: boolean;
	activeSinglePage: boolean;
	activeParameterPage: boolean;
	/** The /webview full-page chat - end-user UI with its own consent gate. */
	activeWebviewPage: boolean;
	activeEmbedApi: boolean;
	/**
	 * The search embed (static/embed/search). Separate from activeEmbedApi, because
	 * a site may want the search without the chatbot or the other way round. The
	 * origin gate (embedAllowedHostRegex) stays shared: it answers a different
	 * question - WHERE may call us, not WHAT may be called.
	 */
	activeSearchApi: boolean;
	embedAllowedHostRegex: string | null;
};

type PublicPage = 'simple' | 'single' | 'parameter' | 'webview';

const pageFlag: Record<PublicPage, keyof RepositoryAccess> = {
	simple: 'activeSimplePage',
	single: 'activeSinglePage',
	parameter: 'activeParameterPage',
	webview: 'activeWebviewPage'
};

export const defaultRepositoryAccess: RepositoryAccess = {
	activeSimplePage: false,
	activeSinglePage: false,
	activeParameterPage: false,
	activeWebviewPage: false,
	activeEmbedApi: false,
	activeSearchApi: false,
	embedAllowedHostRegex: null
};

export const parseAccessCheckbox = (formData: FormData, name: string) => formData.get(name) === 'on';

export const parseEmbedAllowedHostRegex = (formData: FormData) => {
	const value = formData.get('embedAllowedHostRegex');
	return typeof value === 'string' && value.trim() ? value.trim() : null;
};

export const validateRepositoryAccess = (
	access: Pick<RepositoryAccess, 'activeEmbedApi' | 'activeSearchApi' | 'embedAllowedHostRegex'>,
	errors: string[]
) => {
	// Both cross-origin APIs need the gate: without it getAllowedEmbedOrigin
	// returns null for every request, so the feature would be switched on and
	// answer 403 to everyone.
	if (!access.activeEmbedApi && !access.activeSearchApi) return;

	if (!access.embedAllowedHostRegex) {
		errors.push('Allowed embed host regex is required when the embed or search API is active.');
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

/**
 * Is this origin allowed to call an API that is switched on by `active`?
 *
 * Two things have to be true, and both are per repository: the API is active, and
 * the calling host matches the regex. A broken regex means "not allowed" - never
 * "allow everything", which is what a thrown error would have amounted to.
 */
const allowedOrigin = (active: boolean, hostRegex: string | null, origin: string | null) => {
	if (!active || !hostRegex) return null;

	const hostname = originHostname(origin);
	if (!hostname) return null;

	try {
		return new RegExp(hostRegex).test(hostname) ? origin : null;
	} catch {
		return null;
	}
};

export const getAllowedEmbedOrigin = (
	repository: Pick<RepositoryAccess, 'activeEmbedApi' | 'embedAllowedHostRegex'>,
	origin: string | null
) => allowedOrigin(repository.activeEmbedApi, repository.embedAllowedHostRegex, origin);

/** Same gate, own switch - see activeSearchApi at the top of this file. */
export const getAllowedSearchOrigin = (
	repository: Pick<RepositoryAccess, 'activeSearchApi' | 'embedAllowedHostRegex'>,
	origin: string | null
) => allowedOrigin(repository.activeSearchApi, repository.embedAllowedHostRegex, origin);
