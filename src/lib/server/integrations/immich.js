// Immich integration adapter.
//
// Surfaces in this PR:
//   - searchProviders.photos — POSTs to /api/search/smart, returns thumbnails
//
// Reserved for follow-ups (not wired):
//   - widgets (recent photos, on-this-day, etc.)

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'immich',
	name: 'Immich',
	category: 'Photos',
	icon: 'di:immich',
	shortcut: 'photos',
	description: 'Photo library with smart search',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Immich URL',
			required: true,
			placeholder: 'https://immich.example.com',
			help: 'Base URL of your Immich server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'apiKey',
			type: 'secret',
			label: 'API Key',
			required: true,
			help: '1. Open **Account Settings → API Keys**\n2. Click **New API Key** and give it a name\n3. Enable scopes: `user.read`, `asset.read`, `asset.view`\n4. Copy the key and paste it here',
			helpUrl: { baseKey: 'url', path: '/user-settings?isOpen=api-keys', label: 'Get your API key' }
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.apiKey) {
			return { ok: false, message: 'URL and API key are required' };
		}
		const base = stripTrailingSlash(config.url);
		try {
			// /api/server/ping is unauthenticated on Immich — confirms the URL is reachable.
			const ping = await fetch(`${base}/api/server/ping`, {
				method: 'GET',
				headers: { accept: 'application/json' }
			});
			if (!ping.ok) {
				return { ok: false, message: `Server returned ${ping.status} ${ping.statusText}` };
			}

			// /api/users/me confirms the API key is valid AND has user.read scope.
			// If the key is missing scopes Immich returns 403 with a helpful message
			// like "Missing required permission: user.read" — surface that verbatim
			// so users know exactly which checkbox to enable.
			const meRes = await fetch(`${base}/api/users/me`, {
				method: 'GET',
				headers: { 'x-api-key': config.apiKey, accept: 'application/json' }
			});
			if (!meRes.ok) {
				const detail = await readImmichError(meRes);
				if (meRes.status === 401) {
					return { ok: false, message: detail || 'API key rejected by Immich' };
				}
				if (meRes.status === 403) {
					return {
						ok: false,
						message: detail
							? `${detail}. Re-create your API key in Immich with user.read, asset.read, and asset.view enabled.`
							: 'API key is missing required permissions. Enable user.read, asset.read, and asset.view in Immich.'
					};
				}
				return { ok: false, message: detail || `Auth check failed: ${meRes.status}` };
			}
			const me = await meRes.json().catch(() => null);
			const who = me?.email || me?.name || 'Immich user';
			return { ok: true, message: `Connected as ${who}` };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		photos: {
			label: 'Photos',
			kind: 'photo',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.apiKey) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				const res = await fetch(`${base}/api/search/smart`, {
					method: 'POST',
					headers: {
						'x-api-key': config.apiKey,
						'content-type': 'application/json',
						accept: 'application/json'
					},
					body: JSON.stringify({
						query: trimmed,
						size: Math.min(limit || 20, 50)
					})
				});
				if (!res.ok) {
					throw new Error(`Immich search failed: ${res.status}`);
				}
				const data = await res.json();
				const items = data?.assets?.items || [];
				return {
					results: items.map((asset) => ({
						id: asset.id,
						title: asset.originalFileName || asset.id,
						// Browser fetches thumbnails through Holm so the API key
						// never reaches the browser. The proxy route resolves the
						// user's stored config and forwards to Immich with x-api-key.
						// Using size=thumbnail (256x256, ~20KB) instead of preview
						// (1080px, ~500KB) — search results are tiny tiles.
						thumbnail: `/api/integrations/immich/proxy/thumbnail/${encodeURIComponent(asset.id)}?size=thumbnail`,
						href: `${base}/photos/${asset.id}`,
						meta: {
							kind: 'photo',
							takenAt: asset.fileCreatedAt || asset.localDateTime || null
						}
					}))
				};
			}
		}
	},

	proxy: {
		// Thumbnail / preview byte-streaming proxy. Browser fetches a Holm URL
		// like /api/integrations/immich/proxy/thumbnail/<asset-id>?size=preview
		// and the server forwards to Immich with the user's stored API key.
		thumbnail: {
			defaultCacheControl: 'private, max-age=3600',
			async fetch({ config, params, request, fetch }) {
				const base = stripTrailingSlash(config.url);
				const id = params.path?.[0];
				if (!id) return new Response('Missing asset id', { status: 400 });
				const url = new URL(request.url);
				const size = url.searchParams.get('size') || 'preview';
				const upstream = `${base}/api/assets/${encodeURIComponent(id)}/thumbnail?size=${encodeURIComponent(size)}`;
				return fetch(upstream, {
					method: 'GET',
					headers: { 'x-api-key': config.apiKey }
				});
			}
		}
	},

	widgets: {}
};

function stripTrailingSlash(url) {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

// Pull a human-readable error message out of an Immich error response.
// Immich returns { message, error, statusCode } JSON for API errors.
async function readImmichError(res) {
	try {
		const body = await res.json();
		return body?.message || body?.error || '';
	} catch {
		return '';
	}
}

export default adapter;
