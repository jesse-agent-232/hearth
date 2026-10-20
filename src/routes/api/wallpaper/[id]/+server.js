import { getSessionUser } from '$lib/server/session.js';
import { getWallpaperConfig } from '$lib/server/config.js';
import { wallpaperResponse } from '$lib/server/wallpapers.js';

// /api/wallpaper/today is the wallpaper of the day, picked in the server's
// time zone, so other apps (e.g. a sign-in page) can show the same image as
// the dashboard without knowing how Holm picks it; it's the only public one.
// Numbered ids run from 1 to the count of the configured source, at 1920px
// through the resizer (src/lib/server/wallpapers.js).
export function GET({ params, cookies, url }) {
	return wallpaperResponse(getWallpaperConfig(), params.id, 'full', { signedIn: !!getSessionUser(cookies, url) });
}
