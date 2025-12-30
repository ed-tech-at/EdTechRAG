import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/server/db';
import { createHmac, timingSafeEqual } from 'node:crypto';

type IncomingFile = {
	path?: string;
	remoteUrl?: string;
	meta?: Record<string, unknown>;
};

type MovedEntry = { from: string; to: string };

const normalizeString = (value: unknown) =>
	typeof value === 'string' && value.trim() ? value.trim() : null;

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

const parseRawChanges = (value: unknown) => {
	const result = {
		added: [] as string[],
		modified: [] as string[],
		deleted: [] as string[],
		moved: [] as MovedEntry[]
	};

	if (typeof value !== 'string' || !value.trim()) {
		return result;
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

const getSignatureSecret = (value: unknown) => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const config = value as Record<string, unknown>;
	return normalizeString(config.GitLab2EdTechRAG_SHARED_SECRET);
};

const isSignatureValid = (provided: string | null, secret: string, rawBody: string) => {
	if (!provided) return false;
	const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
	const providedBuffer = Buffer.from(provided, 'utf8');
	const expectedBuffer = Buffer.from(expected, 'utf8');
	if (providedBuffer.length !== expectedBuffer.length) return false;
	return timingSafeEqual(providedBuffer, expectedBuffer);
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

export const POST: RequestHandler = async ({ request }) => {
	let payload: unknown;
	let repositoryUrl: string | null = null;
	let rawBody = '';

	try {
		rawBody = await request.text();
		payload = rawBody ? JSON.parse(rawBody) : null;
	} catch {
		await logRequest(request, repositoryUrl, {
			status: 400,
			success: false,
			error: 'Invalid JSON payload'
		});
		return json({ success: false, message: 'Invalid JSON payload.' }, { status: 400 });
	}

	// console.log(payload);

	if (!payload || typeof payload !== 'object') {
		await logRequest(request, repositoryUrl, {
			status: 400,
			success: false,
			error: 'Payload must be an object'
		});
		return json({ success: false, message: 'Payload must be an object.' }, { status: 400 });
	}

	const body = payload as Record<string, unknown>;
	const repositoryPath = normalizeString(body.repository_path);

	if (!repositoryPath) {
		await logRequest(request, repositoryPath, {
			status: 400,
			success: false,
			error: 'Missing repository URL/path'
		});
		return json({ success: false, message: 'Missing repository URL/path.' }, { status: 400 });
	}

	// const repository = await prisma.repository.findUnique({ where: { url: repositoryUrl } });
	const repository = await prisma.repository.findFirst({ 
		where: { 
			updateConfig: {
				path: ['repository_path'], 
				equals: repositoryPath
			}
		}
	});

	repositoryUrl = repository?.url;
	
	if (!repository) {
		await logRequest(request, repositoryUrl, {
			status: 404,
			success: false,
			error: 'Repository not found'
		});
		return json({ success: false, message: 'Repository not found.' }, { status: 404 });
	}

	const signatureSecret = getSignatureSecret(repository.updateConfig);
	const providedSignature = request.headers.get('x-signature') ?? null;
	if (signatureSecret && !isSignatureValid(providedSignature, signatureSecret, rawBody)) {
		await logRequest(request, repositoryUrl, {
			status: 401,
			success: false,
			error: 'Invalid signature'
		});
		return json({ success: false, message: 'Invalid signature.' }, { status: 401 });
	}

	const files = Array.isArray(body.files) ? (body.files as IncomingFile[]) : [];
	const fileMeta = new Map<string, Record<string, unknown>>();
	for (const file of files) {
		const path = normalizeString(file.remoteUrl) ?? normalizeString(file.path);
		if (!path) continue;
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

	if (
		addedPaths.length === 0 &&
		modifiedPaths.length === 0 &&
		deletedPaths.length === 0 &&
		movedEntries.length === 0
	) {
		await logRequest(request, repositoryUrl, {
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
					meta: mergedMeta,
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
				meta: mergedMeta,
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
				meta: mergedMeta,
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
				meta: mergedMeta
			}
		});

		if (track) {
			deleted += 1;
		}
	};

	for (const path of addedPaths) {
		try {
			await ensureFile(path, 'added');
			added += 1;
		} catch (err) {
			console.error('GitLab add handling error', err);
			const reason = err instanceof Error ? err.message : 'Unknown error';
			errors.push(`Failed to add ${path}: ${reason}`);
		}
	}

	for (const path of modifiedPaths) {
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

	for (const entry of movedEntries) {
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
		errors
	};

	await logRequest(request, repositoryUrl, {
		status: 200,
		success: responseBody.success,
		headSha,
		baseSha,
		added,
		modified,
		deleted,
		moved,
		errors
	});

	return json(responseBody);
};

const logRequest = async (
	request: Request,
	repositoryUrl: string | null,
	data: { status: number; success: boolean; [key: string]: unknown }
) => {

	const sig = request.headers.get('x-signature') ?? null;

	try {
		const ip =
			request.headers.get('cf-connecting-ip') ??
			request.headers.get('x-forwarded-for') ??
			null;
		const userAgent = request.headers.get('user-agent');
		await prisma.gitlabApiLog.create({
			data: {
				endpoint: '/api/gitlab/pull/',
				method: request.method,
				status: data.status,
				ip,
				userAgent,
				payload: {
					repositoryUrl,
					sig,
					...data
				}
			}
		});
	} catch (logError) {
		console.error('Failed to record API log', logError);
	}
};
