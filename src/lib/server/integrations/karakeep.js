// Karakeep integration adapter.
//
// Surfaces:
//   - searchProviders.bookmarks — searches bookmarks via full-text search API

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'karakeep',
	name: 'Karakeep',
	icon: 'di:karakeep',
	shortcut: 'b',
	description: 'Bookmark manager with full-text search',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Karakeep URL',
			required: true,
			placeholder: 'https://karakeep.example.com',
			help: 'Base URL of your Karakeep server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'apiKey',
			type: 'secret',
			label: 'API Key',
			required: true,
			help: '1. Click your **user icon** (top right) → **Settings**\n2. Scroll to **API Keys**\n3. Click **New API Key**, name it, and copy the value',
			helpUrl: { baseKey: 'url', path: '/settings/api-keys', label: 'Open Karakeep settings' }
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.apiKey) {
			return { ok: false, message: 'URL and API key are required' };
		}
		const base = stripTrailingSlash(config.url);
		try {
			const res = await fetch(`${base}/api/v1/bookmarks?limit=1`, {
				method: 'GET',
				headers: authHeaders(config)
			});
			if (!res.ok) {
				if (res.status === 401 || res.status === 403) {
					return { ok: false, message: 'API key rejected — check that it is valid' };
				}
				return { ok: false, message: `Server returned ${res.status} ${res.statusText}` };
			}
			const data = await res.json();
			// Karakeep doesn't return a total count in list responses,
			// so we just confirm the connection works
			const hasBookmarks = (data?.bookmarks || []).length > 0;
			return { ok: true, message: hasBookmarks ? 'Connected — bookmarks found' : 'Connected — no bookmarks yet' };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		bookmarks: {
			label: 'Bookmarks',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.apiKey) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				const params = new URLSearchParams({
					q: trimmed,
					limit: String(Math.min(limit || 10, 25))
				});
				const res = await fetch(`${base}/api/v1/bookmarks/search?${params}`, {
					method: 'GET',
					headers: authHeaders(config)
				});
				if (!res.ok) {
					throw new Error(`Karakeep search failed: ${res.status}`);
				}
				const data = await res.json();
				const items = data?.bookmarks || [];
				return {
					results: items.map((bm) => {
						const content = bm.content || {};
						const isLink = content.type === 'link';
						const title = (isLink ? content.title : null) || bm.title || 'Untitled';
						const tags = (bm.tags || []).map((t) => t.name).filter(Boolean);
						const subtitle = tags.length
							? tags.join(', ')
							: (isLink ? content.description : null) || '';
						return {
							id: String(bm.id),
							title,
							subtitle: subtitle.slice(0, 120),
							thumbnail: `/api/integrations/karakeep/proxy/screenshot/${bm.id}`,
							href: isLink ? content.url : `${base}/dashboard/preview/${bm.id}`,
							meta: { kind: 'bookmark' }
						};
					})
				};
			}
		}
	},

	proxy: {
		screenshot: {
			defaultCacheControl: 'private, max-age=3600',
			async fetch({ config, params, fetch }) {
				const base = stripTrailingSlash(config.url);
				const id = params.path?.[0];
				if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
					return new Response('Invalid bookmark id', { status: 400 });
				}
				return fetch(`${base}/api/v1/bookmarks/${id}/assets/screenshot`, {
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
