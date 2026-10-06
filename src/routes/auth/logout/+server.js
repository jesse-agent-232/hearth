import { redirect } from '@sveltejs/kit';
import * as client from 'openid-client';
import { getOIDCConfig } from '$lib/server/oidc.js';

export async function GET({ cookies, url }) {
	const idToken = cookies.get('oidc_id_token');
	cookies.delete('auth_name', { path: '/' });
	cookies.delete('auth_username', { path: '/' });
	cookies.delete('session', { path: '/' });
	cookies.delete('oidc_state', { path: '/' });
	cookies.delete('oidc_verifier', { path: '/' });
	cookies.delete('oidc_id_token', { path: '/' });

	// Also end the provider's session when it supports RP-initiated logout
	// (Authentik does). Otherwise the next "Log in" signs straight back in
	// without a password, which on a shared device means the previous user.
	// Providers without an end_session_endpoint (Authelia) only log out of Holm.
	let target = '/';
	if (idToken) {
		try {
			const { config, redirect_base } = await getOIDCConfig();
			if (config.serverMetadata().end_session_endpoint) {
				target = client.buildEndSessionUrl(config, {
					id_token_hint: idToken,
					post_logout_redirect_uri: `${redirect_base || url.origin}/`
				}).href;
			}
		} catch (err) {
			console.error('[OIDC] End-session lookup failed:', err.message);
		}
	}
	redirect(302, target);
}
