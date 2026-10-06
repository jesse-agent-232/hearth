import * as client from 'openid-client';
import { getAuth } from './config.js';

let _config = null;

export async function getOIDCConfig() {
	if (_config) return _config;

	const auth = getAuth();
	const oidc = auth.oidc || {};

	if (!oidc.issuer) {
		throw new Error('[holm] auth.oidc.issuer is required when auth is enabled');
	}

	// Discover OIDC configuration from .well-known
	const config = await discover(oidc.issuer, oidc.client_id, oidc.client_secret);

	_config = {
		config,
		scopes: oidc.scopes || 'openid profile',
		redirect_base: oidc.redirect_base || ''
	};

	console.log('[holm] OIDC discovery complete for', oidc.issuer);
	return _config;
}

// The issuer must match the provider's own string exactly, trailing slash
// included: Authentik's ends in one, most others don't. Getting it wrong is
// the commonest copy-paste mistake, so retry once with the other form.
async function discover(issuer, clientId, clientSecret) {
	try {
		return await client.discovery(new URL(issuer), clientId, clientSecret);
	} catch (err) {
		const alt = issuer.endsWith('/') ? issuer.slice(0, -1) : `${issuer}/`;
		try {
			return await client.discovery(new URL(alt), clientId, clientSecret);
		} catch {
			throw err;
		}
	}
}
