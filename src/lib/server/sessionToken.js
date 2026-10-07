import { createHmac, timingSafeEqual } from 'crypto';

// Signed session cookies: "base64(payload).hex(hmac)". The payload carries
// `exp` (seconds since the epoch); a cookie past it is no longer a session.
// Kept free of SvelteKit imports so it can be unit-tested directly.

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function hmac(key, data) {
	return createHmac('sha256', key).update(data).digest('hex');
}

export function signSessionToken(data, key, now = Date.now()) {
	const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
	const payload = Buffer.from(JSON.stringify({ ...data, exp }), 'utf8').toString('base64');
	return `${payload}.${hmac(key, payload)}`;
}

/** Returns the session payload, or null if the cookie is unsigned, forged or expired. */
export function verifySessionToken(cookie, key, now = Date.now()) {
	if (typeof cookie !== 'string') return null;
	const dot = cookie.lastIndexOf('.');
	if (dot === -1) return null;
	const payload = cookie.slice(0, dot);
	const sig = Buffer.from(cookie.slice(dot + 1), 'utf8');
	const expected = Buffer.from(hmac(key, payload), 'utf8');
	if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
	let data;
	try {
		data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
	} catch {
		return null;
	}
	if (!data || typeof data !== 'object') return null;
	if (!Number.isFinite(data.exp) || data.exp * 1000 <= now) return null;
	return data;
}
