// Server → client serialization helpers for integrations.
//
// Two responsibilities:
//   1. Strip non-serializable adapter pieces (functions, schema metadata) so
//      the registry can be sent over the wire.
//   2. Redact secret fields to a fixed bullet string so credentials never
//      leak through API responses.

const REDACTED = '••••••••';

export function adapterToClient(adapter, { icon, name, tip, shortcut } = {}) {
	return {
		id: adapter.id,
		name: name || adapter.name,
		icon: icon || adapter.icon || null,
		shortcut: (shortcut || adapter.shortcut || '').toLowerCase() || null,
		description: adapter.description,
		tip: tip || null,
		configSchema: (adapter.configSchema || []).map((f) => ({
			key: f.key,
			type: f.type,
			label: f.label,
			required: !!f.required,
			placeholder: f.placeholder || '',
			help: f.help || '',
			helpUrl: f.helpUrl || null,
			fromOperatorDefault: f.fromOperatorDefault || null,
			hidden: !!f.hidden
		})),
		signIn: adapter.signIn ? { label: adapter.signIn.label, help: adapter.signIn.help || '' } : null,
		searchProviders: Object.fromEntries(
			Object.entries(adapter.searchProviders || {}).map(([key, p]) => [
				key,
				{ label: p.label, mode: p.mode, kind: p.kind || null }
			])
		)
	};
}

export function redactConfig(adapter, config) {
	const out = {};
	const schema = adapter.configSchema || [];
	const secretKeys = new Set(schema.filter((f) => f.type === 'secret').map((f) => f.key));
	for (const [k, v] of Object.entries(config || {})) {
		if (v == null || v === '') continue;
		out[k] = secretKeys.has(k) ? REDACTED : v;
	}
	return out;
}

export function isRedacted(value) {
	return value === REDACTED;
}
