// Miniflux integration adapter.
//
// Surfaces:
//   - searchProviders.articles — full-text search over the user's feed entries

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'miniflux',
	name: 'Miniflux',
	icon: 'di:miniflux',
	shortcut: 'rss',
	description: 'Minimalist feed reader',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Miniflux URL',
			required: true,
			placeholder: 'https://miniflux.example.com',
			help: 'Base URL of your Miniflux server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'apiKey',
			type: 'secret',
			label: 'API Key',
			required: true,
			help: '1. Open **Settings** → **API Keys**\n2. Click **Create a new API key**, name it and save\n3. Copy the token',
			helpUrl: { baseKey: 'url', path: '/keys', label: 'Open Miniflux API keys' }
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.apiKey) {
			return { ok: false, message: 'URL and API key are required' };
		}
		const base = stripTrailingSlash(config.url);
		try {
			const res = await fetch(`${base}/v1/me`, { method: 'GET', headers: authHeaders(config) });
			if (!res.ok) {
				if (res.status === 401 || res.status === 403) {
					return { ok: false, message: 'API key rejected — check that it is valid' };
				}
				return { ok: false, message: `Server returned ${res.status} ${res.statusText}` };
			}
			const data = await res.json();
			return { ok: true, message: data?.username ? `Connected as ${data.username}` : 'Connected' };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		articles: {
			label: 'Articles',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.apiKey) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				// The API sorts by date before rank, so the newest matches come first.
				const params = new URLSearchParams({
					search: trimmed,
					limit: String(Math.min(limit || 10, 25)),
					order: 'published_at',
					direction: 'desc'
				});
				const res = await fetch(`${base}/v1/entries?${params}`, {
					method: 'GET',
					headers: authHeaders(config)
				});
				if (!res.ok) {
					throw new Error(`Miniflux search failed: ${res.status}`);
				}
				const data = await res.json();
				return {
					results: (data?.entries || []).map((entry) => {
						const iconId = entry.feed?.icon?.icon_id;
						const date = formatDate(entry.published_at);
						return {
							id: String(entry.id),
							title: entry.title || entry.url || 'Untitled',
							subtitle: [entry.feed?.title, date].filter(Boolean).join(' · ').slice(0, 120),
							thumbnail: iconId ? `/api/integrations/miniflux/proxy/icon/${iconId}` : undefined,
							// Opening it in Miniflux marks it read and keeps the reader view.
							href: `${base}/search/entry/${entry.id}?${new URLSearchParams({ q: trimmed })}`
						};
					})
				};
			}
		}
	},

	proxy: {
		icon: {
			defaultCacheControl: 'private, max-age=86400',
			async fetch({ config, params, fetch }) {
				const base = stripTrailingSlash(config.url);
				const id = params.path?.[0];
				if (!id || !/^\d+$/.test(id)) {
					return new Response('Invalid icon id', { status: 400 });
				}
				// The API returns the icon as JSON with a data URL, not as an image.
				const res = await fetch(`${base}/v1/icons/${id}`, { method: 'GET', headers: authHeaders(config) });
				if (!res.ok) return new Response(null, { status: res.status });
				const icon = await res.json();
				const match = /^(?:data:)?([\w.+-]+\/[\w.+-]+);base64,(.*)$/s.exec(icon?.data || '');
				if (!match) return new Response('Unexpected icon format', { status: 502 });
				return new Response(Buffer.from(match[2], 'base64'), {
					status: 200,
					headers: { 'content-type': match[1] }
				});
			}
		}
	},

	widgets: {}
};

function formatDate(iso) {
	const d = iso ? new Date(iso) : null;
	if (!d || Number.isNaN(d.getTime())) return '';
	return d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}

function stripTrailingSlash(url) {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

function authHeaders(config) {
	return {
		'X-Auth-Token': config.apiKey,
		accept: 'application/json'
	};
}

export default adapter;
