/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE = `cache-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
		).then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// Only the app's own build assets and static files are served from cache.
	// Pages and __data.json carry per-user data, so they always go to the
	// network and are never stored: a cached dashboard would outlive logout
	// and be shown to the next person on a shared device.
	if (url.origin !== self.location.origin || !ASSETS.includes(url.pathname)) return;

	event.respondWith(
		caches.match(event.request).then((cached) => cached || fetch(event.request))
	);
});
