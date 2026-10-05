import { fetchHeadersWithin } from '$lib/server/fetchHeaders.js';

export async function GET({ params }) {
	const id = params.id.replace(/[^0-9]/g, '').padStart(4, '0');
	const source = encodeURIComponent(`https://gitlab.com/dwt1/wallpapers/-/raw/master/${id}.jpg`);
	const upstream = `https://wsrv.nl/?url=${source}&w=200&q=75`;

	const res = await fetchHeadersWithin(upstream, 8000);
	if (!res?.ok) {
		return new Response('Not found', { status: 404 });
	}

	return new Response(res.body, {
		headers: {
			'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
			'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
		}
	});
}
