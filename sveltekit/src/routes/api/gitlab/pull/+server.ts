import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import type { Prisma } from '../../../../generated/prisma/client';
import {
	logGitLabApiRequest,
	normalizeString,
	parseGitLabApiRequest
} from '$lib/server/gitlabApi';

type IncomingFile = {
	path?: string;
	remoteUrl?: string;
	meta?: Record<string, unknown>;
};

type MovedEntry = { from: string; to: string };

const toStringArray = (value: unknown) =>
	Array.isArray(value)
		? value
				.map((entry) => normalizeString(entry))
				.filter((entry): entry is string => Boolean(entry))
		: [];

const toMovedArray = (value: unknown) =>
	Array.isArray(value)
		? value
				.map((entry) => {
					if (!entry || typeof entry !== 'object') return null;
					const data = entry as Record<string, unknown>;
					const from = normalizeString(data.from);
					const to = normalizeString(data.to);
					if (!from || !to) return null;
					return { from, to } satisfies MovedEntry;
				})
				.filter((entry): entry is MovedEntry => Boolean(entry))
		: [];

const unique = (values: string[]) => Array.from(new Set(values));

const uniqueMoved = (entries: MovedEntry[]) => {
	const seen = new Set<string>();
	return entries.filter((entry) => {
		const key = `${entry.from}→${entry.to}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const emptyParsedChanges = () => ({
	added: [] as string[],
	modified: [] as string[],
	deleted: [] as string[],
	moved: [] as MovedEntry[]
});

const parseRawChangesZ = (value: string) => {
	const result = emptyParsedChanges();
	const fields = value.split('\0').filter(Boolean);

	for (let i = 0; i < fields.length; ) {
		const statusRaw = fields[i++];
		const status = statusRaw?.[0];
		if (!status || i >= fields.length) continue;

		if (status === 'R') {
			const from = normalizeString(fields[i]);
			const to = normalizeString(fields[i + 1]);
			i += 2;
			if (from && to) {
				result.moved.push({ from, to });
			}
			continue;
		}

		if (status === 'C') {
			const to = normalizeString(fields[i + 1] ?? fields[i]);
			i += 2;
			if (to) result.added.push(to);
			continue;
		}

		const path = normalizeString(fields[i]);
		i += 1;
		if (!path) continue;

		switch (status) {
			case 'A':
				result.added.push(path);
				break;
			case 'M':
			case 'T':
				result.modified.push(path);
				break;
			case 'D':
				result.deleted.push(path);
				break;
			default:
				break;
		}
	}

	return result;
};

const parseRawChanges = (value: unknown) => {
	const result = emptyParsedChanges();

	if (typeof value !== 'string' || !value.trim()) {
		return result;
	}

	if (value.includes('\0')) {
		return parseRawChangesZ(value);
	}

	const lines = value.split('\n');
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const parts = trimmed.split('\t');
		if (parts.length < 2) continue;

		const statusRaw = parts[0];
		const status = statusRaw?.[0];
		if (!status) continue;

		if (status === 'R') {
			const from = normalizeString(parts[1]);
			const to = normalizeString(parts[2]);
			if (from && to) {
				result.moved.push({ from, to });
			}
			continue;
		}

		if (status === 'C') {
			const to = normalizeString(parts[2] ?? parts[1]);
			if (to) result.added.push(to);
			continue;
		}

		const path = normalizeString(parts[1]);
		if (!path) continue;

		switch (status) {
			case 'A':
				result.added.push(path);
				break;
			case 'M':
			case 'T':
				result.modified.push(path);
				break;
			case 'D':
				result.deleted.push(path);
				break;
			default:
				break;
		}
	}

	return result;
};

const mergeMeta = (
	existing: unknown,
	updates: Record<string, unknown>,
	extra?: Record<string, unknown>
) => {
	const base =
		existing && typeof existing === 'object' && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
	return {
		...base,
		...extra,
		...updates
	};
};

const pathFromReference = (value: string) => {
	try {
		const parsed = new URL(value);
		const queryPath = normalizeString(parsed.searchParams.get('path'));
		if (queryPath) return queryPath;

		return decodeURIComponent(parsed.pathname);
	} catch {
		return null;
	}
};

const normalizePathForMatch = (value: string) => value.replace(/\\/g, '/').replace(/^\/+/, '');

const regexMatches = (regex: RegExp, value: string) => {
	regex.lastIndex = 0;
	return regex.test(value);
};

export const POST: RequestHandler = async ({ request }) => {
	let repositoryUrl: string | null = null;
	const parsed = await parseGitLabApiRequest(request);
	if (!parsed.ok) {
		await logGitLabApiRequest(request, '/api/gitlab/pull/', parsed.repositoryUrl, {
			status: parsed.status,
			success: false,
			error: parsed.message
		});
		return json({ success: false, message: parsed.message }, { status: parsed.status });
	}

	const { body } = parsed;
	repositoryUrl = parsed.repositoryUrl;
	const updateConfig = asRecord(parsed.repository.updateConfig);
	const excludePathRegexPattern =
		normalizeString(updateConfig.exclude_path_regex) ??
		normalizeString(updateConfig.excludePathRegex);
	let excludePathRegex: RegExp | null = null;
	if (excludePathRegexPattern) {
		try {
			excludePathRegex = new RegExp(excludePathRegexPattern);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Invalid regular expression.';
			await logGitLabApiRequest(request, '/api/gitlab/pull/', repositoryUrl, {
				status: 400,
				success: false,
				error: `Invalid exclude path regex: ${message}`
			});
			return json(
				{ success: false, message: `Invalid exclude path regex: ${message}` },
				{ status: 400 }
			);
		}
	}

	const files = Array.isArray(body.files) ? (body.files as IncomingFile[]) : [];
	const fileMeta = new Map<string, Record<string, unknown>>();
	const repoPathByReference = new Map<string, string>();
	for (const file of files) {
		const path = normalizeString(file.remoteUrl) ?? normalizeString(file.path);
		if (!path) continue;
		const meta = asRecord(file.meta);
		const repoPath =
			normalizeString(meta.path) ??
			normalizeString(file.path) ??
			pathFromReference(path) ??
			path;
		repoPathByReference.set(path, repoPath);
		if (file.path) {
			repoPathByReference.set(file.path, repoPath);
		}
		if (file.meta && typeof file.meta === 'object' && !Array.isArray(file.meta)) {
			fileMeta.set(path, file.meta as Record<string, unknown>);
		}
	}

	const changeSet =
		body.changes && typeof body.changes === 'object'
			? (body.changes as Record<string, unknown>)
			: {};
	const rawChanges = parseRawChanges(changeSet.raw);
	const addedPaths = unique([...toStringArray(changeSet.added), ...rawChanges.added]);
	const modifiedPaths = unique([...toStringArray(changeSet.modified), ...rawChanges.modified]);
	const deletedPaths = unique([...toStringArray(changeSet.deleted), ...rawChanges.deleted]);
	const movedEntries = uniqueMoved([...toMovedArray(changeSet.moved), ...rawChanges.moved]);

	const shouldExcludePath = (path: string) => {
		if (!excludePathRegex) return false;

		const repoPath = repoPathByReference.get(path) ?? pathFromReference(path) ?? path;
		const normalized = normalizePathForMatch(repoPath);
		const filename = normalized.split('/').filter(Boolean).pop() ?? normalized;
		const candidates = [repoPath, normalized, `/${normalized}`, filename];

		return candidates.some((candidate) => regexMatches(excludePathRegex, candidate));
	};

	const excludedPaths: string[] = [];
	const filteredAddedPaths = addedPaths.filter((path) => {
		if (!shouldExcludePath(path)) return true;
		excludedPaths.push(path);
		return false;
	});
	const filteredModifiedPaths = modifiedPaths.filter((path) => {
		if (!shouldExcludePath(path)) return true;
		excludedPaths.push(path);
		return false;
	});
	const movedToExcluded = movedEntries.filter((entry) => shouldExcludePath(entry.to));
	const filteredMovedEntries = movedEntries.filter((entry) => !shouldExcludePath(entry.to));
	excludedPaths.push(...movedToExcluded.map((entry) => entry.to));
	const excludedInvalidationPaths = unique([
		...excludedPaths,
		...movedToExcluded.map((entry) => entry.from)
	]);

	if (
		filteredAddedPaths.length === 0 &&
		filteredModifiedPaths.length === 0 &&
		deletedPaths.length === 0 &&
		filteredMovedEntries.length === 0 &&
		excludedInvalidationPaths.length === 0
	) {
		await logGitLabApiRequest(request, '/api/gitlab/pull/', repositoryUrl, {
			status: 400,
			success: false,
			error: 'No changes provided'
		});
		return json({ success: false, message: 'No changes provided.' }, { status: 400 });
	}

	const headSha = normalizeString(body.head_sha);
	const baseSha = normalizeString(body.base_sha);

	const errors: string[] = [];
	let added = 0;
	let modified = 0;
	let deleted = 0;
	let moved = 0;
	let excluded = 0;

	const fetchFile = (path: string) =>
		prisma.dataFile.findFirst({
			where: { repositoryUrl, remoteUrl: path },
			select: { id: true, meta: true }
		});

	const markVectorsInvalidated = async (dataFileId: number) => {
		await prisma.$executeRaw`UPDATE "rag_vectors"."vector1536" SET "invalidatedAt" = NOW() WHERE "dataFileId" = ${dataFileId}`;
	};

	const buildMeta = (status: string, extra?: Record<string, unknown>) => {
		const base: Record<string, unknown> = {
			source: 'gitlab',
			status
		};

		if (headSha) base.headSha = headSha;
		if (baseSha) base.baseSha = baseSha;

		return {
			...base,
			...(extra ?? {})
		};
	};

	const ensureFile = async (path: string, status: string, extraMeta?: Record<string, unknown>) => {
		const existing = await fetchFile(path);
		const mergedMeta = mergeMeta(
			existing?.meta,
			buildMeta(status, { path }),
			{
				...(fileMeta.get(path) ?? {}),
				...(extraMeta ?? {})
			}
		);

		if (existing) {
			await prisma.dataFile.update({
				where: { id: existing.id },
				data: {
					meta: mergedMeta as Prisma.InputJsonValue,
					chunkedAt: null,
					invalidatedAt: null
				}
			});
			return existing.id;
		}

		const created = await prisma.dataFile.create({
			data: {
				repositoryUrl,
				remoteUrl: path,
				meta: mergedMeta as Prisma.InputJsonValue,
				chunkedAt: null,
				invalidatedAt: null
			},
			select: { id: true }
		});
		return created.id;
	};

	const handleModification = async (path: string) => {
		const dataFile = await fetchFile(path);
		if (!dataFile) {
			await ensureFile(path, 'modified');
			return;
		}

		const mergedMeta = mergeMeta(
			dataFile.meta,
			buildMeta('modified', { path }),
			fileMeta.get(path)
		);

		await prisma.dataFile.update({
			where: { id: dataFile.id },
			data: {
				meta: mergedMeta as Prisma.InputJsonValue,
				chunkedAt: null
			}
		});

		await markVectorsInvalidated(dataFile.id);
	};

	const handleDeletion = async (path: string, status: string, track = true) => {
		const dataFile = await fetchFile(path);
		if (!dataFile) return;

		const mergedMeta = mergeMeta(
			dataFile.meta,
			buildMeta(status, { path }),
			fileMeta.get(path)
		);

		await markVectorsInvalidated(dataFile.id);
		await prisma.dataFile.update({
			where: { id: dataFile.id },
			data: {
				invalidatedAt: new Date(),
				meta: mergedMeta as Prisma.InputJsonValue
			}
		});

		if (track) {
			deleted += 1;
		}
	};

	for (const path of excludedInvalidationPaths) {
		try {
			await handleDeletion(path, 'excluded', false);
			excluded += 1;
		} catch (err) {
			console.error('GitLab exclude handling error', err);
			const reason = err instanceof Error ? err.message : 'Unknown error';
			errors.push(`Failed to exclude ${path}: ${reason}`);
		}
	}

	for (const path of filteredAddedPaths) {
		try {
			await ensureFile(path, 'added');
			added += 1;
		} catch (err) {
			console.error('GitLab add handling error', err);
			const reason = err instanceof Error ? err.message : 'Unknown error';
			errors.push(`Failed to add ${path}: ${reason}`);
		}
	}

	for (const path of filteredModifiedPaths) {
		try {
			await handleModification(path);
			modified += 1;
		} catch (err) {
			console.error('GitLab modify handling error', err);
			const reason = err instanceof Error ? err.message : 'Unknown error';
			errors.push(`Failed to mark ${path} as modified: ${reason}`);
		}
	}

	for (const path of deletedPaths) {
		try {
			await handleDeletion(path, 'deleted', true);
		} catch (err) {
			console.error('GitLab delete handling error', err);
			const reason = err instanceof Error ? err.message : 'Unknown error';
			errors.push(`Failed to delete ${path}: ${reason}`);
		}
	}

	for (const entry of filteredMovedEntries) {
		try {
			await handleDeletion(entry.from, 'moved-from', false);
			await ensureFile(entry.to, 'moved', { movedFrom: entry.from });
			moved += 1;
		} catch (err) {
			console.error('GitLab move handling error', err);
			const reason = err instanceof Error ? err.message : 'Unknown error';
			errors.push(`Failed to move ${entry.from} → ${entry.to}: ${reason}`);
		}
	}

	const responseBody = {
		success: errors.length === 0,
		added,
		modified,
		deleted,
		moved,
		excluded,
		errors
	};

	await logGitLabApiRequest(request, '/api/gitlab/pull/', repositoryUrl, {
		status: 200,
		success: responseBody.success,
		headSha,
		baseSha,
		added,
		modified,
		deleted,
		moved,
		excluded,
		errors
	});

	return json(responseBody);
};
