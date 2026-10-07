import { json } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/session.js';
import { getRegistry } from '$lib/server/integrations/index.js';
import { listConnections } from '$lib/server/integrations/store.js';
import { redactConfig, adapterToClient } from '$lib/server/integrations/serialize.js';
import { autoConnect } from '$lib/server/integrations/linked.js';
import { withDeadline } from '$lib/server/integrations/deadline.js';

// GET /api/integrations
// Returns the list of operator-enabled integrations along with each user's
// per-integration connection state. Secret fields are redacted to bullets so
// the API key never leaves the server.

export async function GET({ cookies, url, fetch }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	// Connect integrations that sign in through another one (Seerr through
	// Jellyfin or Plex) before listing, so they show up already connected.
	await autoConnect(user.username, withDeadline(fetch, 5000));

	const registry = getRegistry();
	const connections = user ? await listConnections(user.username) : [];
	const byId = new Map(connections.map((c) => [c.integrationId, c]));

	const integrations = registry.map(({ adapter, icon, operator, availableSurfaces }) => {
		const conn = byId.get(adapter.id);
		return {
			...adapterToClient(adapter, { icon, name: operator?.name, tip: operator?.tip, shortcut: operator?.shortcut }),
			operatorDefaults: pickOperatorDefaults(adapter, operator),
			availableSurfaces,
			userState: {
				connected: !!conn?.connected,
				config: conn?.connected ? redactConfig(adapter, conn.config) : {},
				surfaces: conn?.surfaces || {}
			}
		};
	});

	return json({ integrations });
}

function pickOperatorDefaults(adapter, operator) {
	const out = {};
	if (!operator) return out;
	for (const field of adapter.configSchema || []) {
		if (field.fromOperatorDefault && operator[field.fromOperatorDefault] != null) {
			out[field.key] = operator[field.fromOperatorDefault];
		}
	}
	return out;
}
