import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { Actions, PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { requireValidJwt } from '$lib/server/jwt';
import { filterAllowedRepositories, isRepositoryAllowed } from '$lib/server/repository';

const optionalString = (value: FormDataEntryValue | null) =>
	typeof value === 'string' && value.trim() ? value.trim() : undefined;

const deriveName = (repoUrl: string) => {
	const cleaned = repoUrl.replace(/\/$/, '');
	const last = cleaned.split('/').filter(Boolean).pop();
	return last || repoUrl;
};

export const load: PageServerLoad = async ({ cookies, url }) => {
	const session = await requireValidJwt(cookies, url);
	const repos = await prisma.repository.findMany({
		include: {
			_count: { select: { dataFiles: true } },
			// dataFiles: {
				// select: {
					// _count: { select: { dataChunks: true } }
				// }
			// }
		},
		orderBy: { name: 'asc' }
	});
	const allowedRepos = filterAllowedRepositories(session, repos, (repo) => repo.url);

	const repositories = allowedRepos.map((repo) => {
		// const chunkCount = repo.dataFiles.reduce((sum, file) => sum + (file._count?.dataChunks ?? 0), 0);
		return {
			url: repo.url,
			name: repo.name,
			fileCount: repo._count?.dataFiles ?? 0,
			// chunkCount
		};
	});

	return { repositories };
};

export const actions: Actions = {
	createRepository: async ({ cookies, request, url }) => {
		const session = await requireValidJwt(cookies, url);
		const formData = await request.formData();
		const repositoryUrl = optionalString(formData.get('repositoryUrl'));

		if (!repositoryUrl) {
			return fail(400, {
				success: false,
				message: 'Repository URL is required.'
			});
		}

		if (!isRepositoryAllowed(session, repositoryUrl)) {
			return fail(403, {
				success: false,
				message: 'Repository access denied for this URL.',
				repositoryUrl
			});
		}

		const existing = await prisma.repository.findUnique({
			where: { url: repositoryUrl },
			select: { url: true }
		});

		if (existing) {
			return fail(409, {
				success: false,
				message: 'Repository already exists.',
				repositoryUrl
			});
		}

		await prisma.repository.create({
			data: {
				url: repositoryUrl,
				name: deriveName(repositoryUrl),
				updateConfig: {},
				LLM_API: {},
				ragConfig: {
					numberDocuments: 4,
					metaTags: [],
					systemprompt: ''
				},
				activeSimplePage: false,
				activeSinglePage: false,
				activeParameterPage: false,
				activeEmbedApi: false,
				embedAllowedHostRegex: null
			}
		});

		throw redirect(303, resolve(`/admin/repositories/${encodeURIComponent(repositoryUrl)}`));
	}
};
