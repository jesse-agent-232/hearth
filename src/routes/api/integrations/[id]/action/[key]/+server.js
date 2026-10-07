import { json } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/session.js';
import { getAdapter } from '$lib/server/integrations/index.js';
import { getConnection } from '$lib/server/integrations/store.js';
import { withDeadline, describeFetchError } from '$lib/server/integrations/deadline.js';
import { adapterContext } from '$lib/server/integrations/linked.js';

const ACTION_TIMEOUT_MS = 15000;

// POST /api/integrations/:id/action/:key   body: { params }
//
// Runs one of the adapter's `actions` (e.g. Seerr's request) with the user's
// stored credentials, for a search result that carries `action`. The params
// come from the browser, so each action validates its own.

export async function POST({ cookies, url, request, params, fetch }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const adapter = getAdapter(params.id);
	if (!adapter) return json({ error: 'Unknown integration' }, { status: 404 });
	const action = adapter.actions?.[params.key];
	if (!action) return json({ error: 'Unknown action' }, { status: 404 });

	let body;
	try {
		const text = await request.text();
		if (text.length > 4096) return json({ error: 'Payload too large' }, { status: 413 });
		body = JSON.parse(text);
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const conn = await getConnection(user.username, adapter.id);
	if (!conn?.connected) return json({ error: 'Integration not connected' }, { status: 409 });

	try {
		const result = await action.run({
			...(await adapterContext(user.username, adapter, conn)),
			config: conn.config,
			params: body?.params && typeof body.params === 'object' ? body.params : {},
			fetch: withDeadline(fetch, ACTION_TIMEOUT_MS)
		});
		return json({ ok: !!result?.ok, message: result?.message || (result?.ok ? 'Done' : 'Failed') });
	} catch (err) {
		return json({ ok: false, message: describeFetchError(err, ACTION_TIMEOUT_MS) }, { status: 502 });
	}
}
