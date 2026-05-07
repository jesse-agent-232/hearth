// Per-widget instance helpers. Pure JS, no DOM, no Svelte.

function uuid() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	// Fallback for older environments / SSR boots that lack crypto.randomUUID.
	return 'w-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

export function newInstance(type, registryEntry, configOverride) {
	if (!registryEntry) throw new Error(`Unknown widget type: ${type}`);
	const { defaultSize, defaultConfig } = registryEntry;
	return {
		instanceId: uuid(),
		type,
		x: 0,
		y: 0,
		w: defaultSize.w,
		h: defaultSize.h,
		config: { ...(defaultConfig || {}), ...(configOverride || {}) }
	};
}
