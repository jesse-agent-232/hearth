// Unit tests for src/lib/server/integrations/urlPolicy.js.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	applyOperatorUrls,
	checkUrls,
	urlOriginChanged,
	withoutSecrets
} from '../../src/lib/server/integrations/urlPolicy.js';

const adapter = {
	configSchema: [
		{ key: 'url', type: 'url', label: 'Server URL', required: true, fromOperatorDefault: 'default_url' },
		{ key: 'username', type: 'text', label: 'Username' },
		{ key: 'apiKey', type: 'secret', label: 'API key' },
		{ key: 'token', type: 'secret', label: 'Token', hidden: true },
		{ key: 'userId', type: 'text', label: 'User id', hidden: true }
	]
};
const pinned = { enabled: true, default_url: 'https://photos.example.org' };

test('the operator URL replaces a submitted one', () => {
	const r = checkUrls(adapter, pinned, { url: 'http://127.0.0.1:8080/x?', apiKey: 'k' });
	assert.equal(r.ok, true);
	assert.equal(r.config.url, 'https://photos.example.org');
	assert.equal(r.config.apiKey, 'k');
});

test('the operator URL also replaces one read from storage', () => {
	assert.equal(applyOperatorUrls(adapter, pinned, { url: 'http://old.example.org' }).url, 'https://photos.example.org');
});

test('without an operator URL, only http(s) is accepted', () => {
	assert.equal(checkUrls(adapter, null, { url: 'https://a.example.org' }).ok, true);
	assert.equal(checkUrls(adapter, {}, { url: 'http://a.example.org:8096/jf' }).ok, true);
	for (const url of ['file:///etc/passwd', 'ftp://a.example.org', 'gopher://x', 'not a url', 'javascript:alert(1)']) {
		const r = checkUrls(adapter, null, { url });
		assert.equal(r.ok, false, url);
		assert.match(r.message, /Server URL/);
	}
});

test('an empty optional URL is left alone', () => {
	assert.equal(checkUrls(adapter, null, {}).ok, true);
});

test('origin changes are detected, path changes are not', () => {
	const before = { url: 'https://a.example.org/jf' };
	assert.equal(urlOriginChanged(adapter, before, { url: 'https://a.example.org/other' }), false);
	assert.equal(urlOriginChanged(adapter, before, { url: 'https://a.example.org.evil.test/jf' }), true);
	assert.equal(urlOriginChanged(adapter, before, { url: 'http://a.example.org/jf' }), true);
	assert.equal(urlOriginChanged(adapter, before, { url: 'https://a.example.org:8443/jf' }), true);
	assert.equal(urlOriginChanged(adapter, {}, { url: 'https://new.example.org' }), false);
});

test('withoutSecrets drops secret and server-set fields only', () => {
	const out = withoutSecrets(adapter, {
		url: 'https://a.example.org',
		username: 'alice',
		apiKey: 'k',
		token: 't',
		userId: 'u'
	});
	assert.deepEqual(out, { url: 'https://a.example.org', username: 'alice' });
});
