// Seerr (formerly Jellyseerr / Overseerr) integration adapter.
//
// Surfaces:
//   - searchProviders.requests — TMDB search via Seerr. A title that is on
//     the media server opens there ("Play"); one that isn't can be requested
//     straight from the search bar.
//   - actions.request — files a request as the signed-in user
//
// Auth is a Seerr session, never an admin API key, so requests, quotas and
// approvals belong to the real user. Users who connected Jellyfin or Plex in
// Holm never see a Seerr sign-in: `connectFromLinked` starts Seerr's
// Jellyfin Quick Connect and approves the code with the user's own Jellyfin
// token, or hands Seerr the user's Plex token. When the 30-day session
// lapses, the same path renews it. Anyone else signs in with a Quick Connect
// code once.

// MediaStatus from server/constants/media.ts. A result with no mediaInfo has
// never been requested.
const STATUS = { UNKNOWN: 1, PENDING: 2, PROCESSING: 3, PARTIAL: 4, AVAILABLE: 5, BLOCKLISTED: 6, DELETED: 7 };
// Pending and processing titles show as requested on the poster instead.
const STATUS_LABEL = {
	[STATUS.PARTIAL]: 'Partly available',
	[STATUS.AVAILABLE]: 'Available',
	[STATUS.BLOCKLISTED]: 'Blocklisted'
};

// MediaServerType from server/constants/server.ts.
const SERVER = { PLEX: 1, JELLYFIN: 2, EMBY: 3 };

const MEDIA_LABEL = { movie: 'Movie', tv: 'Show' };

