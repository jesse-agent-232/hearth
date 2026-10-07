// Unit tests for the integration proxy's guards: which content types it
// serves, and the Nextcloud thumbnail handler's host check.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isProxiedMedia } from '../../src/lib/server/integrations/proxyMedia.js';
import nextcloud from '../../src/lib/server/integrations/nextcloud.js';

test('only images and audio are proxied', () => {
	for (const t of ['image/jpeg', 'image/webp', 'IMAGE/PNG', 'audio/mpeg', 'audio/flac; charset=binary']) {
		assert.equal(isProxiedMedia(t), true, t);
	}
	for (const t of ['text/html', 'text/html; charset=utf-8', 'application/json', 'application/javascript', '', null]) {
		assert.equal(isProxiedMedia(t), false, String(t));
	}
});

function thumbnail(config, upstreamUrl) {
	const calls = [];
	const fetch = async (url, init) => {
		calls.push({ url, init });
		return new Response('img', { headers: { 'content-type': 'image/png' } });
	};
	const id = btoa(upstreamUrl);
	return nextcloud.proxy.thumbnail.fetch({ config, params: { path: [id] }, fetch }).then((res) => ({ res, calls }));
}

const config = { url: 'https://cloud.example.org/', username: 'alice', appPassword: 'secret' };

test('nextcloud thumbnails on the configured origin are fetched with credentials', async () => {
	const { res, calls } = await thumbnail(config, 'https://cloud.example.org/core/preview?fileId=1');
	assert.equal(res.status, 200);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, 'https://cloud.example.org/core/preview?fileId=1');
});

test('nextcloud relative thumbnail paths resolve against the configured URL', async () => {
	const { calls } = await thumbnail(config, '/core/preview?fileId=2');
	assert.equal(calls[0].url, 'https://cloud.example.org/core/preview?fileId=2');
});

test('nextcloud thumbnails on any other host are refused before any request', async () => {
	for (const url of [
		'https://cloud.example.org.evil.test/x',
		'https://cloud.example.org@evil.test/x',
		'http://cloud.example.org/x',
		'https://cloud.example.org:444/x',
		'//evil.test/x',
		'not a url'
	]) {
		const { res, calls } = await thumbnail(config, url);
		assert.equal(res.status, 403, url);
		assert.equal(calls.length, 0, url);
	}
});
