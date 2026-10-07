// Server-side rules for the URL fields of an integration's config. The
// browser shows a locked field when the operator set `default_url`, but only
// these checks make it so: the server fetches whatever URL is saved, with the
// user's credentials attached.

function urlFields(adapter) {
	return (adapter?.configSchema || []).filter((f) => f.type === 'url');
}

function originOf(value) {
	try {
		return new URL(value).origin;
	} catch {
		return null;
	}
}

/**
 * Replaces each URL field the operator pinned (`fromOperatorDefault`, e.g.
 * `default_url`) with the operator's value, whatever was submitted or stored.
 */
export function applyOperatorUrls(adapter, operator, config) {
	const out = { ...(config || {}) };
	for (const field of urlFields(adapter)) {
		const pinned = field.fromOperatorDefault && operator?.[field.fromOperatorDefault];
		if (pinned) out[field.key] = String(pinned);
	}
	return out;
}

/**
 * Pins operator URLs, then requires every remaining URL value to be http(s).
 * Returns { ok: true, config } or { ok: false, message }.
 */
export function checkUrls(adapter, operator, config) {
	const out = applyOperatorUrls(adapter, operator, config);
	for (const field of urlFields(adapter)) {
		const value = out[field.key];
		if (value == null || value === '') continue;
		let url;
		try {
			url = new URL(value);
		} catch {
			return { ok: false, message: `${field.label} must be a full http(s) URL` };
		}
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			return { ok: false, message: `${field.label} must be a full http(s) URL` };
		}
	}
	return { ok: true, config: out };
}

/** True when any URL field points at a different origin in `after`. */
export function urlOriginChanged(adapter, before, after) {
	return urlFields(adapter).some((field) => {
		const was = before?.[field.key];
		return !!was && originOf(was) !== originOf(after?.[field.key]);
	});
}

/**
 * The stored config minus its secrets and its server-set fields (tokens,
 * ids). Used when the URL moves to another origin: credentials issued by one
 * server must never be sent to another.
 */
export function withoutSecrets(adapter, config) {
	const out = { ...(config || {}) };
	for (const field of adapter?.configSchema || []) {
		if (field.type === 'secret' || field.hidden) delete out[field.key];
	}
	return out;
}
