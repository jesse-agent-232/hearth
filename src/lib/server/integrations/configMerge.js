import { isRedacted } from './serialize.js';

// How a submitted config is folded into the stored one, and checked, before
// it is saved: shared by every account of a connection.

export function mergeConfig(adapter, existing, submitted) {
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

export function validateConfig(adapter, config) {
	for (const field of adapter.configSchema || []) {
		if (field.required && !config[field.key]) {
			return { ok: false, message: `Missing required field: ${field.label}` };
		}
	}
	return { ok: true };
}
