import { writable } from 'svelte/store';
import { browser } from '$app/environment';

function createAdminAppsStore() {
	const { subscribe, set, update } = writable([]);

	return {
		subscribe,
		set,

		async add(app) {
			if (!browser) return null;
			try {
				const res = await fetch('/api/prefs/admin-apps', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(app)
				});
				if (res.ok) {
					const data = await res.json();
					const newApp = { ...app, id: data.id };
					update(apps => [...apps, newApp]);
					return newApp;
				}
			} catch { /* fall through */ }
			return null;
		},

		async remove(id) {
			if (!browser) return false;
			try {
				const res = await fetch(`/api/prefs/admin-apps/${encodeURIComponent(id)}`, {
					method: 'DELETE'
				});
				if (res.ok) {
					update(apps => apps.filter(a => a.id !== id));
					return true;
				}
			} catch { /* fall through */ }
			return false;
		}
	};
}

export const adminApps = createAdminAppsStore();
