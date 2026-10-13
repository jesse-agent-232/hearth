// Who can see a configured app. `groups` on the app is the whole rule: with
// none, everyone sees it; with some, only users in at least one of them. The
// server applies it before apps reach the browser, so a hidden app's URL
// never leaves the server.
//
// `admin_only: true` was the old way to hide an app from everyone but admins.
// Holm has no admin role any more, so an app that still has it and no
// `groups` is hidden from everyone rather than shown to everyone.

let warnedAdminOnly = false;

// Whether `user` is in at least one of `groups`; no groups lets everyone in.
// The same rule gates the changelog dialog, onboarding and the privacy notice.
export function inGroups(groups, user) {
	const list = Array.isArray(groups) ? groups.filter(Boolean) : [];
	if (!list.length) return true;
	return (user?.groups || []).some((g) => list.includes(g));
}

export function canSeeApp(app, user) {
	if (Array.isArray(app?.groups) && app.groups.some(Boolean)) return inGroups(app.groups, user);
	if (app?.admin_only) {
		if (!warnedAdminOnly) {
			warnedAdminOnly = true;
			console.warn('[holm] config: admin_only is no longer supported and those apps are hidden; give them groups: [...] instead');
		}
		return false;
	}
	return true;
}

// The changelog dialog, onboarding and the privacy notice: on, and for this
// user. `on` is what a section that leaves `enabled` out gets.
export function canSeeSection(section, user, on = false) {
	return !!(section?.enabled ?? on) && inGroups(section?.groups, user);
}

// Those three as this user gets them. One they can't see arrives as
// `{ enabled: false }`, so its slides and text never leave the server.
export function sectionsFor(config, user) {
	return {
		onboarding: canSeeSection(config?.onboarding, user) ? config.onboarding : { enabled: false },
		privacy: canSeeSection(config?.privacy, user) ? config.privacy : { enabled: false },
		changelog: { enabled: canSeeSection(config?.changelog, user, true) }
	};
}
