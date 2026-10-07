// Paperless-ngx integration adapter.
//
// Surfaces:
//   - searchProviders.documents — searches documents via full-text query API

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'paperless',
	name: 'Paperless-ngx',
	icon: 'di:paperless-ngx',
	shortcut: 'd',
	description: 'Document management with full-text search',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Paperless URL',
			required: true,
			placeholder: 'https://paperless.example.com',
			help: 'Base URL of your Paperless-ngx server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'token',
			type: 'secret',
			label: 'API Token',
			required: true,
			help: '1. Open **Settings → Administration**\n2. Scroll to **Auth Tokens**\n3. Click **Add Token** and copy the value',
			helpUrl: { baseKey: 'url', path: '/dashboard', label: 'Open Paperless settings' }
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.token) {
			return { ok: false, message: 'URL and token are required' };
		}
		const base = stripTrailingSlash(config.url);
		try {
			const res = await fetch(`${base}/api/documents/?page=1&page_size=1`, {
				method: 'GET',
				headers: authHeaders(config)
			});
			if (!res.ok) {
				if (res.status === 401 || res.status === 403) {
					return { ok: false, message: 'Token rejected — check that it is a valid API token' };
				}
				return { ok: false, message: `Server returned ${res.status} ${res.statusText}` };
			}
			const data = await res.json();
			const count = data?.count ?? 0;
			return { ok: true, message: `Connected — ${count} document${count !== 1 ? 's' : ''} in library` };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		documents: {
			label: 'Documents',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.token) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				const params = new URLSearchParams({
					query: trimmed,
					page_size: String(Math.min(limit || 10, 25))
				});
				const res = await fetch(`${base}/api/documents/?${params}`, {
					method: 'GET',
					headers: authHeaders(config)
				});
				if (!res.ok) {
					throw new Error(`Paperless search failed: ${res.status}`);
				}
				const data = await res.json();
				const items = data?.results || [];
				return {
					results: items.map((doc) => ({
						id: String(doc.id),
						title: doc.title || `Document #${doc.id}`,
						subtitle: doc.__search_hit__?.highlights
							? stripHighlightTags(doc.__search_hit__.highlights)
							: doc.correspondent_name || '',
						thumbnail: `/api/integrations/paperless/proxy/thumbnail/${doc.id}`,
						href: `${base}/documents/${doc.id}/details`,
						meta: { kind: 'document' }
					}))
				};
			}
		}
	},

	proxy: {
		thumbnail: {
			defaultCacheControl: 'private, max-age=3600',
			async fetch({ config, params, fetch }) {
				const base = stripTrailingSlash(config.url);
				const id = params.path?.[0];
				if (!id) return new Response('Missing document id', { status: 400 });
				return fetch(`${base}/api/documents/${encodeURIComponent(id)}/thumb/`, {
					method: 'GET',
					headers: authHeaders(config)
				});
			}
		}
	},

	widgets: {}
};

function stripTrailingSlash(url) {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

function authHeaders(config) {
	return {
		Authorization: `Token ${config.token}`,
		accept: 'application/json'
	};
}

// Strip <span> highlight tags from Paperless search hit highlights
function stripHighlightTags(highlights) {
	if (!highlights) return '';
	return highlights.replace(/<\/?span[^>]*>/g, '').trim().slice(0, 120);
}

export default adapter;
