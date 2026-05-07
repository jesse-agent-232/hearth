// Pure layout helpers. No DOM, no Svelte, no I/O. Easy to unit-test.

import { newInstance } from './instance.js';
import { WIDGET_TYPES } from './registry.js';

const COLS = 12;

// Find the first (x, y) where a w×h tile fits without overlapping existing
// instances. Sweeps row by row, column by column. Returns { x, y }.
export function findFreeSlot(layout, w, h, cols = COLS) {
	const occupied = (x, y) =>
		layout.some(
			(i) => x < i.x + i.w && x + w > i.x && y < i.y + i.h && y + h > i.y
		);

	const maxY = layout.reduce((m, i) => Math.max(m, i.y + i.h), 0);
	for (let y = 0; y <= maxY; y++) {
		for (let x = 0; x + w <= cols; x++) {
			if (!occupied(x, y)) return { x, y };
		}
	}
	return { x: 0, y: maxY };
}

// Clamp instance dimensions to the registry entry's min/max and to grid cols.
export function clamp(instance, registryEntry, cols = COLS) {
	if (!registryEntry) return instance;
	const min = registryEntry.minSize || { w: 1, h: 1 };
	const max = registryEntry.maxSize || { w: cols, h: 12 };
	const w = Math.min(Math.max(instance.w ?? registryEntry.defaultSize.w, min.w), Math.min(max.w, cols));
	const h = Math.min(Math.max(instance.h ?? registryEntry.defaultSize.h, min.h), max.h);
	const x = Math.min(Math.max(instance.x ?? 0, 0), Math.max(0, cols - w));
	const y = Math.max(instance.y ?? 0, 0);
	return { ...instance, x, y, w, h };
}

// Build a fresh default layout: one app tile per self-hosted, default-visible
// catalog app. Bookmarks and external services stay opt-in via the picker.
// admin_only filtered for non-admins.
export function defaultWidgetLayout(catalog, registry, { isAdmin = false } = {}) {
	const entry = registry[WIDGET_TYPES.APP];
	if (!entry || !Array.isArray(catalog)) return [];
	const out = [];
	for (const app of catalog) {
		if (app.adminOnly && !isAdmin) continue;
		if (app.default === false) continue;
		if (!app.selfHosted) continue;
		const inst = newInstance(WIDGET_TYPES.APP, entry, { appId: app.id });
		const slot = findFreeSlot(out, inst.w, inst.h);
		out.push({ ...inst, x: slot.x, y: slot.y });
	}
	return out;
}

// Convert legacy prefs (categoryLayout / visibleApps / customApps) into a
// widgetLayout of one app tile per appId. Categories are dropped on the floor;
// positions reflow. Deterministic for a given input shape.
export function synthesizeFromLegacyPrefs(legacyPrefs, catalog, registry, { isAdmin = false } = {}) {
	const entry = registry[WIDGET_TYPES.APP];
	if (!entry) return [];

	const seen = new Set();
	const orderedIds = [];

	// 1. categoryLayout preserves the user's prior ordering across categories.
	const cats = Array.isArray(legacyPrefs?.categoryLayout) ? legacyPrefs.categoryLayout : [];
	for (const cat of cats) {
		const ids = Array.isArray(cat?.appIds) ? cat.appIds : [];
		for (const id of ids) {
			if (id && !seen.has(id)) {
				seen.add(id);
				orderedIds.push(id);
			}
		}
	}

	// 2. visibleApps as a fallback for users who never customized layout.
	const visible = Array.isArray(legacyPrefs?.visibleApps) ? legacyPrefs.visibleApps : [];
	for (const id of visible) {
		if (id && !seen.has(id)) {
			seen.add(id);
			orderedIds.push(id);
		}
	}

	// 3. customApps (per-user bookmarks) — IDs are like 'custom-<ts>'. They're
	// part of the catalog already (the page builds catalog from config + admin
	// + customApps), so referencing by id works the same as any other app.
	const customApps = Array.isArray(legacyPrefs?.customApps) ? legacyPrefs.customApps : [];
	for (const ca of customApps) {
		if (ca?.id && !seen.has(ca.id)) {
			seen.add(ca.id);
			orderedIds.push(ca.id);
		}
	}

	// Filter against catalog (skip ids the user no longer has access to,
	// e.g. an admin_only app for a non-admin viewer).
	const byId = new Map((catalog || []).map((a) => [a.id, a]));
	const out = [];
	for (const id of orderedIds) {
		const app = byId.get(id);
		if (!app) continue;
		if (app.adminOnly && !isAdmin) continue;
		const inst = newInstance(WIDGET_TYPES.APP, entry, { appId: id });
		const slot = findFreeSlot(out, inst.w, inst.h);
		out.push({ ...inst, x: slot.x, y: slot.y });
	}

	// If migration produced nothing (legacy prefs were empty / all stale),
	// fall back to defaults so the user lands on a populated surface.
	if (out.length === 0) {
		return defaultWidgetLayout(catalog, registry, { isAdmin });
	}
	return out;
}

// Apply a positions update to a widgetLayout array, immutably. Used by
// WidgetGrid on dragstop / resizestop.
export function updateLayoutPositions(layout, positions) {
	const byId = new Map(positions.map((p) => [p.instanceId, p]));
	return layout.map((inst) => {
		const p = byId.get(inst.instanceId);
		if (!p) return inst;
		return { ...inst, x: p.x ?? inst.x, y: p.y ?? inst.y, w: p.w ?? inst.w, h: p.h ?? inst.h };
	});
}

// Patch a single instance's config in a widgetLayout array, immutably.
export function updateInstanceConfig(layout, instanceId, config) {
	return layout.map((inst) =>
		inst.instanceId === instanceId ? { ...inst, config: { ...inst.config, ...config } } : inst
	);
}

// Append a new instance to a layout, placing it in the first free slot.
export function addInstance(layout, type, registryMap, configOverride) {
	const entry = registryMap[type];
	if (!entry) throw new Error(`Unknown widget type: ${type}`);
	const inst = newInstance(type, entry, configOverride);
	const slot = findFreeSlot(layout, inst.w, inst.h);
	return [...layout, { ...inst, x: slot.x, y: slot.y }];
}

// Convenience: add an app tile by appId (the common case in PR #1).
export function addAppInstance(layout, appId, registryMap) {
	return addInstance(layout, WIDGET_TYPES.APP, registryMap, { appId });
}

// Remove an instance from a layout by id.
export function removeInstance(layout, instanceId) {
	return layout.filter((inst) => inst.instanceId !== instanceId);
}

// Look up an app-tile instance by appId. Returns null if no tile is placed
// for that app. Used to short-circuit "is this app already on surface?" checks.
export function findAppInstance(layout, appId) {
	if (!Array.isArray(layout)) return null;
	for (const inst of layout) {
		if (inst.type === WIDGET_TYPES.APP && inst.config?.appId === appId) return inst;
	}
	return null;
}
