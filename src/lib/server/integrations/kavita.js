// Kavita integration adapter.
//
// Surfaces:
//   - searchProviders.series — searches manga, comics and book series, with
//     their covers
//
// Auth is an Auth Key in the x-api-key header (Kavita 0.8.9 or later).
// Kavita 0.9.0's image routes reject a header-only key with a 400, so the
// cover request repeats it as ?apiKey=; that URL is built and fetched here,
// server-side, and never reaches the browser.

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'kavita',
	name: 'Kavita',
	icon: 'di:kavita',
	shortcut: 'kavita',
	description: 'Manga, comics and ebook reader',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Kavita URL',
			required: true,
			placeholder: 'https://kavita.example.com',
			help: 'Base URL of your Kavita server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'apiKey',
			type: 'secret',
			label: 'Auth Key',
			required: true,
			help: '1. Open **Settings** → **Auth Keys / OPDS**\n2. Click **New**, name the key and pick an expiration\n3. Copy the key',
			helpUrl: { baseKey: 'url', path: '/settings#clients', label: 'Open Kavita auth keys' }
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.apiKey) {
			return { ok: false, message: 'URL and Auth Key are required' };
		}
		const base = stripTrailingSlash(config.url);
		try {
			const res = await fetch(`${base}/api/plugin/authkey-expires`, { method: 'GET', headers: authHeaders(config) });
			if (!res.ok) {
				if (res.status === 401 || res.status === 403) {
					return { ok: false, message: 'Auth Key rejected — check that it is valid and not expired' };
				}
				return { ok: false, message: `Server returned ${res.status} ${res.statusText}` };
			}
			const expires = new Date((await res.json())?.expiresAt ?? NaN);
			return {
				ok: true,
				message: Number.isNaN(expires.getTime())
					? 'Connected'
					: `Connected — the key expires ${expires.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}`
			};
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
				// Kavita searches the user's libraries only; files and chapters
				// are left out, so only series come back.
				const params = new URLSearchParams({ queryString: trimmed, includeChapterAndFiles: 'false' });
				const res = await fetch(`${base}/api/search/search?${params}`, {
					method: 'GET',
					headers: authHeaders(config)
				});
				// A user with no libraries gets a 400 ("libraries-restricted").
				if (res.status === 400) return { results: [] };
				if (!res.ok) {
					throw new Error(`Kavita search failed: ${res.status}`);
				}
				const data = await res.json();
				const series = (data?.series || [])
					.filter((s) => Number.isInteger(s?.seriesId) && Number.isInteger(s?.libraryId))
					.slice(0, Math.min(limit || 10, 25));
				return {
					results: series.map((s) => ({
						id: String(s.seriesId),
						title: s.localizedName || s.name || 'Untitled',
						subtitle: [s.libraryName, s.releaseYear > 0 ? String(s.releaseYear) : ''].filter(Boolean).join(' · '),
						thumbnail: `/api/integrations/kavita/proxy/cover/${s.seriesId}`,
						href: `${base}/library/${s.libraryId}/series/${s.seriesId}`,
						meta: { kind: 'media' }
					}))
				};
			}
		}
	},

	proxy: {
		cover: {
			defaultCacheControl: 'private, max-age=86400',
			async fetch({ config, params, fetch }) {
				const id = params.path?.[0];
				if (params.path?.length !== 1 || !id || !/^\d{1,10}$/.test(id)) {
					return new Response('Invalid series id', { status: 400 });
				}
				const query = new URLSearchParams({ seriesId: id, apiKey: config.apiKey });
				return fetch(`${stripTrailingSlash(config.url)}/api/image/series-cover?${query}`, {
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

function authHeaders(config) {
	return {
		'x-api-key': config.apiKey,
		accept: 'application/json'
	};
}

export default adapter;
