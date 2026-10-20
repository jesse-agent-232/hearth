// Unit tests for the wallpaper source set by config.yml's wallpapers: block:
// the built-in set, a folder, a URL pattern, the resizer and its fallback,
// and the values rejected at load.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	wallpapersError,
	wallpaperCount,
	parseIndex,
	originalFor,
	resizedUrl,
	loadWallpaper,
	FULL_WIDTH,
	THUMB_WIDTH,
	MAX_BYTES
} from '../src/lib/server/wallpapers.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function folder(names) {
	const dir = mkdtempSync(join(tmpdir(), 'holm-wall-'));
	for (const name of names) writeFileSync(join(dir, name), JPEG);
	return dir;
}

const read = async (image) => Buffer.from(await new Response(image.body).arrayBuffer());

// A fetch stand-in: answers from a map of URL → Response, records each call.
function fakeFetch(answers) {
	const calls = [];
	const fn = async (url) => {
		calls.push(url);
		const make = answers[url];
		return make ? make() : null;
	};
	fn.calls = calls;
	return fn;
}
const image = (type = 'image/jpeg', body = JPEG, headers = {}) => () =>
	new Response(body, { headers: { 'Content-Type': type, ...headers } });

test('with no path, url or resize, the source is the built-in set through wsrv.nl, as before', () => {
	for (const w of [undefined, {}, { enabled: true }]) assert.equal(wallpapersError(w), null);
	assert.equal(wallpaperCount({ enabled: true }), 326);
	// The shape older configs and config.demo.yml carry: still the built-in set.
	const legacy = { enabled: true, source: 'gitlab', count: 326 };
	assert.equal(wallpapersError(legacy), null);
	assert.equal(wallpaperCount(legacy), 326);
	assert.equal(resizedUrl(legacy, originalFor(legacy, 1), FULL_WIDTH).startsWith('https://wsrv.nl/'), true);
	const original = originalFor({}, 7);
	assert.deepEqual(original, { url: 'https://gitlab.com/dwt1/wallpapers/-/raw/master/0007.jpg' });
	const src = encodeURIComponent(original.url);
	assert.equal(resizedUrl({}, original, FULL_WIDTH), `https://wsrv.nl/?url=${src}&w=1920&we&output=webp&q=80`);
	assert.equal(resizedUrl({}, original, THUMB_WIDTH), `https://wsrv.nl/?url=${src}&w=200&q=75`);
});

test('a request picks by number from 1 to the count, never by name', () => {
	assert.equal(parseIndex('0001', 326), 1);
	assert.equal(parseIndex('326', 326), 326);
	for (const id of ['0', '327', '-1', '1.5', '1e2', 'a.jpg', '../etc/passwd', '%2e%2e', ' 1', '']) {
		assert.equal(parseIndex(id, 326), null, id);
	}
	assert.equal(parseIndex('today', 10, new Date(2026, 0, 1)), 2);
	assert.equal(parseIndex('today', 0), null);
});

test('a folder serves its images sorted by name and counts them itself', async () => {
	const dir = folder(['b.png', 'a.jpg', 'notes.txt', '.hidden.jpg', 'img10.webp', 'img9.avif', 'photo.JPEG', 'icon.svg']);
	mkdirSync(join(dir, 'sub.jpg'));
	symlinkSync('/etc/hostname', join(dir, 'link.jpg'));
	utimesSync(dir, new Date(), new Date(Date.now() + 1000));
	const w = { path: dir };
	assert.equal(wallpapersError(w), null);
	assert.equal(wallpaperCount(w), 5);
	assert.deepEqual([1, 2, 3, 4, 5].map((n) => originalFor(w, n).name), ['a.jpg', 'b.png', 'img9.avif', 'img10.webp', 'photo.JPEG']);
	assert.equal(originalFor(w, 6), null);

	// No resize set: the original, straight from disk, with its type.
	const fetch = fakeFetch({});
	const served = await loadWallpaper(w, 2, FULL_WIDTH, fetch);
	assert.equal(served.type, 'image/png');
	assert.deepEqual(await read(served), JPEG);
	assert.equal(fetch.calls.length, 0);
});

