import { error, type Cookies } from '@sveltejs/kit';
import { requireValidJwt, type SessionPayload } from '$lib/server/jwt';

export function getRepositoryAccessRegex(session: SessionPayload): RegExp | null {
	if (!session.allow_regex) return null;

	try {
		return new RegExp(session.allow_regex);
	} catch {
		return null;
	}
}

export function isRepositoryAllowed(
	session: SessionPayload,
	repositoryUrl: string | null | undefined
): boolean {
	if (!repositoryUrl) return false;

	const allowRegex = getRepositoryAccessRegex(session);
	if (!allowRegex) return false;

	return allowRegex.test(repositoryUrl);
}

export function filterAllowedRepositories<T>(
	session: SessionPayload,
	items: T[],
	getRepositoryUrl: (item: T) => string | null | undefined
): T[] {
	return items.filter((item) => isRepositoryAllowed(session, getRepositoryUrl(item)));
}

export async function requireAllowedRepository(
	cookies: Cookies,
	url: URL,
	repositoryUrl: string | null | undefined
): Promise<SessionPayload> {
	const session = await requireValidJwt(cookies, url);

	if (!isRepositoryAllowed(session, repositoryUrl)) {
		throw error(403, 'Repository access denied');
	}

	return session;
}
