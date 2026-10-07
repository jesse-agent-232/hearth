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

/**
 * Configs of the connected integrations an adapter is linked to, by id.
 * Empty unless the adapter points at the operator's own server: a user-typed
 * URL never gets to sign in with the user's Jellyfin or Plex account.
 * `fresh` overrides a stored config for this call only (e.g. the Plex account
 * token from a sign-in that just finished, which is never stored).
 */
export async function linkedConfigs(username, adapter, config, fresh = {}) {
	const out = {};
	if (!matchesOperator(adapter, config)) return out;
	for (const id of adapter.linkedTo || []) {
		if (fresh[id]) {
			out[id] = fresh[id];
			continue;
		}
		const conn = await getConnection(username, id);
		if (conn?.connected) out[id] = conn.config;
	}
	return out;
}

/**
 * The extra context adapter calls get: linked configs, and a way to save a
 * renewed config (e.g. a fresh session) without touching the user's surfaces.
 */
export async function adapterContext(username, adapter, conn, config = conn?.config) {
	if (!adapter.linkedTo) return {};
	return {
		linked: await linkedConfigs(username, adapter, config),
		saveConfig: (config) => upsertConnection(username, adapter.id, { config, surfaces: conn?.surfaces || { search: true } })
	};
}

/**
 * Connects every enabled linked integration the user has no row for yet.
 * A row that exists but is empty means the user disconnected it, so it is
 * left alone, until they sign in to one of its linked integrations again
 * (`signedIn`: the id just connected), which asks for it afresh. Best
 * effort: failures are remembered and skipped for a while, except right
 * after such a sign-in. `fresh` overrides a linked config for this call.
 */
export async function autoConnect(username, fetch, { fresh = {}, signedIn = null } = {}) {
	for (const { adapter, operator } of getRegistry()) {
		if (!adapter.connectFromLinked) continue;
		const key = `${username}\n${adapter.id}`;
		const justLinked = !!signedIn && (adapter.linkedTo || []).includes(signedIn);
		if (!justLinked && Date.now() - (failedAt.get(key) || 0) < RETRY_AFTER_MS) continue;
		const existing = await getConnection(username, adapter.id);
		if (existing?.connected || (existing && !justLinked)) continue;

		const config = {};
		for (const field of adapter.configSchema || []) {
			if (field.fromOperatorDefault && operator?.[field.fromOperatorDefault]) {
				config[field.key] = String(operator[field.fromOperatorDefault]);
			}
		}
		if (!config.url) continue;
		const linked = await linkedConfigs(username, adapter, config, fresh);
		if (!Object.keys(linked).length) continue;

		try {
			const connected = await adapter.connectFromLinked({ config, linked, fetch });
			if (connected && !connected.error) {
				const surfaces = existing && Object.keys(existing.surfaces || {}).length ? existing.surfaces : { search: true };
				await upsertConnection(username, adapter.id, { config: connected, surfaces });
				failedAt.delete(key);
				continue;
			}
		} catch {
			/* fall through */
		}
		failedAt.set(key, Date.now());
	}
}

/**
 * The linked integrations that can really sign this one in, for the cards'
 * wording (Seerr on Plex: only Plex). Asks the operator's server, cached; if
 * it can't tell, all of `linkedTo`.
 */
const VIA_TTL_MS = 10 * 60 * 1000;
// A Seerr that didn't answer is asked again sooner, and not on every load.
const VIA_RETRY_MS = 60 * 1000;
const viaCache = new Map();

export async function linkedVia(adapter, operator, fetch) {
	if (!adapter.linkedVia) return adapter.linkedTo || null;
	const config = {};
	for (const field of adapter.configSchema || []) {
		if (field.fromOperatorDefault && operator?.[field.fromOperatorDefault]) {
			config[field.key] = String(operator[field.fromOperatorDefault]);
		}
	}
	if (!config.url) return adapter.linkedTo;
	const hit = viaCache.get(adapter.id);
	if (hit && hit.url === config.url && hit.at > Date.now() - hit.ttl) return hit.ids;
	let ids = null;
	try {
		ids = await adapter.linkedVia({ config, fetch });
	} catch {
		/* unreachable: keep the general wording */
	}
	const known = Array.isArray(ids);
	if (!known) ids = adapter.linkedTo;
	viaCache.set(adapter.id, { url: config.url, at: Date.now(), ids, ttl: known ? VIA_TTL_MS : VIA_RETRY_MS });
	return ids;
}

// True when every field the operator sets a default for still has that value.
function matchesOperator(adapter, config) {
	const operator = getRegistry().find((e) => e.adapter.id === adapter.id)?.operator;
	const fields = (adapter.configSchema || []).filter((f) => f.fromOperatorDefault);
	if (!fields.length) return false;
	return fields.every((f) => {
		const want = operator?.[f.fromOperatorDefault];
		return want && sameValue(config?.[f.key], String(want));
	});
}

function sameValue(a, b) {
	const norm = (v) => String(v || '').trim().replace(/\/+$/, '');
	return !!a && norm(a) === norm(b);
}