test('a folder notices added images', () => {
	const dir = folder(['a.jpg']);
	assert.equal(wallpaperCount({ path: dir }), 1);
	writeFileSync(join(dir, 'b.jpg'), JPEG);
	utimesSync(dir, new Date(), new Date(Date.now() + 5000));
	assert.equal(wallpaperCount({ path: dir }), 2);
});

test('a folder file over the size cap is not served', async () => {
	const dir = folder([]);
	writeFileSync(join(dir, 'big.jpg'), Buffer.alloc(MAX_BYTES + 1));
	assert.equal(await loadWallpaper({ path: dir }, 1, FULL_WIDTH, fakeFetch({})), null);
});

test('a url pattern numbers from start, zero-padded to pad', () => {
	const w = { url: 'https://img.example/walls/{id}.webp', count: 20, pad: 3, start: 0 };
	assert.equal(wallpapersError(w), null);
	assert.equal(wallpaperCount(w), 20);
	assert.equal(originalFor(w, 1).url, 'https://img.example/walls/000.webp');
	assert.equal(originalFor(w, 20).url, 'https://img.example/walls/019.webp');
	assert.equal(originalFor({ url: 'https://img.example/{id}.jpg', count: 3 }, 1).url, 'https://img.example/1.jpg');
	// No resize set with a url: originals.
	assert.equal(resizedUrl(w, originalFor(w, 1), FULL_WIDTH), null);
});

test('a resizer gets the original and the width', () => {
	const w = { url: 'https://img.example/{id}.jpg', count: 3, resize: 'http://weserv/?url={url}&w={width}&output=webp' };
	assert.equal(resizedUrl(w, originalFor(w, 2), 200), `http://weserv/?url=${encodeURIComponent('https://img.example/2.jpg')}&w=200&output=webp`);
	const dir = folder(['my photo.jpg']);
	const f = { path: dir, resize: 'http://imgproxy:8080/insecure/rs:fit:{width}/plain/local:///{file}@webp' };
	assert.equal(wallpapersError(f), null);
	assert.equal(resizedUrl(f, originalFor(f, 1), 1920), 'http://imgproxy:8080/insecure/rs:fit:1920/plain/local:///my%20photo.jpg@webp');
	assert.equal(resizedUrl({ resize: 'none' }, originalFor({}, 1), 1920), null);
	// "wsrv": the public wsrv.nl, the same URLs the built-in set uses.
	const pub = { url: 'https://img.example/{id}.jpg', count: 3, resize: 'wsrv' };
	assert.equal(wallpapersError(pub), null);
	const src = encodeURIComponent('https://img.example/1.jpg');
	assert.equal(resizedUrl(pub, originalFor(pub, 1), 1920), `https://wsrv.nl/?url=${src}&w=1920&we&output=webp&q=80`);
	assert.equal(resizedUrl(pub, originalFor(pub, 1), 200), `https://wsrv.nl/?url=${src}&w=200&q=75`);
});

test('when the resizer fails, Holm serves the original', async () => {
	const w = { url: 'https://img.example/{id}.jpg', count: 3, resize: 'http://resizer/?url={url}&w={width}' };
	const original = 'https://img.example/1.jpg';
	const resized = resizedUrl(w, originalFor(w, 1), FULL_WIDTH);
	const cases = {
		down: () => null,
		error: () => new Response('boom', { status: 502 }),
		'not an image': () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
		svg: () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
		'too big': image('image/webp', 'x', { 'Content-Length': String(MAX_BYTES + 1) })
	};
	for (const [name, make] of Object.entries(cases)) {
		const fetch = fakeFetch({ [resized]: make, [original]: image() });
		const served = await loadWallpaper(w, 1, FULL_WIDTH, fetch);
		assert.equal(served?.type, 'image/jpeg', name);
		assert.deepEqual(fetch.calls, [resized, original], name);
	}
	// It works: the resized image, and the original isn't fetched.
	const fetch = fakeFetch({ [resized]: image('image/webp') });
	assert.equal((await loadWallpaper(w, 1, FULL_WIDTH, fetch)).type, 'image/webp');
	assert.deepEqual(fetch.calls, [resized]);
});

