import { json } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/session.js';
import { getRegistry } from '$lib/server/integrations/index.js';
import { getConnection } from '$lib/server/integrations/store.js';
import { withDeadline } from '$lib/server/integrations/deadline.js';
import { validZone } from '$lib/server/integrations/ical.js';

// What GET /api/reminders and GET /api/upcoming share: ask every connected
// integration that has the `hook` function and its widgets switched on (the
// Calendar), in the browser's time zone, and merge the lists. The page asks
// every few minutes; a short per-user cache keeps several open tabs from each
// crawling the calendars.

const CACHE_MS = 4 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 20000;
const caches = new Map();

export async function widgetFeed(hook, { cookies, url, fetch }, sortKey) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const tz = url.searchParams.get('tz');
	const timeZone = validZone(tz) ? tz : 'UTC';

	const sources = [];
	for (const { adapter, availableSurfaces } of getRegistry()) {
		if (!adapter[hook] || !availableSurfaces.includes('widgets')) continue;
		const conn = await getConnection(user.username, adapter.id);
		if (conn?.connected && conn.surfaces?.widgets === true) sources.push({ adapter, conn });
	}
	if (sources.length === 0) return json({ [hook]: [] });

	if (!caches.has(hook)) caches.set(hook, new Map());
	const cache = caches.get(hook);
	const key = `${user.username}\n${timeZone}\n${sources.map((s) => `${s.adapter.id}@${s.conn.updatedAt}`).join(',')}`;
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < CACHE_MS) return json({ [hook]: hit.items });

	const lists = await Promise.all(
		sources.map(({ adapter, conn }) =>
			adapter[hook]({ config: conn.config, fetch: withDeadline(fetch, UPSTREAM_TIMEOUT_MS), timeZone })
				// Which integration each came from, for its details.
				.then((list) => list.map((item) => ({ ...item, integrationId: adapter.id })))
				.catch((err) => {
					console.error(`[${hook}] ${adapter.id}:`, err?.message || err);
					return [];
				})
		)
	);
	const items = lists.flat().sort((a, b) => a[sortKey] - b[sortKey]);
	for (const [k, v] of cache) if (Date.now() - v.at >= CACHE_MS) cache.delete(k);
	cache.set(key, { at: Date.now(), items });
	return json({ [hook]: items });
}
