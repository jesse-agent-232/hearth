import { getSessionUser } from '$lib/server/session.js';
import { getWallpaperConfig } from '$lib/server/config.js';
import { wallpaperResponse } from '$lib/server/wallpapers.js';

// The picker's thumbnail: 200px through the resizer, else the original.
export function GET({ params, cookies, url }) {
	return wallpaperResponse(getWallpaperConfig(), params.id, 'thumb', { signedIn: !!getSessionUser(cookies, url) });
}
