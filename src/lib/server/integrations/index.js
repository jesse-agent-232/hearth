// Integration registry.
//
// Adapters load lazily: `loadEnabledAdapters()` (run from the server hook
// before every request) imports only the ones the operator enabled in
// config.yml, so an install with a few integrations never loads the rest.
// It picks up an integration enabled by a config reload on the next
// request. `getRegistry()` returns only the enabled, loaded ones — an
// integration that isn't listed (or is listed with enabled: false) is
// invisible to users entirely. This is the operator gate.
//
// To add a new integration: drop a new file in this directory and add a
// loader for it to LOADERS. Done.

import { getIntegrationsConfig, getAppsConfig } from '../config.js';

const LOADERS = {
	immich: () => import('./immich.js'),
	paperless: () => import('./paperless.js'),
	nextcloud: () => import('./nextcloud.js'),
	planka: () => import('./planka.js'),
	karakeep: () => import('./karakeep.js'),
	jellyfin: () => import('./jellyfin.js'),
	plex: () => import('./plex.js'),
	navidrome: () => import('./navidrome.js'),
	audiobookshelf: () => import('./audiobookshelf.js'),
	mealie: () => import('./mealie.js'),
	seerr: () => import('./seerr.js')
};
const BY_ID = new Map();
// Node caches a failed import, so a retry can't succeed until a restart.
const FAILED = new Set();

/** Import any enabled adapter that isn't loaded yet. Cheap once loaded. */
export async function loadEnabledAdapters() {
	const cfg = getIntegrationsConfig() || {};
	const missing = Object.keys(LOADERS).filter((id) => isEnabled(cfg[id]) && !BY_ID.has(id) && !FAILED.has(id));
	if (!missing.length) return;
	// One broken adapter must not take the others (or the page) down with it.
	const mods = await Promise.allSettled(missing.map((id) => LOADERS[id]()));
	missing.forEach((id, i) => {
		if (mods[i].status === 'fulfilled') BY_ID.set(id, mods[i].value.default);
		else {
			FAILED.add(id);
			console.error(`[holm] Integration "${id}" failed to load:`, mods[i].reason);
		}
	});
}

function resolveApp(id) {
	const apps = getAppsConfig();
	for (const app of apps) {
		if (app.id === id) return app;
	}
	return null;
}

function isEnabled(operatorEntry) {
	if (operatorEntry == null) return false;
	if (typeof operatorEntry !== 'object') return false;
	return operatorEntry.enabled !== false;
}

/**
 * Returns enabled adapter metadata + per-integration operator settings.
 * Used by the API layer to advertise what's available to users.
 */
export function getRegistry() {
	const cfg = getIntegrationsConfig() || {};
	const out = [];
	for (const id of Object.keys(LOADERS)) {
		const operatorEntry = cfg[id];
		if (!isEnabled(operatorEntry)) continue;
		const adapter = BY_ID.get(id);
		if (!adapter) continue;
		const app = resolveApp(adapter.id);
		out.push({
			adapter,
			app,
			icon: app?.icon || adapter.icon || null,
			operator: operatorEntry,
			availableSurfaces: deriveAvailableSurfaces(adapter, operatorEntry)
		});
	}
	return out;
}

/**
 * Returns the adapter for a given id, OR null if it's disabled / unknown.
 * Use this in API handlers to enforce the operator gate.
 */
export function getAdapter(id) {
	const cfg = getIntegrationsConfig() || {};
	if (!isEnabled(cfg[id])) return null;
	return BY_ID.get(id) || null;
}

/**
 * Returns the operator's settings block for an integration (the value of
 * `integrations.<id>` in config.yml). Useful for `fromOperatorDefault`
 * field prefills.
 */
export function getOperatorDefaults(id) {
	const cfg = getIntegrationsConfig() || {};
	const entry = cfg[id];
	return isEnabled(entry) ? entry : null;
}

/**
 * Returns the list of surface keys an integration is allowed to expose,
 * intersected with what the operator enabled in config.yml.
 *
 * Order: ['search', 'widgets']  — UI renders toggles in this order.
 */
function deriveAvailableSurfaces(adapter, operatorEntry) {
	const operatorSurfaces = (operatorEntry && operatorEntry.surfaces) || {};
	const out = [];
	if (
		adapter.searchProviders &&
		Object.keys(adapter.searchProviders).length > 0 &&
		operatorSurfaces.search !== false
	) {
		out.push('search');
	}
	if (
		adapter.widgets &&
		Object.keys(adapter.widgets).length > 0 &&
		operatorSurfaces.widgets === true
	) {
		out.push('widgets');
	}
	return out;
}
