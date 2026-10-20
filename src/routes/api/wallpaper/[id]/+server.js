import { getWallpaperConfig } from '$lib/server/config.js';
import { FULL_WIDTH, loadWallpaper, parseIndex, wallpaperCount } from '$lib/server/wallpapers.js';

// /api/wallpaper/today is the wallpaper of the day, picked in the server's
// time zone, so other apps (e.g. a sign-in page) can show the same image as
// the dashboard without knowing how Holm picks it. Numbered ids run from 1
// to the count of the configured source (src/lib/server/wallpapers.js).
export async function GET({ params }) {
	const config = getWallpaperConfig();
	// A folder's numbering moves when files are added or removed.
	const lasting = config.path ? 'public, max-age=3600' : 'public, max-age=604800, stale-while-revalidate=86400';
	const today = params.id === 'today';
	const n = parseIndex(params.id, wallpaperCount(config));
	// Capped at 1920px wide and never enlarged by the resizer; the original
	// when there is none, or it fails.
	const image = n && (await loadWallpaper(config, n, FULL_WIDTH));
	if (!image) {
		return new Response('Not found', { status: 404 });
	}

	return new Response(image.body, {
		headers: {
			'Content-Type': image.type,
			'X-Content-Type-Options': 'nosniff',
			// "today" changes at midnight.
			'Cache-Control': today ? 'public, max-age=3600' : lasting,
		}
	});
}
