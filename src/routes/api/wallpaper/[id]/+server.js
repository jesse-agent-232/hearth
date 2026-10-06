import { fetchHeadersWithin } from '$lib/server/fetchHeaders.js';
import { getTodayWallpaperId } from '$lib/wallpaper.js';

// /api/wallpaper/today is the wallpaper of the day, picked in the server's
// time zone, so other apps (e.g. a sign-in page) can show the same image as
// the dashboard without knowing how Holm picks it.
export async function GET({ params }) {
	const today = params.id === 'today';
	const id = today ? getTodayWallpaperId() : params.id.replace(/[^0-9]/g, '').padStart(4, '0');
	const original = `https://gitlab.com/dwt1/wallpapers/-/raw/master/${id}.jpg`;
	// Re-encoded as WebP through wsrv (same as the thumb route), capped at
	// 1920px wide and never enlarged: ~40% smaller than the source JPEGs.
	// Falls back to the original if wsrv is slow or down.
	const optimized = `https://wsrv.nl/?url=${encodeURIComponent(original)}&w=1920&we&output=webp&q=80`;

	let res = await fetchHeadersWithin(optimized, 8000);
	if (!res?.ok) res = await fetchHeadersWithin(original, 15000);
	if (!res?.ok) {
		return new Response('Not found', { status: 404 });
	}

	return new Response(res.body, {
		headers: {
			'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
			// "today" changes at midnight; numbered ids never change.
			'Cache-Control': today ? 'public, max-age=3600' : 'public, max-age=604800, stale-while-revalidate=86400',
		}
	});
}