// TMDB poster paths look like "/abc123.jpg".
const POSTER_PATH = /^\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/;

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'seerr',
	name: 'Seerr',
	icon: 'di:jellyseerr',
	shortcut: 'sr',
	description: 'Media requests — play what is there, request what is not',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Seerr URL',
			required: true,
			placeholder: 'https://seerr.example.com',
			help: 'Base URL of your Seerr server',
			fromOperatorDefault: 'default_url'
		},
		// Filled in by sign-in, never typed.
		{ key: 'session', type: 'secret', label: 'Session', required: true, hidden: true },
		{ key: 'via', type: 'text', label: 'Signed in via', hidden: true },
		{ key: 'userName', type: 'text', label: 'User', hidden: true }
	],

	linkedTo: ['jellyfin', 'plex'],

	async connectFromLinked({ config, linked, fetch }) {
		return (await sessionFromLinked(config, linked, fetch)) || null;
	},

	signIn: {
		// The route tries connectFromLinked first, so with Jellyfin or Plex
		// connected this signs in without showing a code.
		label: 'Sign in',
		help: 'In Jellyfin, open your **profile → Quick Connect** and enter this code. Connecting Jellyfin or Plex in Holm signs you in to Seerr automatically.',

		async start({ config, linked, fetch }) {
			const base = stripTrailingSlash(config.url);
			const type = await serverType(base, fetch);
			if (type == null) return { error: 'That URL didn’t answer like a Seerr server' };
			if (type !== SERVER.JELLYFIN) {
				// The route already tried the linked Plex token; Seerr only takes
				// the Plex server owner's.
				return {
					error: linked?.plex
						? 'Your Plex account can’t sign in to this Seerr — ask the admin to add you in Seerr'
						: 'This Seerr uses Plex — connect Plex in Holm and Seerr connects with it'
				};
			}
			const res = await fetch(`${base}/api/v1/auth/jellyfin/quickconnect/initiate`, { method: 'POST', headers: JSON_HEADERS });
			if (!res.ok) return { error: `Couldn’t start Quick Connect (${res.status})` };
			const data = await res.json();
			if (!data?.code || !data?.secret) return { error: 'Seerr sent an unexpected reply' };
			return { code: String(data.code), state: { secret: data.secret } };
		},

		async poll({ config, state, fetch }) {
			const base = stripTrailingSlash(config.url);
			const res = await fetch(`${base}/api/v1/auth/jellyfin/quickconnect/check?secret=${encodeURIComponent(state.secret)}`, {
				headers: JSON_HEADERS
			});
			if (res.status === 404) return { status: 'error', error: 'The code expired — start again' };
			if (!res.ok) return { status: 'error', error: `Seerr returned ${res.status}` };
			if (!(await res.json())?.authenticated) return { status: 'pending' };
			const session = await authenticate(base, 'jellyfin/quickconnect/authenticate', { secret: state.secret }, fetch);
			if (session.error) return { status: 'error', error: session.error };
			return { status: 'done', config: { session: session.cookie, via: 'seerr', userName: session.userName } };
		}
	},

	async test({ config, fetch }) {
		if (!config?.url || !config?.session) {
			return { ok: false, message: 'Connect Jellyfin or Plex, or sign in with Quick Connect' };
		}
		try {
			const res = await fetch(`${stripTrailingSlash(config.url)}/api/v1/auth/me`, { headers: sessionHeaders(config) });
			if (!res.ok) return { ok: false, message: 'Seerr session ended — sign in again' };
			return { ok: true, message: `Signed in as ${displayName(await res.json()) || config.userName || 'Seerr user'}` };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		requests: {
			label: 'Seerr',
			mode: 'inline',
			async query(ctx) {
				const { config, query, limit } = ctx;
				if (!config?.url || !config?.session) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				// Seerr's OpenAPI validator rejects any reserved character in
				// the query value, including `+` for a space, so URLSearchParams
				// won't do. encodeURIComponent leaves !'()* alone; escape those too.
				const res = await seerrFetch(ctx, `/api/v1/search?query=${strictEncode(trimmed)}&page=1`);
				if (!res.ok) {
					throw new Error(`Seerr search failed: ${res.status}`);
				}
				const data = await res.json();
				const items = (data?.results || []).filter(
					(r) => (r.mediaType === 'movie' || r.mediaType === 'tv') && Number.isInteger(r.id)
				);
				return {
					results: items.slice(0, Math.min(limit || 10, 20)).map((r) => {
						const title = r.mediaType === 'movie' ? r.title : r.name;
						const year = (r.mediaType === 'movie' ? r.releaseDate : r.firstAirDate)?.slice(0, 4);
						const status = r.mediaInfo?.status;
						const playUrl = (status === STATUS.AVAILABLE || status === STATUS.PARTIAL) && r.mediaInfo?.mediaUrl;
						const requestable = !r.mediaInfo || status === STATUS.UNKNOWN || status === STATUS.DELETED;
						const requested = status === STATUS.PENDING || status === STATUS.PROCESSING;
						return {
							id: `${r.mediaType}-${r.id}`,
							title: title || 'Untitled',
							subtitle: [MEDIA_LABEL[r.mediaType], year].filter(Boolean).join(' · '),
							// Proxied, so the browser only ever talks to Holm.
							thumbnail: POSTER_PATH.test(r.posterPath || '')
								? `/api/integrations/seerr/proxy/poster${r.posterPath}`
								: undefined,
							href: playUrl || `${base}/${r.mediaType}/${r.id}`,
							openLabel: playUrl ? 'Play' : 'Open in Seerr',
							action: requestable
								? { key: 'request', label: 'Request', params: { mediaType: r.mediaType, mediaId: r.id } }
								: undefined,
							meta: {
								kind: 'media',
								status: STATUS_LABEL[status] || '',
								requested,
								// Jellyfin and Plex results for the same title fold into this one.
								tmdb: `${r.mediaType}:${r.id}`,
								merge: true
							}
						};
					})
				};
			}
		}
	},

	actions: {
		request: {
			async run(ctx) {
				const { params } = ctx;
				const mediaType = params?.mediaType;
				const mediaId = params?.mediaId;
				if ((mediaType !== 'movie' && mediaType !== 'tv') || !Number.isInteger(mediaId) || mediaId <= 0) {
					return { ok: false, message: 'Invalid title' };
				}
				const body = { mediaType, mediaId, ...(mediaType === 'tv' ? { seasons: 'all' } : {}) };
				const res = await seerrFetch(ctx, '/api/v1/request', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(body)
				});
				const data = await res.json().catch(() => null);
				if (!res.ok) {
					return { ok: false, message: data?.message || `Seerr returned ${res.status}` };
				}
				// Pending approval or already approved, the poster shows it as
				// requested either way.
				return { ok: true, message: 'Requested' };
			}
		}
	},

	proxy: {
		// TMDB poster, fetched server-side from a fixed host.
		poster: {
			defaultCacheControl: 'private, max-age=604800',
			async fetch({ params, fetch }) {
				const path = '/' + (params.path?.[0] || '');
				if (params.path?.length !== 1 || !POSTER_PATH.test(path)) {
					return new Response('Invalid poster path', { status: 400 });
				}
				return fetch(`https://image.tmdb.org/t/p/w185${path}`, { method: 'GET' });
			}
		}
	},

	widgets: {}
};

const JSON_HEADERS = { accept: 'application/json' };

