import { getBranding } from '$lib/server/config.js';

export function GET() {
	const branding = getBranding();

	const icons = [
		{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
		{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
	];

	// Add custom logo as SVG icon if configured
	if (branding.logo) {
		const isSvg = branding.logo.endsWith('.svg');
		icons.unshift({
			src: branding.logo,
			sizes: isSvg ? 'any' : '512x512',
			type: isSvg ? 'image/svg+xml' : 'image/png',
			purpose: 'any'
		});
	}

	const manifest = {
		name: branding.name || 'Holm',
		short_name: branding.short_name || branding.name?.toLowerCase() || 'holm',
		description: branding.description || 'Self-hosted dashboard',
		start_url: '/',
		display: 'standalone',
		background_color: branding.theme_color || '#09090b',
		theme_color: branding.theme_color || '#09090b',
		icons
	};

	return new Response(JSON.stringify(manifest, null, '\t'), {
		headers: { 'Content-Type': 'application/manifest+json' }
	});
}
