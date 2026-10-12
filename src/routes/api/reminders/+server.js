import { json } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/session.js';
import { getRegistry } from '$lib/server/integrations/index.js';
import { getConnection } from '$lib/server/integrations/store.js';
import { withDeadline } from '$lib/server/integrations/deadline.js';
import { validZone } from '$lib/server/integrations/ical.js';

// GET /api/reminders?tz=<IANA zone>
//
// Reminders due soon from every connected integration that has a
// `reminders` function and its widgets switched on (the Calendar). The page
// asks every few minutes and shows each one when it falls due. A short
// per-user cache keeps several open tabs from each crawling the calendars.

const CACHE_MS = 4 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 20000;
const cache = new Map();

export async function GET({ cookies, url, fetch }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const tz = url.searchParams.get('tz');
	const timeZone = validZone(tz) ? tz : 'UTC';

	const sources = [];
	for (const { adapter, availableSurfaces } of getRegistry()) {
		if (!adapter.reminders || !availableSurfaces.includes('widgets')) continue;
		const conn = await getConnection(user.username, adapter.id);
		if (conn?.connected && conn.surfaces?.widgets === true) sources.push({ adapter, conn });
	}
	if (sources.length === 0) return json({ reminders: [] });

	const key = `${user.username}\n${timeZone}\n${sources.map((s) => `${s.adapter.id}@${s.conn.updatedAt}`).join(',')}`;
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < CACHE_MS) return json({ reminders: hit.reminders });

	const lists = await Promise.all(
		sources.map(({ adapter, conn }) =>
			adapter
				.reminders({ config: conn.config, fetch: withDeadline(fetch, UPSTREAM_TIMEOUT_MS), timeZone })
				.catch((err) => {
					console.error(`[reminders] ${adapter.id}:`, err?.message || err);
					return [];
				})
		)
	);
	const reminders = lists.flat().sort((a, b) => a.at - b.at);
	for (const [k, v] of cache) if (Date.now() - v.at >= CACHE_MS) cache.delete(k);
	cache.set(key, { at: Date.now(), reminders });
	return json({ reminders });
}
