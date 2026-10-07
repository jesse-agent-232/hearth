// Audiobookshelf integration adapter.
//
// Surfaces:
//   - searchProviders.books — searches audiobooks and podcasts in every
//     library the user can see
//
// Auth is an API key sent as a bearer token. Audiobookshelf applies that
// user's library access to every call.

// A server with many libraries would fan out one search per library; past
// this many, the extra ones are skipped.
const MAX_LIBRARIES = 6;

// Covers render 174 CSS px tall; 3x covers phone screens.
const COVER_SIZE = 520;

const ITEM_ID = /^[A-Za-z0-9-]+$/;

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'audiobookshelf',
	name: 'Audiobookshelf',
	category: 'Media',
	icon: 'di:audiobookshelf',
	shortcut: 'abs',
	description: 'Audiobooks and podcasts — search your libraries',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Audiobookshelf URL',
			required: true,
			placeholder: 'https://audiobooks.example.com',
			help: 'Base URL of your Audiobookshelf server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'apiKey',
			type: 'secret',
			label: 'API Key',
			required: true,
			help: '1. An admin opens **Settings → API Keys** and clicks **Add API Key**\n2. Under **Act on behalf of**, pick your user\n3. Copy the key — it is shown once\n\nOn versions before 2.26, copy the **API token** from your account page instead.',
			helpUrl: { baseKey: 'url', path: '/config/api-keys', label: 'Open Audiobookshelf API keys' }
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.apiKey) {
			return { ok: false, message: 'URL and API key are required' };
		}
		const base = stripTrailingSlash(config.url);
		try {
			const res = await fetch(`${base}/api/me`, { headers: authHeaders(config) });
			if (!res.ok) {
				if (res.status === 401 || res.status === 403) {
					return { ok: false, message: 'API key rejected — check that it is valid' };
				}
				return { ok: false, message: `Server returned ${res.status} ${res.statusText}` };
			}
			const me = await res.json();
			return { ok: true, message: `Signed in as ${me?.username || 'Audiobookshelf user'}` };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		books: {
			label: 'Books',
			kind: 'media',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.apiKey) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				const max = Math.min(limit || 10, 25);
				const libs = await fetch(`${base}/api/libraries`, { headers: authHeaders(config) });
				if (!libs.ok) {
					throw new Error(`Audiobookshelf search failed: ${libs.status}`);
				}
				const libraries = ((await libs.json())?.libraries || []).slice(0, MAX_LIBRARIES);
				const params = new URLSearchParams({ q: trimmed, limit: String(max) });
				const perLibrary = await Promise.all(
					libraries.map(async (lib) => {
						const res = await fetch(`${base}/api/libraries/${encodeURIComponent(lib.id)}/search?${params}`, {
							headers: authHeaders(config)
						});
						if (!res.ok) return [];
						const found = await res.json();
						return [...(found?.book || []), ...(found?.podcast || [])].map((m) => m.libraryItem);
					})
				);
				const items = perLibrary.flat().filter((item) => item?.id && ITEM_ID.test(item.id));
				return {
					results: items.slice(0, max).map((item) => {
						const meta = item.media?.metadata || {};
						const isPodcast = item.mediaType === 'podcast';
						return {
							id: item.id,
							title: meta.title || 'Untitled',
							subtitle: [isPodcast ? 'Podcast' : 'Audiobook', isPodcast ? meta.author : meta.authorName]
								.filter(Boolean)
								.join(' · '),
							thumbnail: item.media?.coverPath
								? `/api/integrations/audiobookshelf/proxy/cover/${item.id}?ts=${encodeURIComponent(item.updatedAt || '')}`
								: undefined,
							href: `${base}/item/${item.id}`,
							meta: { kind: 'media' }
						};
					})
				};
			}
		}
	},

	proxy: {
		cover: {
			defaultCacheControl: 'private, max-age=86400',
			async fetch({ config, params, fetch }) {
				const id = params.path?.[0];
				if (!id || !ITEM_ID.test(id)) {
					return new Response('Invalid item id', { status: 400 });
				}
				return fetch(`${stripTrailingSlash(config.url)}/api/items/${id}/cover?width=${COVER_SIZE}`, {
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
