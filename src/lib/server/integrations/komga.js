// Komga integration adapter.
//
// Surfaces:
//   - searchProviders.series — full-text search over comics, manga and book
//     series, with their covers
//
// Needs Komga 1.20 or later: that is when the REST API took X-API-Key.

// Komga ids are TSIDs: letters and digits only.
const SERIES_ID = /^[A-Za-z0-9]{1,32}$/;

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'komga',
	name: 'Komga',
	icon: 'di:komga',
	shortcut: 'komga',
	description: 'Comics, manga and ebook server',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Komga URL',
			required: true,
			placeholder: 'https://komga.example.com',
			help: 'Base URL of your Komga server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'apiKey',
			type: 'secret',
			label: 'API Key',
			required: true,
			help: '1. Open **Account Settings** → **API Keys**\n2. Click **Generate API key**, name it\n3. Copy the key — Komga shows it only once',
			helpUrl: { baseKey: 'url', path: '/account/api-keys', label: 'Open Komga API keys' }
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.apiKey) {
			return { ok: false, message: 'URL and API key are required' };
		}
		const base = stripTrailingSlash(config.url);
		try {
			const res = await fetch(`${base}/api/v2/users/me`, { method: 'GET', headers: authHeaders(config) });
			if (!res.ok) {
				if (res.status === 401 || res.status === 403) {
					return { ok: false, message: 'API key rejected — check that it is valid' };
				}
				return { ok: false, message: `Server returned ${res.status} ${res.statusText}` };
			}
			const me = await res.json();
			return { ok: true, message: me?.email ? `Connected as ${me.email}` : 'Connected' };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		series: {
			label: 'Series',
			kind: 'media',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.apiKey) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				// A full-text search is sorted by relevance unless a sort is given.
				const params = new URLSearchParams({ size: String(Math.min(limit || 10, 25)) });
				const res = await fetch(`${base}/api/v1/series/list?${params}`, {
					method: 'POST',
					headers: { ...authHeaders(config), 'content-type': 'application/json' },
					body: JSON.stringify({ fullTextSearch: trimmed })
				});
				if (!res.ok) {
					throw new Error(`Komga search failed: ${res.status}`);
				}
				const data = await res.json();
				return {
					results: (data?.content || []).filter((s) => SERIES_ID.test(String(s?.id))).map((series) => ({
						id: series.id,
						title: series.metadata?.title || series.name || 'Untitled',
						subtitle: subtitleFor(series),
						thumbnail: `/api/integrations/komga/proxy/thumbnail/${series.id}`,
						href: `${base}/series/${series.id}`,
						meta: { kind: 'media' }
					}))
				};
			}
		}
	},

	proxy: {
		thumbnail: {
			defaultCacheControl: 'private, max-age=86400',
			async fetch({ config, params, fetch }) {
				const id = params.path?.[0];
				if (params.path?.length !== 1 || !id || !SERIES_ID.test(id)) {
					return new Response('Invalid series id', { status: 400 });
				}
				return fetch(`${stripTrailingSlash(config.url)}/api/v1/series/${id}/thumbnail`, {
					method: 'GET',
					headers: { 'X-API-Key': config.apiKey }
				});
			}
		}
	},

	widgets: {}
};

// "12 books · Author · 2019"
function subtitleFor(series) {
	const count = series.booksCount;
	const books = count ? `${count} book${count === 1 ? '' : 's'}` : '';
	const author = series.booksMetadata?.authors?.find((a) => a?.role === 'writer')?.name
		|| series.booksMetadata?.authors?.[0]?.name;
	const year = series.booksMetadata?.releaseDate?.slice(0, 4);
	return [books, author, year].filter(Boolean).join(' · ');
}

function stripTrailingSlash(url) {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

function authHeaders(config) {
	return {
		'X-API-Key': config.apiKey,
		accept: 'application/json'
	};
}

export default adapter;
