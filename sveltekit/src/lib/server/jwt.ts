import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { SESSION_JWT_SECRET } from '$env/static/private';
import { redirect, type Cookies } from '@sveltejs/kit';
import { resolve } from '$app/paths';

const enc = new TextEncoder();
const jwtSecret = enc.encode(SESSION_JWT_SECRET);

export interface SessionPayload extends JWTPayload {
	userId: string;
	allow_regex?: string;
};

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
		return payload as unknown as SessionPayload;
	} catch {
		throw redirect(302, login);
	}
}

export async function checkJwt(cookies: Cookies): Promise<SessionPayload | null> {
	const token = cookies?.get('jwt');
	if (!token) return null;
	try {
		const { payload } = await jwtVerify(token, jwtSecret, { algorithms: ['HS256'] });
		return payload as unknown as SessionPayload;
	} catch {
		return null;
	}
}

export async function createSessionJWT(claims: SessionPayload, maxAgeSec = 3600): Promise<string> {
	const tokenClaims: SessionPayload = {
		userId: claims.userId,
		allow_regex: claims.allow_regex
	};

	return await new SignJWT(tokenClaims)
		.setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
		.setSubject(tokenClaims.userId)
		.setIssuedAt()
		.setExpirationTime(`${maxAgeSec}s`)
		.sign(jwtSecret);
}
