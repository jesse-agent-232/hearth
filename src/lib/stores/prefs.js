import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'holm_prefs';

const THEME_KEY = 'holm_theme';
const ICON_STYLE_KEY = 'holm_icon_style';
const WALLPAPER_KEY = 'holm_wallpaper';

function loadPrefs() {
	if (!browser) return {};
	try {
		return withDeviceVisuals(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {});
	} catch {
		return {};
	}
}

// Theme, icon style and wallpaper are kept per device so they survive
// logout; fill them in wherever prefs leave them unset.
function withDeviceVisuals(prefs) {
	try {
		if (!prefs.theme) {
			const savedTheme = localStorage.getItem(THEME_KEY);
			if (savedTheme) prefs.theme = savedTheme;
		}
		if (!prefs.iconStyle) {
			const savedIconStyle = localStorage.getItem(ICON_STYLE_KEY);
			if (savedIconStyle) prefs.iconStyle = savedIconStyle;
		}
		if (prefs.wallpaperId === undefined) {
			const saved = localStorage.getItem(WALLPAPER_KEY);
			if (saved) {
				try {
					const w = JSON.parse(saved);
					prefs.wallpaperId = w.id;
					prefs.wallpaperEnabled = w.enabled;
				} catch {}
			}
		}
	} catch {}
	return prefs;
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
				// holm_theme and holm_icon_style intentionally kept — survive logout
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
		 * Take the signed-in user's prefs from the server, which rendered them
		 * with the page, so the dashboard renders on hydration with no
		 * /api/prefs round trip. The server is the source: the browser's saved
		 * prefs are not merged in or pushed up, since this browser may have
		 * belonged to someone else, and a cleared account must stay cleared.
		 * Only this device's theme, icon style and wallpaper fill gaps.
		 */
		applyServerPrefs(serverPrefs, { name, username }) {
			if (!browser) return;
			const next = withDeviceVisuals({
				...(serverPrefs || {}),
				name,
				username,
				firstLoginAt: serverPrefs?.firstLoginAt || new Date().toISOString()
			});
			saveLocal(next);
			_set(next);
			serverSyncEnabled = true;
			const filled = ['firstLoginAt', 'theme', 'iconStyle', 'wallpaperId'].some((k) => next[k] !== undefined && next[k] !== serverPrefs?.[k]);
			if (filled) debouncedServerSync(next);
		}
	};
}

export const prefs = createPrefsStore();
