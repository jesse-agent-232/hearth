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

	const issuerUrl = new URL(oidc.issuer);

	// Discover OIDC configuration from .well-known
	const config = await client.discovery(issuerUrl, oidc.client_id, oidc.client_secret);

	_config = {
		config,
		scopes: oidc.scopes || 'openid profile',
		redirect_base: oidc.redirect_base || ''
	};

	console.log('[holm] OIDC discovery complete for', oidc.issuer);
	return _config;
}
