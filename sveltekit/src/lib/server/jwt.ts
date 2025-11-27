import { jwtVerify, SignJWT } from 'jose';
import { SESSION_JWT_SECRET } from '$env/static/private';
import { redirect, type Cookies } from '@sveltejs/kit';
import { resolve } from '$app/paths';

const enc = new TextEncoder();
const jwtSecret = enc.encode(SESSION_JWT_SECRET);

export interface SessionPayload {
	sub: string;
	email?: string;
	name?: string;
	iat?: number;
	exp?: number;
}

function loginPath(url: URL) {
	const loginResolved = resolve('/login');
	return new URL(loginResolved, url).pathname;
}

export async function requireValidJwt(cookies: Cookies, url: URL): Promise<SessionPayload> {
	const login = loginPath(url);
	if (!cookies) throw redirect(302, login);
	const token = cookies.get('jwt');
	if (!token) throw redirect(302, login);

	try {
		const { payload } = await jwtVerify(token, jwtSecret, { algorithms: ['HS256'] });
		return payload as SessionPayload;
	} catch {
		throw redirect(302, login);
	}
}

export async function checkJwt(cookies: Cookies): Promise<SessionPayload | null> {
	const token = cookies?.get('jwt');
	if (!token) return null;
	try {
		const { payload } = await jwtVerify(token, jwtSecret, { algorithms: ['HS256'] });
		return payload as SessionPayload;
	} catch {
		return null;
	}
}

export async function createSessionJWT(user: Partial<SessionPayload>, maxAgeSec = 3600): Promise<string> {
	const claims: SessionPayload = {
		sub: String(user.sub ?? user.email ?? 'user'),
		email: user.email,
		name: user.name
	};

	return await new SignJWT(claims)
		.setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
		.setSubject(claims.sub)
		.setIssuedAt()
		.setExpirationTime(`${maxAgeSec}s`)
		.sign(jwtSecret);
}
