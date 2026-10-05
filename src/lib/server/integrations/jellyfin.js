// Jellyfin integration adapter.
//
// Surfaces:
//   - searchProviders.media — searches movies, shows, episodes, albums and artists
//
// Auth uses `Authorization: MediaBrowser Token="..."`. The X-Emby-Token
// header and api_key query param are legacy: Jellyfin 10.11 added a switch
// for them and 12.0 turns them off by default.

// Item kinds searched, and how each one reads in the subtitle.
const ITEM_TYPES = {
	Movie: 'Movie',
	Series: 'Show',
	Episode: 'Episode',
	MusicAlbum: 'Album',
	MusicArtist: 'Artist'
};

// Jellyfin item ids are GUIDs, serialised as 32 hex chars (or dashed).
const ITEM_ID = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'jellyfin',
	name: 'Jellyfin',
	icon: 'di:jellyfin',
	shortcut: 'jf',
	description: 'Media server — search movies, shows and music',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Jellyfin URL',
			required: true,
			placeholder: 'https://jellyfin.example.com',
			help: 'Base URL of your Jellyfin server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'apiKey',
			type: 'secret',
			label: 'API Key',
			required: true,
			help: '1. Open **Dashboard → API Keys** (admin only)\n2. Click **+**, name it (e.g. Hearth)\n3. Copy the key and paste it here',
			helpUrl: { baseKey: 'url', path: '/web/#/dashboard/keys', label: 'Open API keys' }
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.apiKey) {
			return { ok: false, message: 'URL and API key are required' };
		}
		const base = stripTrailingSlash(config.url);
		try {
			// /System/Info (unlike /System/Info/Public) needs a valid key.
			const res = await fetch(`${base}/System/Info`, {
				method: 'GET',
				headers: authHeaders(config)
			});
			if (!res.ok) {
				if (res.status === 401 || res.status === 403) {
					return { ok: false, message: 'API key rejected — create one under Dashboard → API Keys' };
				}
				return { ok: false, message: `Server returned ${res.status} ${res.statusText}` };
			}
			const info = await res.json();
			const name = info?.ServerName || 'Jellyfin';
			return { ok: true, message: `Connected to ${name}${info?.Version ? ` (v${info.Version})` : ''}` };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		media: {
			label: 'Media',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.apiKey) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				// /Items rather than /Search/Hints: an API key has no user, and
				// /Items explicitly serves API-key callers without a userId (all
				// libraries visible). /Search/Hints passes the key's empty user id
				// straight into the search engine. Everything we read (year,
				// series, episode numbers, image tags, ServerId) is in the default
				// DTO, so no Fields= is needed.
				const params = new URLSearchParams({
					searchTerm: trimmed,
					Recursive: 'true',
					IncludeItemTypes: Object.keys(ITEM_TYPES).join(','),
					Limit: String(Math.min(limit || 10, 25)),
					EnableTotalRecordCount: 'false',
					EnableImageTypes: 'Primary',
					ImageTypeLimit: '1'
				});
				const res = await fetch(`${base}/Items?${params}`, {
					method: 'GET',
					headers: authHeaders(config)
				});
				if (!res.ok) {
					throw new Error(`Jellyfin search failed: ${res.status}`);
				}
				const data = await res.json();
				const items = data?.Items || [];
				return {
					results: items.map((item) => {
						const imageId = primaryImageId(item);
						const server = item.ServerId ? `&serverId=${encodeURIComponent(item.ServerId)}` : '';
						return {
							id: item.Id,
							title: item.Name || 'Untitled',
							subtitle: subtitleFor(item),
							thumbnail: imageId
								? `/api/integrations/jellyfin/proxy/image/${encodeURIComponent(imageId)}`
								: undefined,
							href: `${base}/web/#/details?id=${encodeURIComponent(item.Id)}${server}`,
							meta: { kind: 'media' }
						};
					})
				};
			}
		}
	},

	proxy: {
		// Primary image (poster / cover) for an item, scaled down server-side.
		image: {
			defaultCacheControl: 'private, max-age=86400',
			async fetch({ config, params, request, fetch }) {
				const base = stripTrailingSlash(config.url);
				const id = params.path?.[0];
				if (!id || !ITEM_ID.test(id)) {
					return new Response('Invalid item id', { status: 400 });
				}
				const requested = parseInt(new URL(request.url).searchParams.get('maxHeight') ?? '', 10);
				const maxHeight = Number.isNaN(requested) ? 120 : Math.min(Math.max(requested, 32), 600);
				return fetch(`${base}/Items/${id}/Images/Primary?maxHeight=${maxHeight}&quality=90`, {
					method: 'GET',
					headers: { Authorization: authHeaders(config).Authorization }
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
		Authorization: `MediaBrowser Token="${config.apiKey}"`,
		accept: 'application/json'
	};
}

// "Movie · 2019", "Episode · Severance S2E3", "Album · Artist · 2020"
function subtitleFor(item) {
	const parts = [ITEM_TYPES[item.Type] || item.Type];
	if (item.Type === 'Episode') {
		const se =
			item.ParentIndexNumber != null && item.IndexNumber != null
				? ` S${item.ParentIndexNumber}E${item.IndexNumber}`
				: '';
		if (item.SeriesName || se) parts.push(`${item.SeriesName || ''}${se}`.trim());
	} else if (item.Type === 'MusicAlbum' && item.AlbumArtist) {
		parts.push(item.AlbumArtist);
	}
	if (item.ProductionYear && item.Type !== 'Episode') parts.push(String(item.ProductionYear));
	return parts.filter(Boolean).join(' · ');
}

// Episodes often have no image of their own — fall back to the show's poster.
function primaryImageId(item) {
	if (item.ImageTags?.Primary) return item.Id;
	if (item.Type === 'Episode' && item.SeriesId && item.SeriesPrimaryImageTag) return item.SeriesId;
	return null;
}

export default adapter;
