import { getWallpaperConfig } from '$lib/server/config.js';
import { THUMB_WIDTH, loadWallpaper, parseIndex, wallpaperCount } from '$lib/server/wallpapers.js';

// The picker's thumbnail: 200px through the resizer, else the original.
export async function GET({ params }) {
	const config = getWallpaperConfig();
	// A folder's numbering moves when files are added or removed.
	const lasting = config.path ? 'public, max-age=3600' : 'public, max-age=604800, stale-while-revalidate=86400';
	const n = parseIndex(params.id, wallpaperCount(config));
	const image = n && (await loadWallpaper(config, n, THUMB_WIDTH));
	if (!image) {
		return new Response('Not found', { status: 404 });
	}

	return new Response(image.body, {
		headers: {
			'Content-Type': image.type,
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': lasting,
		}
	});
}
