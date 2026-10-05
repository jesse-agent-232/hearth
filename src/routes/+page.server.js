import { dev } from '$app/environment';
import { fetchNews } from '$lib/server/news.js';
import { getAuth, getNewsConfig } from '$lib/server/config.js';
import { getSessionUser, isAdmin } from '$lib/server/session.js';
import { getUserPrefs, getAdminApps } from '$lib/server/db.js';

export async function load({ cookies, url }) {
	const authConfig = getAuth();
	const user = getSessionUser(cookies, url);

	let authName = user?.name || null;
	let authUsername = user?.username || null;

	// Clean up one-time auth cookies
	if (cookies.get('auth_name') && !dev) {
		cookies.delete('auth_name', { path: '/' });
	}
	if (cookies.get('auth_username') && !dev) {
		cookies.delete('auth_username', { path: '/' });
	}

	// If auth is disabled, treat everyone as authenticated
	const isAuthenticated = !authConfig.enabled || !!authName;

	if (isAuthenticated) {
		const newsConfig = getNewsConfig();
		const news = newsConfig.enabled ? await fetchNews() : [];

		return {
			news,
			authName: authName || (authConfig.enabled ? null : 'Guest'),
			authUsername: authUsername || null,
			isAdmin: isAdmin(user, authConfig),
			devMode: dev,
			// Seed the client stores in the page payload (no /api/prefs round trip)
			prefs: user ? await getUserPrefs(user.username) : null,
			adminApps: user ? await getAdminApps() : []
		};
	}

	return { news: [], authName: null, authUsername: null, isAdmin: false, devMode: dev };
}
