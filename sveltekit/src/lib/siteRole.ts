export const SITE_ROLE = {
	GUEST: 0,
	STUDENT: 1,
	STAFF: 3,
	MANAGER: 6,
	ADMIN: 7
} as const;

export type SiteRole = (typeof SITE_ROLE)[keyof typeof SITE_ROLE];

export const SITE_ROLE_LABEL: Record<SiteRole, string> = {
	[SITE_ROLE.GUEST]: 'Guest',
	[SITE_ROLE.STUDENT]: 'Student',
	[SITE_ROLE.STAFF]: 'Staff',
	[SITE_ROLE.MANAGER]: 'Manager',
	[SITE_ROLE.ADMIN]: 'Admin'
};

export const SITE_ROLE_OPTIONS = [
	{ value: SITE_ROLE.GUEST, label: SITE_ROLE_LABEL[SITE_ROLE.GUEST] },
	{ value: SITE_ROLE.STUDENT, label: SITE_ROLE_LABEL[SITE_ROLE.STUDENT] },
	{ value: SITE_ROLE.STAFF, label: SITE_ROLE_LABEL[SITE_ROLE.STAFF] },
	{ value: SITE_ROLE.MANAGER, label: SITE_ROLE_LABEL[SITE_ROLE.MANAGER] },
	{ value: SITE_ROLE.ADMIN, label: SITE_ROLE_LABEL[SITE_ROLE.ADMIN] }
] as const;

export function isSiteRole(value: number): value is SiteRole {
	return value in SITE_ROLE_LABEL;
}

export function canManageUsers(role: number | null | undefined): boolean {
	return typeof role === 'number' && role >= SITE_ROLE.MANAGER;
}
