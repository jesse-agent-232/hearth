import { json } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/session.js';
import { getAdapter } from '$lib/server/integrations/index.js';
import { getConnection } from '$lib/server/integrations/store.js';
import { withDeadline, describeFetchError } from '$lib/server/integrations/deadline.js';
import { adapterContext } from '$lib/server/integrations/linked.js';

const DETAILS_TIMEOUT_MS = 8000;

// POST /api/integrations/:id/details   body: { params }
//
// Fetches the detail view for a search result that carries `detail` (e.g. a
// Seerr title's overview and backdrop), with the user's stored credentials.
// The params come from the browser, so the adapter validates them.

export async function POST({ cookies, url, request, params, fetch }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const adapter = getAdapter(params.id);
	if (!adapter) return json({ error: 'Unknown integration' }, { status: 404 });
	if (!adapter.details) return json({ error: 'No details for this integration' }, { status: 404 });

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
		const details = await adapter.details({
			...(await adapterContext(user.username, adapter, conn)),
			config: conn.config,
			params: body?.params && typeof body.params === 'object' ? body.params : {},
			fetch: withDeadline(fetch, DETAILS_TIMEOUT_MS)
		});
		if (!details) return json({ error: 'Invalid title' }, { status: 400 });
		return json({ details });
	} catch (err) {
		return json({ error: describeFetchError(err, DETAILS_TIMEOUT_MS) }, { status: 502 });
	}
}
