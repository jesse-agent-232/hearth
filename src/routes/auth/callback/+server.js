import { redirect, error } from '@sveltejs/kit';
import * as client from 'openid-client';
import { getOIDCConfig } from '$lib/server/oidc.js';
import { signSession } from '$lib/server/session.js';

export async function GET({ url, cookies }) {
	const state = cookies.get('oidc_state');
	const codeVerifier = cookies.get('oidc_verifier');

	cookies.delete('oidc_state', { path: '/' });
	cookies.delete('oidc_verifier', { path: '/' });

	if (!state || !codeVerifier) {
		error(400, 'Missing OIDC state or verifier');
	}

	const { config, redirect_base } = await getOIDCConfig();
	const redirectUri = `${redirect_base}/auth/callback`;

	let tokens;
	try {
		tokens = await client.authorizationCodeGrant(config, url, {
			pkceCodeVerifier: codeVerifier,
			expectedState: state,
			idTokenExpected: true
		});
	} catch (err) {
		console.error('[OIDC] Token exchange failed:', err.message);
		console.error('[OIDC] Expected redirect_uri:', redirectUri);
		console.error('[OIDC] Actual callback URL:', url.toString());
		if (err.cause) console.error('[OIDC] Cause:', JSON.stringify(err.cause));
		error(502, 'Authentication failed. Please try again.');
	}

	// Extract user info from ID token claims
	const claims = tokens.claims();
	let name = claims?.name || claims?.display_name || claims?.preferred_username || claims?.sub || 'User';
	let username = claims?.preferred_username || claims?.email?.split('@')[0] || claims?.sub || '';
	let groups = Array.isArray(claims?.groups) ? claims.groups : [];

	// Try userinfo endpoint for more complete data
	try {
		const userinfo = await client.fetchUserInfo(config, tokens.access_token);
		if (userinfo.preferred_username) username = userinfo.preferred_username;
		else if (userinfo.email) username = userinfo.email.split('@')[0];
		if (userinfo.name || userinfo.display_name) name = userinfo.name || userinfo.display_name;
		else if (userinfo.preferred_username) name = userinfo.preferred_username;
		if (Array.isArray(userinfo.groups)) groups = userinfo.groups;
	} catch (err) {
		console.error('[OIDC] Userinfo fetch error:', err.message);
	}

	// Final fallback: if name is still a UUID-like string, use username instead
	if (/^[0-9a-f-]{32,}$/i.test(name) && username && !/^[0-9a-f-]{32,}$/i.test(username)) {
		name = username;
	}

	// Short-lived cookies to pass auth info on first load
	cookies.set('auth_name', name, { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 });
	cookies.set('auth_username', username, { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 });

	// Persistent signed session cookie (includes groups for admin detection)
	const sessionData = signSession({ name, username, groups });
	cookies.set('session', sessionData, { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 * 60 * 24 * 30 });
	// Kept for logout: the provider's end-session endpoint uses it to know
	// whose session to end and that the redirect back is legitimate.
	const idToken = tokens.id_token;
	if (idToken) cookies.set('oidc_id_token', idToken, { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 * 60 * 24 * 30 });

	redirect(302, '/');
}
