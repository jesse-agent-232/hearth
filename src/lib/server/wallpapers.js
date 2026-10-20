// Where wallpapers come from, set by config.yml's wallpapers: block.
//
// - Neither path nor url: DistroTube's set on GitLab, resized through
//   wsrv.nl, as Holm has always done.
// - path: a mounted folder. Every jpg/png/webp/avif in it, sorted by name.
// - url: a pattern with {id}, numbered from start for count images, {id}
//   zero-padded to pad digits.
// - resize: a resizer URL with {url} or {file}, and {width}; "wsrv" for the
//   public wsrv.nl; or "none" to serve originals. A resizer that fails falls back to the original.
//
// Wallpapers are always asked for by number, 1 to the count, so a request
// never names a file. Only image types are served, up to MAX_BYTES. Only
// /api/wallpaper/today at full size is public (the sign-in page shows it);
// every numbered id, thumbnail and original needs a signed-in session, since
// a folder may be family photos.

import { readdirSync, statSync, openSync, fstatSync, closeSync, createReadStream } from 'node:fs';
import { isAbsolute, join, extname } from 'node:path';
import { Readable } from 'node:stream';
import { fetchHeadersWithin } from './fetchHeaders.js';

export const BUILTIN_COUNT = 326;
const BUILTIN_URL = 'https://gitlab.com/dwt1/wallpapers/-/raw/master/{id}.jpg';
// The built-in set's resizing, unchanged: WebP for the full image, never
// enlarged; the picker thumbnail as wsrv's default.
const WSRV = 'https://wsrv.nl/?url={url}&w={width}&we&output=webp&q=80';
const WSRV_THUMB = 'https://wsrv.nl/?url={url}&w={width}&q=75';

export const FULL_WIDTH = 1920;
export const THUMB_WIDTH = 200;
export const MAX_BYTES = 25 * 1024 * 1024;
const MAX_COUNT = 100000;

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };
const SERVED_TYPES = new Set(Object.values(TYPES));

const isHttpUrl = (v) => {
	try {
		return ['http:', 'https:'].includes(new URL(v).protocol);
	} catch {
		return false;
	}
};
const isWhole = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const show = (v) => JSON.stringify(v);

// Why a config's wallpapers: block can't be used, or null when it can.
export function wallpapersError(w) {
	if (w === undefined || w === null) return null;
	if (typeof w !== 'object' || Array.isArray(w)) return 'wallpapers must be a mapping';
	const { path, url, count, pad, start, resize } = w;
	if (path !== undefined && url !== undefined) return 'wallpapers takes path or url, not both';
	if (path !== undefined) {
		if (typeof path !== 'string' || !isAbsolute(path)) return `wallpapers.path must be an absolute folder path, not ${show(path)}`;
		for (const key of ['count', 'pad', 'start']) {
			if (w[key] !== undefined) return `wallpapers.${key} is for url; a folder counts its own images`;
		}
		try {
			if (!statSync(path).isDirectory()) return `wallpapers.path ${show(path)} is not a folder`;
			readdirSync(path);
		} catch (err) {
			return `wallpapers.path ${show(path)} can't be read (${err.code || err.message})`;
		}
	}
	if (url !== undefined) {
		if (typeof url !== 'string' || !isHttpUrl(url.replace('{id}', '1')) || !url.includes('{id}')) {
			return `wallpapers.url must be an http(s) URL with {id} in it, not ${show(url)}`;
		}
		if (!TYPES[extname(new URL(url.replace('{id}', '1')).pathname).toLowerCase()]) {
			return `wallpapers.url must end in .jpg, .jpeg, .png, .webp or .avif, not ${show(url)}`;
		}
		if (!isWhole(count, 1, MAX_COUNT)) return `wallpapers.count must be a whole number from 1 to ${MAX_COUNT} with url, not ${show(count)}`;
		if (pad !== undefined && !isWhole(pad, 0, 8)) return `wallpapers.pad must be a whole number from 0 to 8, not ${show(pad)}`;
		if (start !== undefined && !isWhole(start, 0, Number.MAX_SAFE_INTEGER)) return `wallpapers.start must be a whole number, 0 or more, not ${show(start)}`;
	} else if (path === undefined) {
		// Older configs carry source: "gitlab" and count: 326, which were
		// never read; they still load and still mean the built-in set.
		for (const key of ['pad', 'start']) {
			if (w[key] !== undefined) return `wallpapers.${key} needs wallpapers.url`;
		}
	}
	if (resize === 'wsrv' && path !== undefined) {
		return 'wallpapers.resize "wsrv" can\'t reach a folder on this server; use a resizer that mounts it, or "none"';
	}
	if (resize !== undefined && resize !== 'none' && resize !== 'wsrv') {
		const needs = path !== undefined ? '{file}' : '{url}';
		if (typeof resize !== 'string' || !isHttpUrl(resize.replace(/\{\w+\}/g, 'x')) || !resize.includes('{width}') || !resize.includes(needs)) {
			return `wallpapers.resize must be "none", "wsrv" or an http(s) URL with ${needs} and {width} in it, not ${show(resize)}`;
		}
	}
	return null;
}

