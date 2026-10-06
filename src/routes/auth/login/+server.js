import { redirect, error } from '@sveltejs/kit';
import * as client from 'openid-client';
import { getOIDCConfig } from '$lib/server/oidc.js';

export async function GET({ cookies }) {
	let oidc;
	try {
		oidc = await getOIDCConfig();
	} catch (err) {
		console.error('[OIDC] Discovery failed:', err.message);
		error(502, `Sign-in provider unreachable or misconfigured: ${err.message}. Check auth.oidc.issuer in config.yml.`);
	}
	const { config, scopes, redirect_base } = oidc;
	const redirectUri = `${redirect_base}/auth/callback`;

	const codeVerifier = client.randomPKCECodeVerifier();
	const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
	const state = client.randomState();

	// Store state and PKCE verifier in cookies
	cookies.set('oidc_state', state, { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 300 });
	cookies.set('oidc_verifier', codeVerifier, { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 300 });

	const authUrl = client.buildAuthorizationUrl(config, {
		redirect_uri: redirectUri,
		scope: scopes,
		state,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256'
	});

	redirect(302, authUrl.href);
}
