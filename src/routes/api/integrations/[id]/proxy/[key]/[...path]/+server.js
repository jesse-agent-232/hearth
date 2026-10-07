import { error } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/session.js';
import { getAdapter } from '$lib/server/integrations/index.js';
import { getConnection } from '$lib/server/integrations/store.js';
import { withDeadline, describeFetchError } from '$lib/server/integrations/deadline.js';
import { isProxiedMedia } from '$lib/server/integrations/proxyMedia.js';

// GET /api/integrations/:id/proxy/:key/*
//
// Generic byte-streaming proxy. Adapters expose handlers in their `proxy`
// map (e.g. immich.proxy.thumbnail). The handler returns an upstream
// Response and we stream it back to the browser with the original
// content-type. The browser never sees the integration's credentials —
// they're loaded from the user's encrypted store and stay server-side.
//
// Headers preserved from upstream: content-type, content-length,
// content-range, accept-ranges (so audio can be fetched in ranges), etag,
// last-modified, cache-control. If upstream omits cache-control we fall
// back to the handler's defaultCacheControl.

// Covers streaming the body too: these are thumbnails, not downloads. A
// `stream` handler (audio) gets it for the response headers only.
const PROXY_TIMEOUT_MS = 20000;

const PASS_THROUGH_HEADERS = [
	'content-type',
	'content-length',
	'content-range',
	'accept-ranges',
	'etag',
	'last-modified',
	'cache-control'
];

// Aborts if no response arrives in time; `clear` lifts the deadline once the
// headers are in, and the body then runs until the browser drops it.
function headersDeadline(fetch, ms, parentSignal) {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(new DOMException('Timed out', 'TimeoutError')), ms);
	const signals = parentSignal ? [ctl.signal, parentSignal] : [ctl.signal];
	return {
		fetch: (input, init = {}) =>
			fetch(input, { ...init, signal: AbortSignal.any(init.signal ? [...signals, init.signal] : signals) }),
		clear: () => clearTimeout(timer)
	};
}

export async function GET({ cookies, url, params, request, fetch }) {
	const user = getSessionUser(cookies, url);
	if (!user) throw error(401, 'Unauthorized');

	const adapter = getAdapter(params.id);
	if (!adapter) throw error(404, 'Unknown integration');

	const handler = adapter.proxy?.[params.key];
	if (!handler || typeof handler.fetch !== 'function') {
		throw error(404, 'Unknown proxy handler');
	}

	const conn = await getConnection(user.username, adapter.id);
	if (!conn?.connected) throw error(409, 'Integration not connected');

	const segments = (params.path || '').split('/').filter(Boolean);

	const deadline = handler.stream
		? headersDeadline(fetch, PROXY_TIMEOUT_MS, request.signal)
		: { fetch: withDeadline(fetch, PROXY_TIMEOUT_MS, request.signal), clear: () => {} };
	let upstream;
	try {
		upstream = await handler.fetch({
			config: conn.config,
			params: { path: segments },
			request,
			fetch: deadline.fetch
		});
	} catch (err) {
		throw error(502, `Proxy handler failed: ${describeFetchError(err, PROXY_TIMEOUT_MS)}`);
	} finally {
		deadline.clear();
	}

	if (!upstream || typeof upstream.status !== 'number') {
		throw error(502, 'Proxy handler returned invalid response');
	}

	// Replies are served from Holm's own origin, so only media passes:
	// anything else (an HTML error page, say) could run as Holm.
	if (upstream.status !== 304 && !isProxiedMedia(upstream.headers.get('content-type'))) {
		await upstream.body?.cancel().catch(() => {});
		throw error(502, 'Upstream did not return an image or audio');
	}

	const headers = new Headers({
		'x-content-type-options': 'nosniff',
		// An SVG opened on its own can't run script or load anything.
		'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
	});
	for (const name of PASS_THROUGH_HEADERS) {
		const v = upstream.headers.get(name);
		if (v) headers.set(name, v);
	}
	if (!headers.has('cache-control') && handler.defaultCacheControl) {
		headers.set('cache-control', handler.defaultCacheControl);
	}

	return new Response(upstream.body, { status: upstream.status, headers });
}
