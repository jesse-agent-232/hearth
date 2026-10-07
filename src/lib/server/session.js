import { createHmac, randomBytes } from 'crypto';
import { dev } from '$app/environment';
import { getAuth } from '$lib/server/config.js';

// Session signing key — derived from OIDC client secret or random per-process
let _signingKey = null;
function getSigningKey() {
	if (_signingKey) return _signingKey;
	const auth = getAuth();
	const secret = auth?.oidc?.client_secret;
	if (secret && !secret.startsWith('${')) {
		_signingKey = createHmac('sha256', 'holm-session').update(secret).digest('hex');
	} else {
		// Fallback: random key (sessions invalidated on restart, acceptable for dev)
		_signingKey = randomBytes(32).toString('hex');
	}
	return _signingKey;
}

function hmac(data) {
	return createHmac('sha256', getSigningKey()).update(data).digest('hex');
}

/** Sign a session object → "base64payload.signature" */
export function signSession(data) {
	const payload = btoa(JSON.stringify(data));
	const sig = hmac(payload);
	return `${payload}.${sig}`;
}

/** Verify and parse a signed session cookie. Returns null if invalid. */
function verifySession(cookie) {
	if (!cookie) return null;
	const dotIdx = cookie.lastIndexOf('.');
	if (dotIdx === -1) {
		// Legacy unsigned cookie — reject in production
		if (!dev) return null;
		try { return JSON.parse(atob(cookie)); }
		catch { return null; }
	}
	const payload = cookie.slice(0, dotIdx);
	const sig = cookie.slice(dotIdx + 1);
	if (hmac(payload) !== sig) return null;
	try { return JSON.parse(atob(payload)); }
	catch { return null; }
}

export function getSessionUser(cookies, url) {
	const authConfig = getAuth();

	// Dev mode: ?user=xxx simulates auth, and ?groups=a,b its groups
	if (dev && url?.searchParams?.has('user')) {
		const devUser = url.searchParams.get('user');
		return {
			name: devUser,
			username: devUser,
			groups: (url.searchParams.get('groups') || '').split(',').filter(Boolean)
		};
	}

	// Always use the signed session cookie for username/groups (auth decisions)
	const session = cookies.get('session');
	const s = verifySession(session);
	let name = s?.name;
	let username = s?.username;
	let groups = Array.isArray(s?.groups) ? s.groups : [];

	// One-time auth cookies override display name only (not username/groups)
	const authName = cookies.get('auth_name');
	if (authName) name = authName;

	// Auth disabled — treat as guest
	if (!authConfig.enabled && !name) {
		return { name: 'Guest', username: 'guest', groups: [] };
	}

	if (!name) return null;
	return { name, username, groups };
}
