import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { requireUserManager } from '$lib/server/jwt';
import { hashPasswordV2 } from '$lib/server/pw';
import { SITE_ROLE, SITE_ROLE_LABEL, SITE_ROLE_OPTIONS, isSiteRole } from '$lib/siteRole';
import { Prisma } from '../../../generated/prisma/client';

const optionalString = (value: FormDataEntryValue | null) =>
	typeof value === 'string' && value.trim() ? value.trim() : undefined;

const parseRole = (value: FormDataEntryValue | null) => {
	const role = Number(value);
	return Number.isInteger(role) && isSiteRole(role) ? role : undefined;
};

const readAllowRegex = (repositoryJson: unknown) => {
	if (!repositoryJson || typeof repositoryJson !== 'object' || Array.isArray(repositoryJson)) {
		return undefined;
	}

	const allowRegex = (repositoryJson as { allow_regex?: unknown }).allow_regex;
	return typeof allowRegex === 'string' && allowRegex.length > 0 ? allowRegex : undefined;
};

const buildRepositoryJson = (allowRegex: string | undefined) =>
	allowRegex ? { allow_regex: allowRegex } : Prisma.DbNull;

const validateAllowRegex = (allowRegex: string | undefined) => {
	if (!allowRegex) return undefined;
	try {
		return new RegExp(allowRegex);
	} catch {
		return undefined;
	}
};

const getRequestedAllowRegex = (formData: FormData) => {
	const allowRegex = optionalString(formData.get('allowRegex'));

	if (allowRegex && !validateAllowRegex(allowRegex)) {
		return { error: 'Repository access regex is invalid.', allowRegex };
	}

	return { allowRegex };
};

const canManageAdminUsers = (role: number | undefined) => role === SITE_ROLE.ADMIN;

const canEditTargetRole = (actorRole: number | undefined, targetRole: number) =>
	canManageAdminUsers(actorRole) || targetRole !== SITE_ROLE.ADMIN;

const canAssignRole = (actorRole: number | undefined, targetRole: number) =>
	canManageAdminUsers(actorRole) || targetRole !== SITE_ROLE.ADMIN;

export const load: PageServerLoad = async ({ cookies, url }) => {
	const session = await requireUserManager(cookies, url);
	const roleOptions = canManageAdminUsers(session.role)
		? SITE_ROLE_OPTIONS
		: SITE_ROLE_OPTIONS.filter((role) => role.value !== SITE_ROLE.ADMIN);

	const [users, repositories] = await Promise.all([
		prisma.user.findMany({
			orderBy: [{ isDeleted: 'asc' }, { email: 'asc' }],
			select: {
				id: true,
				email: true,
				role: true,
				repositoryJson: true,
				isDeleted: true,
				createdAt: true
			}
		}),
		prisma.repository.findMany({
			orderBy: { id: 'desc' },
			select: { url: true, name: true }
		})
	]);

	const usersWithAccess = users.map((user) => {
		const allowRegex = readAllowRegex(user.repositoryJson);
		const regex = validateAllowRegex(allowRegex);
		const includedRepositories = regex
			? repositories.filter((repository) => regex.test(repository.url)).map((repository) => repository.url)
			: [];
		const includedSet = new Set(includedRepositories);

		return {
			...user,
			roleLabel: SITE_ROLE_LABEL[(isSiteRole(user.role) ? user.role : SITE_ROLE.GUEST)],
			canEdit: canEditTargetRole(session.role, user.role),
			allowRegex: allowRegex ?? '',
			hasInvalidAllowRegex: Boolean(allowRegex && !regex),
			includedRepositories,
			excludedRepositories: repositories
				.filter((repository) => !includedSet.has(repository.url))
				.map((repository) => repository.url),
			accessSummary:
				includedRepositories.length === 0
					? 'No repositories'
					: `${includedRepositories.length} of ${repositories.length} repositories`
		};
	});

	return {
		users: usersWithAccess,
		repositories,
		roleOptions
	};
};

