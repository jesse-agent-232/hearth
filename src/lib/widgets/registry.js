// Widget registry. Each entry tells the grid how to render and size a widget
// type. Adding a new widget type = adding an entry here.
//
// PR #1 ships only `app` — every app icon is its own widget tile. Aggregator
// widgets (recent, most-used, integration tiles) come in follow-up PRs.

export const WIDGET_TYPES = {
	APP: 'app'
};

export const registry = {
	[WIDGET_TYPES.APP]: {
		type: WIDGET_TYPES.APP,
		displayName: 'App',
		description: 'A single app launcher tile.',
		defaultSize: { w: 1, h: 1 },
		minSize: { w: 1, h: 1 },
		maxSize: { w: 3, h: 3 },
		defaultConfig: { appId: null }
	}
};

export function getRegistryEntry(type) {
	return registry[type] || null;
}

export function listRegistry() {
	return Object.values(registry);
}
