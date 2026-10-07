// Plex integration adapter.
//
// Surfaces:
//   - searchProviders.media — searches movies, shows, artists and albums
//
// Auth is Plex's PIN flow: Holm shows a code, the user enters it at
// plex.tv/link while signed in to Plex, and Holm receives that account's
// token. Holm trades it straight away for the access token of the one server
// at the configured URL and keeps only that. For a server shared with the
// user, that is a server-only token. For a server the user owns, Plex hands
// back the account token itself, so the stored row is as sensitive as the
// Plex account. Revoking means removing the "Holm" device in Plex.

const PLEX_TV = 'https://plex.tv';

// Hub types searched, and how each one reads in the subtitle. Episodes and
// tracks are left out: a title search matches dozens of them.
const ITEM_TYPES = {
	movie: 'Movie',
	show: 'Show',
	artist: 'Artist',
	album: 'Album'
};

// Posters render 174 CSS px tall; 3x covers phone screens.
const POSTER_HEIGHT = 520;

const THUMB = /^\/library\/metadata\/(\d+)\/thumb\/(\d+)$/;
const ART = /^\/library\/metadata\/(\d+)\/art\/(\d+)$/;
const VIDEO_TYPES = new Set(['movie', 'show']);
const DIGITS = /^\d+$/;

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'plex',
	name: 'Plex',
	icon: 'di:plex',
	shortcut: 'plex',
	description: 'Media server — search movies, shows and music',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Plex URL',
			required: true,
			placeholder: 'https://plex.example.com',
			help: 'Base URL of your Plex server',
			fromOperatorDefault: 'default_url'
		},
		// Filled in by the PIN flow, never typed.
		{ key: 'accessToken', type: 'secret', label: 'Access token', required: true, hidden: true },
		{ key: 'machineId', type: 'text', label: 'Server id', hidden: true },
		{ key: 'clientId', type: 'text', label: 'Client id', hidden: true },
		{ key: 'userName', type: 'text', label: 'User', hidden: true }
	],

	signIn: {
		label: 'Sign in with Plex',
		help: 'Go to [plex.tv/link](https://plex.tv/link), sign in to Plex if asked, and enter this code.',

		async start({ config, fetch }) {
			const base = stripTrailingSlash(config.url);
			// One client id per sign-in, so it shows as its own "Holm" entry
			// under Authorized Devices in Plex.
			const clientId = `holm-${crypto.randomUUID()}`;
			const identity = await fetch(`${base}/identity`, { headers: plexHeaders({ clientId }) });
			if (!identity.ok) return { error: `Plex returned ${identity.status} — is the URL right?` };
			const machineId = (await identity.json())?.MediaContainer?.machineIdentifier;
			if (!machineId) return { error: 'That URL didn’t answer like a Plex server' };

			const res = await fetch(`${PLEX_TV}/api/v2/pins`, { method: 'POST', headers: plexHeaders({ clientId }) });
			if (!res.ok) return { error: `Couldn’t get a code from plex.tv (${res.status})` };
			const pin = await res.json();
			if (!pin?.id || !pin?.code) return { error: 'plex.tv sent an unexpected reply' };
			return { code: String(pin.code), link: `${PLEX_TV}/link`, state: { pinId: pin.id, clientId, machineId } };
		},

		async poll({ state, fetch }) {
			const headers = plexHeaders({ clientId: state.clientId });
			const res = await fetch(`${PLEX_TV}/api/v2/pins/${encodeURIComponent(state.pinId)}`, { headers });
			if (res.status === 404) return { status: 'error', error: 'The code expired — start again' };
			if (!res.ok) return { status: 'error', error: `plex.tv returned ${res.status}` };
			const accountToken = (await res.json())?.authToken;
			if (!accountToken) return { status: 'pending' };

			const signedIn = plexHeaders({ clientId: state.clientId, token: accountToken });
			const resources = await fetch(`${PLEX_TV}/api/v2/resources?includeHttps=1`, { headers: signedIn });
			if (!resources.ok) return { status: 'error', error: `Couldn’t list your Plex servers (${resources.status})` };
			const server = ((await resources.json()) || []).find((r) => r?.clientIdentifier === state.machineId);
			if (!server?.accessToken) {
				return { status: 'error', error: 'This Plex account has no access to that server' };
			}
			const user = await fetch(`${PLEX_TV}/api/v2/user`, { headers: signedIn });
			const me = user.ok ? await user.json() : null;
			return {
				status: 'done',
				// Seerr checks the account token with plex.tv, and for a shared
				// server the stored token is server-only, so lend it the account
				// token for this one connect.
				forLinked: { accessToken: accountToken },
				config: {
					accessToken: server.accessToken,
					machineId: state.machineId,
					clientId: state.clientId,
					userName: me?.username || me?.title || ''
				}
			};
		}
	},

	async test({ config, fetch }) {
		if (!config?.url || !config?.accessToken) {
			return { ok: false, message: 'Sign in with Plex first' };
		}
		const base = stripTrailingSlash(config.url);
		try {
			const res = await fetch(`${base}/library/sections`, { headers: plexHeaders({ ...config, token: config.accessToken }) });
			if (!res.ok) {
				if (res.status === 401 || res.status === 403) {
					return { ok: false, message: 'Plex no longer accepts this sign-in — sign in again' };
				}
				return { ok: false, message: `Server returned ${res.status} ${res.statusText}` };
			}
			return { ok: true, message: `Signed in as ${config.userName || 'Plex user'}` };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		media: {
			label: 'Media',
			kind: 'media',
			shelf: 'video',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.accessToken) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				const max = Math.min(limit || 10, 25);
				// Results come back grouped into hubs, one per type; limit is per hub.
				const params = new URLSearchParams({ query: trimmed, limit: String(max), includeGuids: '1' });
				const res = await fetch(`${base}/hubs/search?${params}`, {
					headers: plexHeaders({ ...config, token: config.accessToken })
				});
				if (!res.ok) {
					throw new Error(`Plex search failed: ${res.status}`);
				}
				const data = await res.json();
				const items = (data?.MediaContainer?.Hub || [])
					.filter((hub) => ITEM_TYPES[hub.type])
					.flatMap((hub) => hub.Metadata || [])
					.filter((item) => ITEM_TYPES[item.type] && DIGITS.test(String(item.ratingKey)))
					.slice(0, max);
				return {
					results: items.map((item) => {
						const thumb = THUMB.exec(item.thumb || '');
						const key = encodeURIComponent(`/library/metadata/${item.ratingKey}`);
						return {
							id: String(item.ratingKey),
							title: item.title || 'Untitled',
							subtitle: subtitleFor(item),
							thumbnail: thumb
								? `/api/integrations/plex/proxy/image/${thumb[1]}/${thumb[2]}`
								: undefined,
							href: `${base}/web/index.html#!/server/${encodeURIComponent(config.machineId || '')}/details?key=${key}`,
							// Movies and shows open a detail view; Play is its button.
							...(VIDEO_TYPES.has(item.type) ? { openLabel: 'Play', detail: { ratingKey: String(item.ratingKey) } } : {}),
							meta: { kind: 'media', tmdb: tmdbKey(item) }
						};
					})
				};
			}
		}
	},

	async details({ config, params, fetch }) {
		const ratingKey = params?.ratingKey;
		if (typeof ratingKey !== 'string' || !DIGITS.test(ratingKey)) return null;
		const base = stripTrailingSlash(config.url);
		const res = await fetch(`${base}/library/metadata/${ratingKey}`, {
			headers: plexHeaders({ ...config, token: config.accessToken })
		});
		if (!res.ok) throw new Error(`Plex returned ${res.status}`);
		const item = (await res.json())?.MediaContainer?.Metadata?.[0];
		if (!VIDEO_TYPES.has(item?.type)) return null;
		const minutes = item.duration ? Math.round(item.duration / 60000) : 0;
		const seasons = item.type === 'show' && item.childCount ? `${item.childCount} season${item.childCount === 1 ? '' : 's'}` : '';
		const thumb = THUMB.exec(item.thumb || '');
		const art = ART.exec(item.art || '');
		const rating = item.audienceRating || item.rating;
		return {
			title: item.title || 'Untitled',
			facts: [ITEM_TYPES[item.type], item.year && String(item.year), seasons, formatRuntime(minutes)].filter(Boolean),
			rating: rating ? Math.round(rating * 10) / 10 : null,
			genres: (item.Genre || []).map((g) => g?.tag).filter(Boolean).slice(0, 4),
			tagline: item.tagline || '',
			overview: item.summary || '',
			cast: (item.Role || []).map((r) => r?.tag).filter(Boolean).slice(0, 8),
			thumbnail: thumb ? `/api/integrations/plex/proxy/image/${thumb[1]}/${thumb[2]}` : undefined,
			backdrop: art ? `/api/integrations/plex/proxy/art/${art[1]}/${art[2]}` : undefined
		};
	},

	proxy: {
		// Background art for the detail view.
		art: {
			defaultCacheControl: 'private, max-age=86400',
			async fetch({ config, params, fetch }) {
				const [ratingKey, version] = params.path || [];
				if (params.path?.length !== 2 || !DIGITS.test(ratingKey || '') || !DIGITS.test(version || '')) {
					return new Response('Invalid image id', { status: 400 });
				}
				const qs = new URLSearchParams({
					url: `/library/metadata/${ratingKey}/art/${version}`,
					width: '780',
					height: '439',
					minSize: '1'
				});
				return fetch(`${stripTrailingSlash(config.url)}/photo/:/transcode?${qs}`, {
					headers: { 'X-Plex-Token': config.accessToken }
				});
			}
		},
		// Poster / cover for an item, scaled down by Plex's transcoder.
		image: {
			defaultCacheControl: 'private, max-age=86400',
			async fetch({ config, params, fetch }) {
				const base = stripTrailingSlash(config.url);
				const [ratingKey, version] = params.path || [];
				if (!DIGITS.test(ratingKey || '') || !DIGITS.test(version || '')) {
					return new Response('Invalid image id', { status: 400 });
				}
				const qs = new URLSearchParams({
					url: `/library/metadata/${ratingKey}/thumb/${version}`,
					width: String(Math.round((POSTER_HEIGHT * 2) / 3)),
					height: String(POSTER_HEIGHT),
					minSize: '1'
				});
				return fetch(`${base}/photo/:/transcode?${qs}`, {
					headers: { 'X-Plex-Token': config.accessToken }
				});
			}
		}
	},

	widgets: {}
};

