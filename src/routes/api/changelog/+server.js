import { json } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/session.js';
import { getAuth, getChangelogConfig } from '$lib/server/config.js';
import { getChangelogSeen, setChangelogSeen, isKnownUser, isDatabaseEnabled } from '$lib/server/db.js';
import { version, releases } from '$lib/server/changelog.js';
import { changelogFor } from '$lib/changelog.js';

// GET /api/changelog?seen=   → { version, show, releases, store }
// Whether this user should see "What's new", and the releases since the
// version they last closed it on. Signed-in users' last version is kept on
// the server; the shared guest (auth off) and a Holm without a database keep
// it in the browser and send it as `seen` (store: 'local').

export async function GET({ cookies, url }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
	const all = await releases();

	const local = !getAuth().enabled || !(await isDatabaseEnabled());
	const seenParam = url.searchParams.get('seen');
	const seen = local ? (seenParam && /^\d+\.\d+\.\d+$/.test(seenParam) ? seenParam : null) : await getChangelogSeen(user.username);
	// A browser with nothing stored is new to it; with a database, ask whether
	// this user has saved anything before.
	const known = local ? false : await isKnownUser(user.username);
	const result = changelogFor({ version, seen, known, enabled: getChangelogConfig().enabled, releases: all });
	// Only a user who's new is recorded here; anyone else on Close.
	if (result.record && !local) await setChangelogSeen(user.username, version);
	return json({ version, show: result.show, releases: result.releases, record: result.record, store: local ? 'local' : 'server' });
}
