// Jellyseerr (Seerr) integration adapter.
//
// Surfaces:
//   - searchProviders.requests — TMDB search via Jellyseerr, with each title's
//     request / availability status

// MediaStatus from server/constants/media.ts. A result with no mediaInfo has
// never been requested.
const MEDIA_STATUS = {
	1: 'Not requested', // UNKNOWN — a media row exists but nothing is in flight
	2: 'Pending', //       PENDING — awaiting approval
	3: 'Requested', //     PROCESSING — approved, downloading
	4: 'Partially available',
	5: 'Available',
	6: 'Blocklisted',
	7: 'Deleted'
};

const MEDIA_LABEL = { movie: 'Movie', tv: 'Show' };

// TMDB poster paths look like "/abc123.jpg".
const POSTER_PATH = /^\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/;

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'jellyseerr',
	name: 'Jellyseerr',
	icon: 'di:jellyseerr',
	shortcut: 'js',
	description: 'Media requests — find titles and see what is available',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Jellyseerr URL',
			required: true,
			placeholder: 'https://jellyseerr.example.com',
			help: 'Base URL of your Jellyseerr server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'apiKey',
			type: 'secret',
			label: 'API Key',
			required: true,
			help: '1. Open **Settings → General** (admin only)\n2. Copy the **API Key** and paste it here',
			helpUrl: { baseKey: 'url', path: '/settings/main', label: 'Open Jellyseerr settings' }
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.apiKey) {
			return { ok: false, message: 'URL and API key are required' };
		}
		const base = stripTrailingSlash(config.url);
		try {
			// /status is public — confirms the URL and gives us the version.
			const statusRes = await fetch(`${base}/api/v1/status`, {
				method: 'GET',
				headers: { accept: 'application/json' }
			});
			if (!statusRes.ok) {
				return { ok: false, message: `Server returned ${statusRes.status} ${statusRes.statusText}` };
			}
			const status = await statusRes.json().catch(() => null);

			// /auth/me needs a valid key.
			const meRes = await fetch(`${base}/api/v1/auth/me`, {
				method: 'GET',
				headers: authHeaders(config)
			});
			if (!meRes.ok) {
				if (meRes.status === 401 || meRes.status === 403) {
					return { ok: false, message: 'API key rejected — copy it from Settings → General' };
				}
				return { ok: false, message: `Auth check failed: ${meRes.status}` };
			}
			const version = status?.version ? ` (v${status.version})` : '';
			return { ok: true, message: `Connected to Jellyseerr${version}` };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		requests: {
			label: 'Requests',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.apiKey) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				// Jellyseerr's OpenAPI validator rejects any reserved character in
				// the query value, including `+` for a space, so URLSearchParams
				// won't do. encodeURIComponent leaves !'()* alone; escape those too.
				const res = await fetch(`${base}/api/v1/search?query=${strictEncode(trimmed)}&page=1`, {
					method: 'GET',
					headers: authHeaders(config)
				});
				if (!res.ok) {
					throw new Error(`Jellyseerr search failed: ${res.status}`);
				}
				const data = await res.json();
				const items = (data?.results || []).filter(
					(r) => r.mediaType === 'movie' || r.mediaType === 'tv'
				);
				return {
					results: items.slice(0, Math.min(limit || 10, 20)).map((r) => {
						const title = r.mediaType === 'movie' ? r.title : r.name;
						const year = (r.mediaType === 'movie' ? r.releaseDate : r.firstAirDate)?.slice(0, 4);
						const status = MEDIA_STATUS[r.mediaInfo?.status] || 'Not requested';
						return {
							id: `${r.mediaType}-${r.id}`,
							title: title || 'Untitled',
							subtitle: [MEDIA_LABEL[r.mediaType], year].filter(Boolean).join(' · '),
							tags: [status],
							// No CSP restricts img-src, and TMDB posters are public, so
							// they load straight from TMDB's CDN like Jellyseerr's own UI.
							thumbnail: POSTER_PATH.test(r.posterPath || '')
								? `https://image.tmdb.org/t/p/w185${r.posterPath}`
								: undefined,
							href: `${base}/${r.mediaType}/${r.id}`,
							meta: { kind: 'media', status }
						};
					})
				};
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
		'X-Api-Key': config.apiKey,
		accept: 'application/json'
	};
}

function strictEncode(value) {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
	);
}

export default adapter;
