import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'hearth_prefs';

const THEME_KEY = 'hearth_theme';
const ICON_STYLE_KEY = 'hearth_icon_style';
const WALLPAPER_KEY = 'hearth_wallpaper';

function loadPrefs() {
	if (!browser) return {};
	try {
		const prefs = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
		// Restore visual prefs from persistent keys if prefs were cleared (e.g. after logout)
		if (!prefs.theme) {
			const savedTheme = localStorage.getItem(THEME_KEY);
			if (savedTheme) prefs.theme = savedTheme;
		}
		if (!prefs.iconStyle) {
			const savedIconStyle = localStorage.getItem(ICON_STYLE_KEY);
			if (savedIconStyle) prefs.iconStyle = savedIconStyle;
		}
		if (!prefs.wallpaperId) {
			const saved = localStorage.getItem(WALLPAPER_KEY);
			if (saved) {
				try {
					const w = JSON.parse(saved);
					prefs.wallpaperId = w.id;
					prefs.wallpaperEnabled = w.enabled;
				} catch {}
			}
		}
		return prefs;
	} catch {
		return {};
	}
}

function saveLocal(prefs) {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
	// Always persist visual prefs separately so they survive logout
	if (prefs.theme) localStorage.setItem(THEME_KEY, prefs.theme);
	if (prefs.iconStyle) localStorage.setItem(ICON_STYLE_KEY, prefs.iconStyle);
	if (prefs.wallpaperId !== undefined || prefs.wallpaperEnabled !== undefined) {
		localStorage.setItem(WALLPAPER_KEY, JSON.stringify({ id: prefs.wallpaperId, enabled: prefs.wallpaperEnabled }));
	}
}

let debounceTimer = null;
let serverSyncEnabled = false;

function debouncedServerSync(prefs) {
	if (!serverSyncEnabled || !browser) return;
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		// Strip session fields — those come from cookies, not prefs
		const { name, username, groups, ...serverPrefs } = prefs;
		fetch('/api/prefs', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(serverPrefs)
		}).catch(() => { /* silent fail — localStorage is the fallback */ });
	}, 300);
}

function createPrefsStore() {
	const { subscribe, set: _set, update: _update } = writable(loadPrefs());

	return {
		subscribe,
		set(value) {
			saveLocal(value);
			debouncedServerSync(value);
			_set(value);
		},
		update(fn) {
			_update((current) => {
				const next = fn(current);
				saveLocal(next);
				debouncedServerSync(next);
				return next;
			});
		},
		reset() {
			if (browser) {
				localStorage.removeItem(STORAGE_KEY);
				localStorage.removeItem('weather_cache');
				localStorage.removeItem('weather_location');
				// hearth_theme and hearth_icon_style intentionally kept — survive logout
			}
			// Restore persisted visual prefs into the empty state
			const restored = {};
			if (browser) {
				const t = localStorage.getItem(THEME_KEY);
				const i = localStorage.getItem(ICON_STYLE_KEY);
				const w = localStorage.getItem(WALLPAPER_KEY);
				if (t) restored.theme = t;
				if (i) restored.iconStyle = i;
				if (w) {
					try {
						const wp = JSON.parse(w);
						restored.wallpaperId = wp.id;
						restored.wallpaperEnabled = wp.enabled;
					} catch {}
				}
			}
			_set(restored);
		},

		/**
		 * Merge prefs the server rendered with the page over localStorage.
		 * Synchronous apart from the one-time migration PUT, so the dashboard
		 * can render on hydration instead of waiting on a /api/prefs round trip.
		 */
		applyServerPrefs(serverPrefs) {
			if (!browser) return;
			try {
				serverPrefs = serverPrefs || {};
				const localPrefs = loadPrefs();

				// Migration: if server is empty but local has data, seed the server
				if (Object.keys(serverPrefs).length === 0 && Object.keys(localPrefs).length > 0) {
					const { name, username, groups, adminApps, ...toSync } = localPrefs;
					fetch('/api/prefs', {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(toSync)
					}).catch(() => {});
					serverSyncEnabled = true;
					return; // local prefs are already correct
				}

				// Merge: server wins, but keep local-only fields if server doesn't have them
				const merged = { ...localPrefs, ...serverPrefs };
				saveLocal(merged);
				_set(merged);
				serverSyncEnabled = true;
			} catch {
				// Server unreachable — localStorage-only mode
			}
		}
	};
}

export const prefs = createPrefsStore();
