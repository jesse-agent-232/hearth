// Who the request is, from an already-verified session payload. Kept free of
// SvelteKit imports so it can be unit-tested directly.
//
// Only the signed session says who is signed in. The one-time auth_name
// cookie set at login overrides the display name of a valid session, and
// never stands in for one: it isn't signed.
export function userFromSession(session, { authName, authEnabled }) {
	if (session?.username) {
		return {
			name: authName || session.name || session.username,
			username: session.username,
			groups: Array.isArray(session.groups) ? session.groups : []
		};
	}
	// Auth disabled — treat as guest
	if (!authEnabled) return { name: 'Guest', username: 'guest', groups: [] };
	return null;
}