function stripTrailingSlash(url) {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

function sessionHeaders(config) {
	return { ...JSON_HEADERS, cookie: config.session };
}

function displayName(user) {
	return user?.displayName || user?.jellyfinUsername || user?.plexUsername || user?.username || '';
}

async function serverType(base, fetch) {
	const res = await fetch(`${base}/api/v1/settings/public`, { headers: JSON_HEADERS });
	if (!res.ok) return null;
	return (await res.json())?.mediaServerType ?? null;
}

// Signs in to Seerr as the user behind a linked Jellyfin or Plex connection.
// Returns the config to store, or null when no linked account fits.
async function sessionFromLinked(config, linked, fetch) {
	const base = stripTrailingSlash(config.url);
	const type = await serverType(base, fetch);
	let session = null;
	let via = '';
	if (type === SERVER.JELLYFIN && linked?.jellyfin?.accessToken) {
		const jf = linked.jellyfin;
		const res = await fetch(`${base}/api/v1/auth/jellyfin/quickconnect/initiate`, { method: 'POST', headers: JSON_HEADERS });
		if (!res.ok) return null;
		const { code, secret } = (await res.json()) || {};
		if (!code || !secret) return null;
		// The user's own Jellyfin token approves the code, as if they had
		// typed it under Quick Connect themselves.
		const ok = await fetch(`${stripTrailingSlash(jf.url)}/QuickConnect/Authorize?code=${encodeURIComponent(code)}`, {
			method: 'POST',
			headers: jellyfinHeaders(jf)
		});
		if (!ok.ok) return null;
		session = await authenticate(base, 'jellyfin/quickconnect/authenticate', { secret }, fetch);
		via = 'jellyfin';
	} else if (type === SERVER.PLEX && linked?.plex?.accessToken) {
		// Seerr checks the token with plex.tv, so this only works when it is the
		// account token, i.e. for the server's owner. Others fall back to signIn.
		session = await authenticate(base, 'plex', { authToken: linked.plex.accessToken }, fetch);
		via = 'plex';
	}
	if (!session || session.error) return null;
	return { ...config, session: session.cookie, via, userName: session.userName };
}

async function authenticate(base, path, body, fetch) {
	const res = await fetch(`${base}/api/v1/auth/${path}`, {
		method: 'POST',
		headers: { ...JSON_HEADERS, 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		if (res.status === 403) return { error: 'Seerr has no account for you — ask the admin to import your user' };
		return { error: `Seerr sign-in failed (${res.status})` };
	}
	const cookie = (res.headers.getSetCookie?.() || [])
		.map((c) => c.split(';')[0])
		.filter(Boolean)
		.join('; ');
	if (!cookie) return { error: 'Seerr didn’t start a session' };
	return { cookie, userName: displayName(await res.json().catch(() => null)) };
}

// Calls Seerr with the stored session. If it has lapsed and the user signed
// in through a linked Jellyfin or Plex account, signs in again, saves the new
// session and retries once.
async function seerrFetch(ctx, path, init = {}) {
	const { config, fetch } = ctx;
	const base = stripTrailingSlash(config.url);
	const call = (cfg) => fetch(`${base}${path}`, { ...init, headers: { ...sessionHeaders(cfg), ...(init.headers || {}) } });
	const res = await call(config);
	if (res.status !== 401 && res.status !== 403) return res;
	// A 403 is also "not allowed"; only renew when the session itself is gone.
	const me = await fetch(`${base}/api/v1/auth/me`, { headers: sessionHeaders(config) });
	if (me.ok) return res;
	const renewed = config.via !== 'seerr' && (await renewOnce(config, ctx.linked, fetch));
	if (!renewed) throw new Error('Seerr session ended — sign in again in Settings → Integrations');
	await ctx.saveConfig?.(renewed);
	return call(renewed);
}

// While a session is expired every keystroke's search would renew it, each
// approving another Quick Connect code. Calls holding the same lapsed session
// share one renewal instead.
const renewing = new Map();

function renewOnce(config, linked, fetch) {
	let p = renewing.get(config.session);
	if (!p) {
		p = sessionFromLinked(config, linked, fetch).finally(() => renewing.delete(config.session));
		renewing.set(config.session, p);
	}
	return p;
}

// Same header shape as the Jellyfin adapter's, for the Quick Connect approval.
function jellyfinHeaders({ deviceId, accessToken }) {
	const safe = (v) => String(v).replace(/[^A-Za-z0-9_-]/g, '');
	const parts = [`Client="Holm"`, `Device="Holm"`, `DeviceId="${safe(deviceId || 'holm')}"`, `Version="1.0"`, `Token="${safe(accessToken)}"`];
	return { Authorization: `MediaBrowser ${parts.join(', ')}`, accept: 'application/json' };
}

function strictEncode(value) {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
	);
}

export default adapter;
