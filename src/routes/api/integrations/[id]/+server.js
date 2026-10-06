import { json } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/session.js';
import { getAdapter } from '$lib/server/integrations/index.js';
import {
	getConnection,
	upsertConnection,
	deleteConnection
} from '$lib/server/integrations/store.js';
import { redactConfig, isRedacted } from '$lib/server/integrations/serialize.js';
import { withDeadline } from '$lib/server/integrations/deadline.js';

// PUT /api/integrations/:id   body: { config, surfaces }
// Save (or update) the user's connection. Secret fields that come back as
// the redacted bullet string are merged from the existing record so users
// can edit URL-only without re-pasting the API key.

export async function PUT({ cookies, url, request, params }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const adapter = getAdapter(params.id);
	if (!adapter) return json({ error: 'Unknown integration' }, { status: 404 });

	const body = await readJson(request);
	if (!body) return json({ error: 'Invalid JSON' }, { status: 400 });

	const submitted = body.config || {};
	const existing = await getConnection(user.username, adapter.id);
	let merged = mergeConfig(adapter, existing?.config || {}, submitted);
	if (adapter.prepareConfig) merged = adapter.prepareConfig({ config: merged });

	const validation = validateConfig(adapter, merged);
	if (!validation.ok) return json({ error: validation.message }, { status: 400 });

	const surfaces = sanitizeSurfaces(body.surfaces);

	await upsertConnection(user.username, adapter.id, { config: merged, surfaces });

	return json({
		ok: true,
		userState: {
			connected: true,
			config: redactConfig(adapter, merged),
			surfaces
		}
	});
}

// DELETE /api/integrations/:id
// Disconnect — wipes the row entirely.
export async function DELETE({ cookies, url, params, fetch }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const adapter = getAdapter(params.id);
	if (!adapter) return json({ error: 'Unknown integration' }, { status: 404 });

	// Revoke the upstream session too (e.g. a Quick Connect token), best
	// effort: an unreachable server must not stop the user disconnecting.
	if (adapter.signOut) {
		const existing = await getConnection(user.username, adapter.id);
		if (existing?.config) {
			try {
				await adapter.signOut({ config: existing.config, fetch: withDeadline(fetch, 5000) });
			} catch {
				/* ignore */
			}
		}
	}

	await deleteConnection(user.username, adapter.id);
	return json({ ok: true });
}

async function readJson(request) {
	try {
		const text = await request.text();
		if (text.length > 16384) return null;
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function mergeConfig(adapter, existing, submitted) {
	const merged = { ...existing };
	for (const field of adapter.configSchema || []) {
		const v = submitted[field.key];
		if (v == null) continue;
		// Hidden fields (tokens, ids) are only ever set by the sign-in flow.
		if (field.hidden) continue;
		// A bullet-redacted secret means "don't change this" — keep existing.
		if (field.type === 'secret' && isRedacted(v)) continue;
		if (typeof v === 'string') {
			merged[field.key] = field.trim === false ? v : v.trim();
		} else {
			merged[field.key] = v;
		}
	}
	return merged;
}

function validateConfig(adapter, config) {
	for (const field of adapter.configSchema || []) {
		if (field.required && !config[field.key]) {
			return { ok: false, message: `Missing required field: ${field.label}` };
		}
	}
	return { ok: true };
}

function sanitizeSurfaces(input) {
	if (!input || typeof input !== 'object') return {};
	const out = {};
	for (const [k, v] of Object.entries(input)) {
		out[k] = !!v;
	}
	return out;
}