// A folder's images, sorted by name, listed again only when the folder
// changes.
let listing = { path: null, mtimeMs: -1, files: [] };
function folderImages(path) {
	let mtimeMs;
	try {
		mtimeMs = statSync(path).mtimeMs;
	} catch {
		return [];
	}
	if (listing.path !== path || listing.mtimeMs !== mtimeMs) {
		let files = [];
		try {
			files = readdirSync(path, { withFileTypes: true })
				.filter((d) => d.isFile() && !d.name.startsWith('.') && TYPES[extname(d.name).toLowerCase()])
				.map((d) => d.name)
				.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
		} catch {
			// Unreadable now: no images until it reads again.
		}
		listing = { path, mtimeMs, files };
	}
	return listing.files;
}

// How many wallpapers there are.
export function wallpaperCount(w = {}) {
	if (w.path) return folderImages(w.path).length;
	if (w.url) return w.count;
	return BUILTIN_COUNT;
}

// The wallpaper of the day, 1 to the count, picked in the server's time zone.
export function todayIndex(count, now = new Date()) {
	if (!count) return 0;
	const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
	return (dayOfYear % count) + 1;
}

// "today" or a number from the request, as an index from 1 to the count,
// else null. Only plain digits count.
export function parseIndex(id, count, now) {
	if (id === 'today') return todayIndex(count, now) || null;
	if (!/^\d{1,9}$/.test(id)) return null;
	const n = Number(id);
	return n >= 1 && n <= count ? n : null;
}

// The original for index n (1-based): { url } for a remote image, or
// { file, name } for one in the folder.
export function originalFor(w = {}, n) {
	if (w.path) {
		const name = folderImages(w.path)[n - 1];
		return name ? { file: join(w.path, name), name } : null;
	}
	if (w.url) {
		const id = String((w.start ?? 1) + n - 1).padStart(w.pad ?? 0, '0');
		return { url: w.url.replaceAll('{id}', id) };
	}
	return { url: BUILTIN_URL.replace('{id}', String(n).padStart(4, '0')) };
}

const resizeOf = (w) => w.resize ?? (w.path || w.url ? 'none' : 'wsrv');

// Whether wallpapers go through a resizer, so the full image may be smaller
// than the original.
export function hasResizer(w = {}) {
	return resizeOf(w) !== 'none';
}

// The resizer URL for an original at a width, or null to serve the original.
export function resizedUrl(w = {}, original, width) {
	let resize = resizeOf(w);
	if (resize === 'none') return null;
	if (resize === 'wsrv') resize = width === THUMB_WIDTH ? WSRV_THUMB : WSRV;
	return resize
		.replaceAll('{width}', String(width))
		.replaceAll('{url}', original.url ? encodeURIComponent(original.url) : '')
		.replaceAll('{file}', original.name ? encodeURIComponent(original.name) : '');
}

const baseType = (res) => (res.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();

// A fetched image, if it is one and fits under the cap: a stream that stops
// at MAX_BYTES, since Content-Length can be missing or wrong.
function servable(res) {
	if (!res) return null;
	const type = baseType(res);
	if (!res.ok || !res.body || !SERVED_TYPES.has(type) || Number(res.headers.get('Content-Length')) > MAX_BYTES) {
		res.body?.cancel().catch(() => {});
		return null;
	}
	let seen = 0;
	const capped = res.body.pipeThrough(
		new TransformStream({
			transform(chunk, ctl) {
				seen += chunk.byteLength;
				if (seen > MAX_BYTES) ctl.error(new Error('wallpaper over the size cap'));
				else ctl.enqueue(chunk);
			}
		})
	);
	return { body: capped, type };
}

function fromFile(original) {
	const type = TYPES[extname(original.name).toLowerCase()];
	let fd;
	try {
		fd = openSync(original.file, 'r');
		const st = fstatSync(fd);
		if (!st.isFile() || st.size > MAX_BYTES) {
			closeSync(fd);
			return null;
		}
		const stream = createReadStream(null, { fd });
		return { body: Readable.toWeb(stream), type, length: st.size };
	} catch {
		if (fd !== undefined) closeSync(fd);
		return null;
	}
}

// The image for index n at a width: the resized one, else the original.
// A null width asks for the original. Returns { body, type } or null.
export async function loadWallpaper(w = {}, n, width, fetchFn = fetchHeadersWithin) {
	const original = originalFor(w, n);
	if (!original) return null;
	const resized = width && resizedUrl(w, original, width);
	if (resized) {
		const image = servable(await fetchFn(resized, 8000));
		if (image) return image;
	}
	if (original.file) return fromFile(original);
	return servable(await fetchFn(original.url, 15000));
}

const SIZES = { full: FULL_WIDTH, thumb: THUMB_WIDTH, original: null };

// The response for /api/wallpaper/<id>[/thumb|/original]. size is full,
// thumb or original; signedIn is whether the request has a session (the
// guest counts when sign-in is off).
export async function wallpaperResponse(w = {}, id, size, { signedIn, fetchFn } = {}) {
	const isPublic = id === 'today' && size === 'full';
	if (!isPublic && !signedIn) return new Response('Unauthorized', { status: 401 });
	const n = parseIndex(id, wallpaperCount(w));
	const image = n && (await loadWallpaper(w, n, SIZES[size], fetchFn));
	if (!image) return new Response('Not found', { status: 404 });
	// "today" changes at midnight. A folder's numbering moves when files are
	// added or removed. Signed-in images stay out of shared caches.
	const cache = isPublic
		? 'public, max-age=3600'
		: w.path
			? 'private, max-age=3600'
			: 'private, max-age=604800, stale-while-revalidate=86400';
	return new Response(image.body, {
		headers: { 'Content-Type': image.type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': cache }
	});
}