export const actions: Actions = {
	createUser: async ({ cookies, request, url }) => {
		const session = await requireUserManager(cookies, url);
		const formData = await request.formData();
		const email = optionalString(formData.get('email'))?.toLowerCase();
		const password = optionalString(formData.get('password'));
		const role = parseRole(formData.get('role')) ?? SITE_ROLE.STAFF;
		const access = getRequestedAllowRegex(formData);

		if (!email || !password) {
			return fail(400, { createMessage: 'Email and password are required.', email });
		}

		if (!canAssignRole(session.role, role)) {
			return fail(403, { createMessage: 'Managers cannot create admin users.', email });
		}

		if ('error' in access) {
			return fail(400, { createMessage: access.error, email, allowRegex: access.allowRegex });
		}

		const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
		if (existing) {
			return fail(409, { createMessage: 'A user with this email already exists.', email });
		}

		const userId = crypto.randomUUID();
		const hashedPassword = await hashPasswordV2(password, userId);
		await prisma.user.create({
			data: {
				id: userId,
				email,
				role,
				repositoryJson: buildRepositoryJson(access.allowRegex),
				password: hashedPassword,
				cryptVersion: 2
			}
		});

		throw redirect(303, url.pathname);
	},

	updateUser: async ({ cookies, request, url }) => {
		const session = await requireUserManager(cookies, url);
		const formData = await request.formData();
		const userId = optionalString(formData.get('userId'));
		const role = parseRole(formData.get('role'));
		const access = getRequestedAllowRegex(formData);

		if (!userId || role === undefined) {
			return fail(400, { updateMessage: 'User and role are required.', userId });
		}

		if ('error' in access) {
			return fail(400, { updateMessage: access.error, userId, allowRegex: access.allowRegex });
		}

		const targetUser = await prisma.user.findUnique({
			where: { id: userId },
			select: { role: true }
		});

		if (!targetUser) {
			return fail(404, { updateMessage: 'User not found.', userId });
		}

		if (!canEditTargetRole(session.role, targetUser.role)) {
			return fail(403, { updateMessage: 'Managers cannot change admin users.', userId });
		}

		if (!canAssignRole(session.role, role)) {
			return fail(403, { updateMessage: 'Managers cannot assign the admin role.', userId });
		}

		await prisma.user.update({
			where: { id: userId },
			data: {
				role,
				repositoryJson: buildRepositoryJson(access.allowRegex)
			}
		});

		throw redirect(303, url.pathname);
	},

	changePassword: async ({ cookies, request, url }) => {
		const session = await requireUserManager(cookies, url);
		const formData = await request.formData();
		const userId = optionalString(formData.get('userId'));
		const password = optionalString(formData.get('password'));

		if (!userId || !password) {
			return fail(400, { passwordMessage: 'User and new password are required.', userId });
		}

		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, role: true }
		});

		if (!user) {
			return fail(404, { passwordMessage: 'User not found.', userId });
		}

		if (!canEditTargetRole(session.role, user.role)) {
			return fail(403, { passwordMessage: 'Managers cannot change admin users.', userId });
		}

		const hashedPassword = await hashPasswordV2(password, user.id);
		await prisma.user.update({
			where: { id: user.id },
			data: {
				password: hashedPassword,
				cryptVersion: 2
			}
		});

		throw redirect(303, url.pathname);
	},

	toggleDeleted: async ({ cookies, request, url }) => {
		const session = await requireUserManager(cookies, url);
		const formData = await request.formData();
		const userId = optionalString(formData.get('userId'));
		const isDeleted = Number(formData.get('isDeleted'));

		if (!userId || (isDeleted !== 0 && isDeleted !== 1)) {
			return fail(400, { updateMessage: 'User and status are required.', userId });
		}

		const targetUser = await prisma.user.findUnique({
			where: { id: userId },
			select: { role: true }
		});

		if (!targetUser) {
			return fail(404, { updateMessage: 'User not found.', userId });
		}

		if (!canEditTargetRole(session.role, targetUser.role)) {
			return fail(403, { updateMessage: 'Managers cannot change admin users.', userId });
		}

		await prisma.user.update({
			where: { id: userId },
			data: { isDeleted }
		});

		throw redirect(303, url.pathname);
	}
};