function formatRuntime(minutes) {
	if (!minutes) return '';
	const h = Math.floor(minutes / 60);
	return h ? `${h}h ${minutes % 60}m` : `${minutes}m`;
}

function stripTrailingSlash(url) {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

// plex.tv and the server both want client details on every call.
function plexHeaders({ clientId, token }) {
	const headers = {
		accept: 'application/json',
		'X-Plex-Product': 'Holm',
		'X-Plex-Device-Name': 'Holm',
		'X-Plex-Client-Identifier': clientId || 'holm'
	};
	if (token) headers['X-Plex-Token'] = token;
	return headers;
}

// Lets a Seerr result for the same title stand in for this one.
function tmdbKey(item) {
	const type = item.type === 'movie' ? 'movie' : item.type === 'show' ? 'tv' : null;
	const guid = (item.Guid || []).map((g) => /^tmdb:\/\/(\d+)$/.exec(g?.id || '')).find(Boolean);
	return type && guid ? `${type}:${guid[1]}` : undefined;
}

// "Movie · 2019", "Album · Artist · 2020"
function subtitleFor(item) {
	const parts = [ITEM_TYPES[item.type]];
	if (item.type === 'album' && item.parentTitle) parts.push(item.parentTitle);
	if (item.year) parts.push(String(item.year));
	return parts.filter(Boolean).join(' · ');
}

export default adapter;
