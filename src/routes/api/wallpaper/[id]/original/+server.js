import { getSessionUser } from '$lib/server/session.js';
import { getWallpaperConfig } from '$lib/server/config.js';
import { wallpaperResponse } from '$lib/server/wallpapers.js';

// The original, skipping the resizer: the background switches to it on
// screens wider than 1920px.
export function GET({ params, cookies, url }) {
	return wallpaperResponse(getWallpaperConfig(), params.id, 'original', { signedIn: !!getSessionUser(cookies, url) });
}
