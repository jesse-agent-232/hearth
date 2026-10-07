// Integrations that sign in through another one (Seerr through Jellyfin or
// Plex). An adapter opts in with `linkedTo` (the ids it can borrow a
// connection from) and `connectFromLinked`. Holm then connects it for the user
// without asking, and hands it the linked configs on every call so it can
// renew its own session.

import { getRegistry } from './index.js';
import { getConnection, upsertConnection } from './store.js';

// A failed automatic connect (e.g. no Seerr account for this user) is not
// retried on every page load.
const RETRY_AFTER_MS = 10 * 60 * 1000;
const failedAt = new Map();

/** Configs of the connected integrations an adapter is linked to, by id. */
export async function linkedConfigs(username, adapter) {
	const out = {};
	for (const id of adapter.linkedTo || []) {
		const conn = await getConnection(username, id);
		if (conn?.connected) out[id] = conn.config;
	}
	return out;
}

/**
 * The extra context adapter calls get: linked configs, and a way to save a
 * renewed config (e.g. a fresh session) without touching the user's surfaces.
 */
export async function adapterContext(username, adapter, conn) {
	if (!adapter.linkedTo) return {};
	return {
		linked: await linkedConfigs(username, adapter),
		saveConfig: (config) => upsertConnection(username, adapter.id, { config, surfaces: conn?.surfaces || { search: true } })
	};
}

/**
 * Connects every enabled linked integration the user has no row for yet.
 * A row that exists but is empty means the user disconnected it, so it is
 * left alone. Best effort: failures are remembered and skipped for a while.
 */
export async function autoConnect(username, fetch) {
	for (const { adapter, operator } of getRegistry()) {
		if (!adapter.connectFromLinked) continue;
		const key = `${username}\n${adapter.id}`;
		if (Date.now() - (failedAt.get(key) || 0) < RETRY_AFTER_MS) continue;
		if (await getConnection(username, adapter.id)) continue;

		const config = {};
		for (const field of adapter.configSchema || []) {
			if (field.fromOperatorDefault && operator?.[field.fromOperatorDefault]) {
				config[field.key] = String(operator[field.fromOperatorDefault]);
			}
		}
		if (!config.url) continue;
		const linked = await linkedConfigs(username, adapter);
		if (!Object.keys(linked).length) continue;

		try {
			const connected = await adapter.connectFromLinked({ config, linked, fetch });
			if (connected) {
				await upsertConnection(username, adapter.id, { config: connected, surfaces: { search: true } });
				failedAt.delete(key);
				continue;
			}
		} catch {
			/* fall through */
		}
		failedAt.set(key, Date.now());
	}
}
