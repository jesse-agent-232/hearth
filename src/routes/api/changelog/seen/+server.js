import { json } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/session.js';
import { getAuth } from '$lib/server/config.js';
import { setSeenVersion } from '$lib/server/db.js';
import { version } from '$lib/server/changelog.js';

// POST /api/changelog/seen — the user closed "What's new": record the
// running version, so it doesn't open again until the next one.
export async function POST({ cookies, url }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
	// With auth off everyone is the shared guest: the browser keeps it instead.
	if (getAuth().enabled) await setSeenVersion(user.username, version);
	return json({ ok: true, version });
}
