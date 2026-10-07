// Who can see a configured app. `groups` on the app is the whole rule: with
// none, everyone sees it; with some, only users in at least one of them. The
// server applies it before apps reach the browser, so a hidden app's URL
// never leaves the server.
//
// `admin_only: true` was the old way to hide an app from everyone but admins.
// Holm has no admin role any more, so an app that still has it and no
// `groups` is hidden from everyone rather than shown to everyone.

let warnedAdminOnly = false;

export function canSeeApp(app, user) {
	const groups = Array.isArray(app?.groups) ? app.groups.filter(Boolean) : [];
	if (groups.length) return (user?.groups || []).some((g) => groups.includes(g));
	if (app?.admin_only) {
		if (!warnedAdminOnly) {
			warnedAdminOnly = true;
			console.warn('[holm] config: admin_only is no longer supported and those apps are hidden; give them groups: [...] instead');
		}
		return false;
	}
	return true;
}
