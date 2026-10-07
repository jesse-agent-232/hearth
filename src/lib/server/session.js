import { createHmac } from 'crypto';
import { dev } from '$app/environment';
import { getAuth } from '$lib/server/config.js';
import { getMasterKey } from '$lib/server/secrets.js';
import { userFromSession } from '$lib/server/sessionUser.js';
import { signSessionToken, verifySessionToken, SESSION_TTL_SECONDS } from '$lib/server/sessionToken.js';

export { SESSION_TTL_SECONDS };

// Session signing key, derived from Holm's master key (HOLM_SECRET_KEY, or
// the key file next to the database), so it never depends on the OIDC
// client secret and survives restarts.
let _signingKey = null;
function getSigningKey() {
	if (!_signingKey) _signingKey = createHmac('sha256', getMasterKey()).update('holm-session').digest();
	return _signingKey;
}

/** Sign a session object → "base64payload.signature", valid for SESSION_TTL_SECONDS. */
export function signSession(data) {
	return signSessionToken(data, getSigningKey());
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

	return userFromSession(verifySessionToken(cookies.get('session'), getSigningKey()), {
		authName: cookies.get('auth_name'),
		authEnabled: !!authConfig.enabled
	});
}
