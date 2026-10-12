// Linkwarden integration adapter.
//
// Surfaces:
//   - searchProviders.links — searches links by name, URL, description and
//     tags (full text when the server runs Meilisearch)

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'linkwarden',
	name: 'Linkwarden',
	// Dashboard Icons has Linkwarden only as PNG/WebP, and `di:` loads SVG.
	icon: null,
	shortcut: 'lw',
	description: 'Collaborative bookmark manager with page archives',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Linkwarden URL',
			required: true,
			placeholder: 'https://linkwarden.example.com',
			help: 'Base URL of your Linkwarden server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'apiKey',
			type: 'secret',
			label: 'Access Token',
			required: true,
			help: '1. Open **Settings** → **Access Tokens**\n2. Click **New Access Token**, name it and pick an expiry (or **No Expiration**)\n3. Copy the token',
			helpUrl: { baseKey: 'url', path: '/settings/access-tokens', label: 'Open Linkwarden settings' }
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.apiKey) {
			return { ok: false, message: 'URL and access token are required' };
		}
		const base = stripTrailingSlash(config.url);
		try {
			const res = await fetch(`${base}/api/v1/users/me`, {
				method: 'GET',
				headers: authHeaders(config)
			});
			if (!res.ok) {
				if (res.status === 401 || res.status === 403) {
					return { ok: false, message: 'Access token rejected — check that it is valid and not expired' };
				}
				return { ok: false, message: `Server returned ${res.status} ${res.statusText}` };
			}
			const data = await res.json();
			const username = data?.response?.username;
			return { ok: true, message: username ? `Connected as ${username}` : 'Connected' };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		links: {
			label: 'Links',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.apiKey) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				const params = new URLSearchParams({ searchQueryString: trimmed });
				const res = await fetch(`${base}/api/v1/search?${params}`, {
					method: 'GET',
					headers: authHeaders(config)
				});
				if (!res.ok) {
					throw new Error(`Linkwarden search failed: ${res.status}`);
				}
				const data = await res.json();
				// The server pages at 50 and has no size parameter.
				const items = (data?.data?.links || []).slice(0, Math.min(limit || 10, 25));
				return {
					results: items.map((link) => {
						const tags = (link.tags || []).map((t) => t.name).filter(Boolean);
						const subtitle = [link.collection?.name, tags.join(', ')].filter(Boolean).join(' · ')
							|| link.description || '';
						const hasPreview = link.preview && link.preview !== 'unavailable';
						return {
							id: String(link.id),
							title: link.name || link.url || 'Untitled',
							subtitle: subtitle.slice(0, 120),
							thumbnail: hasPreview ? `/api/integrations/linkwarden/proxy/preview/${link.id}` : undefined,
							href: link.url || `${base}/links/${link.id}`,
							meta: { kind: 'bookmark' }
						};
					})
				};
			}
		}
	},

	proxy: {
		preview: {
			defaultCacheControl: 'private, max-age=3600',
			async fetch({ config, params, fetch }) {
				const base = stripTrailingSlash(config.url);
				const id = params.path?.[0];
				if (!id || !/^\d+$/.test(id)) {
					return new Response('Invalid link id', { status: 400 });
				}
				// format=1 is JPEG; preview=true asks for the small card image.
				return fetch(`${base}/api/v1/archives/${id}?format=1&preview=true`, {
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
		Authorization: `Bearer ${config.apiKey}`,
		accept: 'application/json'
	};
}

export default adapter;