test('a folder whose resizer fails falls back to the file', async () => {
	const dir = folder(['a.jpg']);
	const w = { path: dir, resize: 'http://imgproxy/rs:fit:{width}/plain/local:///{file}' };
	const served = await loadWallpaper(w, 1, THUMB_WIDTH, fakeFetch({}));
	assert.equal(served.type, 'image/jpeg');
	assert.deepEqual(await read(served), JPEG);
});

test('an original that is not an image, or is over the cap, is not served', async () => {
	const w = { url: 'https://img.example/{id}.jpg', count: 1 };
	const url = 'https://img.example/1.jpg';
	assert.equal(await loadWallpaper(w, 1, FULL_WIDTH, fakeFetch({ [url]: () => new Response('hi', { headers: { 'Content-Type': 'text/plain' } }) })), null);
	assert.equal(await loadWallpaper(w, 1, FULL_WIDTH, fakeFetch({ [url]: image('image/jpeg', 'x', { 'Content-Length': String(MAX_BYTES + 1) }) })), null);
	// No Content-Length, but the body runs past the cap: the stream errors.
	const big = await loadWallpaper(w, 1, FULL_WIDTH, fakeFetch({ [url]: image('image/jpeg', new Uint8Array(MAX_BYTES + 10)) }));
	await assert.rejects(read(big), /size cap/);
});

test('bad values are rejected at load with the reason', () => {
	const dir = folder(['a.jpg']);
	const file = join(dir, 'a.jpg');
	const cases = [
		[{ path: dir, url: 'https://x/{id}.jpg', count: 1 }, /path or url, not both/],
		[{ path: 'walls' }, /path must be an absolute folder path/],
		[{ path: 5 }, /path must be an absolute folder path/],
		[{ path: '/no/such/holm/folder' }, /can't be read \(ENOENT\)/],
		[{ path: file }, /is not a folder/],
		[{ path: dir, count: 3 }, /count is for url/],
		[{ url: 'https://x/{id}.jpg' }, /count must be a whole number from 1/],
		[{ url: 'https://x/{id}.jpg', count: 0 }, /count must be/],
		[{ url: 'https://x/{id}.jpg', count: '10' }, /count must be/],
		[{ url: 'https://x/{id}.jpg', count: 2.5 }, /count must be/],
		[{ url: 'https://x/walls.jpg', count: 1 }, /with \{id\} in it/],
		[{ url: 'ftp://x/{id}.jpg', count: 1 }, /http\(s\) URL/],
		[{ url: 'file:///walls/{id}.jpg', count: 1 }, /http\(s\) URL/],
		[{ url: 'https://x/{id}.gif', count: 1 }, /must end in \.jpg/],
		[{ url: 'https://x/{id}.svg', count: 1 }, /must end in \.jpg/],
		[{ url: 'https://x/{id}.jpg', count: 1, pad: 9 }, /pad must be/],
		[{ url: 'https://x/{id}.jpg', count: 1, start: -1 }, /start must be/],
		[{ pad: 2 }, /pad needs wallpapers\.url/],
		[{ start: 0 }, /start needs wallpapers\.url/],
		[{ resize: 'yes' }, /resize must be "none", "wsrv" or an http\(s\) URL with \{url\} and \{width\}/],
		[{ path: dir, resize: 'wsrv' }, /"wsrv" can't reach a folder/],
		[{ resize: 'http://weserv/?url={url}' }, /\{width\}/],
		[{ path: dir, resize: 'http://weserv/?url={url}&w={width}' }, /with \{file\} and \{width\}/],
		[{ resize: false }, /resize must be/],
		['gitlab', /must be a mapping/]
	];
	for (const [w, reason] of cases) {
		assert.match(wallpapersError(w) || '', reason, JSON.stringify(w));
	}
});
