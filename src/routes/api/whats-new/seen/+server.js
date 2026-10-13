import { json } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/session.js';
import { setSeenVersion } from '$lib/server/db.js';
import { version } from '$lib/server/whatsNew.js';

// POST /api/whats-new/seen — the user closed "What's new": record the
// running version, so it doesn't open again until the next one.
export async function POST({ cookies, url }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
	if (user.username !== 'guest') await setSeenVersion(user.username, version);
	return json({ ok: true, version });
}
