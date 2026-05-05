import prisma from '$lib/server/db';

export const normalizeString = (value: unknown) =>
	typeof value === 'string' && value.trim() ? value.trim() : null;

export const getSignatureSecret = (value: unknown) => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const config = value as Record<string, unknown>;
	return (
		normalizeString(config.Github2EdTechRAG_SHARED_SECRET) ??
		normalizeString(config.GitLab2EdTechRAG_SHARED_SECRET)
	);
};

const toHex = (bytes: Uint8Array) =>
	Array.from(bytes)
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');

const secureCompare = (left: string, right: string) => {
	if (left.length !== right.length) return false;
	let diff = 0;
	for (let i = 0; i < left.length; i += 1) {
		diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
	}
	return diff === 0;
};

export const isSignatureValid = async (provided: string | null, secret: string, rawBody: string) => {
	if (!provided) return false;
	const keyData = new TextEncoder().encode(secret);
	const bodyData = new TextEncoder().encode(rawBody);
	const cryptoKey = await globalThis.crypto.subtle.importKey(
		'raw',
		keyData,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, bodyData);
	const expected = toHex(new Uint8Array(signature));
	return secureCompare(provided, expected);
};

type GitLabRequestContext =
	| {
			ok: true;
			rawBody: string;
			body: Record<string, unknown>;
			repositoryPath: string;
			repositoryUrl: string;
			repository: {
				url: string;
				updateConfig: unknown;
				ragConfig: unknown;
			};
	  }
	| {
			ok: false;
			status: number;
			message: string;
			rawBody: string;
			body: Record<string, unknown> | null;
			repositoryPath: string | null;
			repositoryUrl: string | null;
	  };

export const parseGitLabApiRequest = async (
	request: Request
): Promise<GitLabRequestContext> => {
	let payload: unknown;
	let rawBody = '';

	try {
		rawBody = await request.text();
		payload = rawBody ? JSON.parse(rawBody) : null;
	} catch {
		return {
			ok: false,
			status: 400,
			message: 'Invalid JSON payload.',
			rawBody,
			body: null,
			repositoryPath: null,
			repositoryUrl: null
		};
	}

	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return {
			ok: false,
			status: 400,
			message: 'Payload must be an object.',
			rawBody,
			body: null,
			repositoryPath: null,
			repositoryUrl: null
		};
	}

	const body = payload as Record<string, unknown>;
	const repositoryPath = normalizeString(body.repository_path);

	if (!repositoryPath) {
		return {
			ok: false,
			status: 400,
			message: 'Missing repository URL/path.',
			rawBody,
			body,
			repositoryPath: null,
			repositoryUrl: null
		};
	}

	const repository = await prisma.repository.findFirst({
		where: {
			updateConfig: {
				path: ['repository_path'],
				equals: repositoryPath
			}
		},
		select: {
			url: true,
			updateConfig: true,
			ragConfig: true
		}
	});

	if (!repository) {
		return {
			ok: false,
			status: 404,
			message: 'Repository not found.',
			rawBody,
			body,
			repositoryPath,
			repositoryUrl: null
		};
	}

	const signatureSecret = getSignatureSecret(repository.updateConfig);
	let providedSignature = request.headers.get('x-signature');

	if (providedSignature == null) {
		return {
			ok: false,
			status: 401,
			message: 'Signature missing.',
			rawBody,
			body,
			repositoryPath,
			repositoryUrl: repository.url
		};
	}

	providedSignature = providedSignature.toLowerCase().startsWith('sha256=')
		? providedSignature.slice('sha256='.length)
		: providedSignature;

	if (signatureSecret && !(await isSignatureValid(providedSignature, signatureSecret, rawBody))) {
		return {
			ok: false,
			status: 401,
			message: 'Invalid signature.',
			rawBody,
			body,
			repositoryPath,
			repositoryUrl: repository.url
		};
	}

	const bodyTimestamp = Number(body.timestamp);

	if (!Number.isInteger(bodyTimestamp) || bodyTimestamp <= 0) {
		return {
			ok: false,
			status: 400,
			message: 'Missing or invalid timestamp.',
			rawBody,
			body,
			repositoryPath,
			repositoryUrl: repository.url
		};
	}

	const nowSec = Math.floor(Date.now() / 1000);
	const maxAgeSec = 5 * 60;

	if (nowSec - bodyTimestamp > maxAgeSec) {
		return {
			ok: false,
			status: 400,
			message: 'Payload timestamp is older than 5 minutes.',
			rawBody,
			body,
			repositoryPath,
			repositoryUrl: repository.url
		};
	}

	return {
		ok: true,
		rawBody,
		body,
		repositoryPath,
		repositoryUrl: repository.url,
		repository
	};
};

export const logGitLabApiRequest = async (
	request: Request,
	endpoint: string,
	repositoryUrl: string | null,
	data: { status: number; success: boolean; [key: string]: unknown }
) => {
	const sig = request.headers.get('x-signature') ?? null;

	try {
		const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? null;
		const userAgent = request.headers.get('user-agent');
		await prisma.gitlabApiLog.create({
			data: {
				endpoint,
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
