import { getTodayWallpaperId } from '$lib/wallpaper.js';

// /api/wallpaper/today is the wallpaper of the day, picked in the server's
// time zone, so other apps (e.g. a sign-in page) can show the same image as
// the dashboard without knowing how Hearth picks it.
export async function GET({ params }) {
	const today = params.id === 'today';
	const id = today ? getTodayWallpaperId() : params.id.replace(/[^0-9]/g, '').padStart(4, '0');
	const upstream = `https://gitlab.com/dwt1/wallpapers/-/raw/master/${id}.jpg`;

	const res = await fetch(upstream);
	if (!res.ok) {
		return new Response('Not found', { status: 404 });
	}

	return new Response(res.body, {
		headers: {
			'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
			// "today" changes at midnight; numbered ids never change.
			'Cache-Control': today ? 'public, max-age=3600' : 'public, max-age=86400, stale-while-revalidate=3600',
		}
	});
}
