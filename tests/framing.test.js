// Unit tests for src/lib/server/framing.js.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseFrameAncestors, allowFraming } from '../src/lib/server/framing.js';

const CSP = "default-src 'self'; frame-ancestors 'none'; base-uri 'self'";
const blocked = () => new Headers({ 'x-frame-options': 'DENY', 'content-security-policy': CSP });

test('nothing configured leaves framing blocked', () => {
	const headers = blocked();
	allowFraming(headers, parseFrameAncestors(undefined).allowed);
	assert.equal(headers.get('x-frame-options'), 'DENY');
	assert.equal(headers.get('content-security-policy'), CSP);
});

test('listed origins may frame Holm, and so may Holm itself', () => {
	const headers = blocked();
	allowFraming(headers, parseFrameAncestors(['https://dash.example.com', 'http://homepage.lan:8080']).allowed);
	assert.equal(headers.get('x-frame-options'), null);
	assert.equal(
		headers.get('content-security-policy'),
		"default-src 'self'; frame-ancestors 'self' https://dash.example.com http://homepage.lan:8080; base-uri 'self'"
	);
});

test('a single string, a trailing slash and a wildcard subdomain are accepted', () => {
	assert.deepEqual(parseFrameAncestors('https://dash.example.com/').allowed, ['https://dash.example.com']);
	assert.deepEqual(parseFrameAncestors(['https://*.example.com']).allowed, ['https://*.example.com']);
});

test('anything that is not an origin is rejected, so it cannot change the policy', () => {
	const bad = ['*', "'none'", 'dash.example.com', 'https://dash.example.com/path', 'https://a.com; script-src *', 'https://a.com https://b.com', 42, null];
	const { allowed, invalid } = parseFrameAncestors(bad);
	assert.deepEqual(allowed, []);
	assert.equal(invalid.length, bad.length);
});

test('a response with no CSP (an API route) only loses X-Frame-Options', () => {
	const headers = new Headers({ 'x-frame-options': 'DENY' });
	allowFraming(headers, ['https://dash.example.com']);
	assert.equal(headers.get('x-frame-options'), null);
	assert.equal(headers.get('content-security-policy'), null);
});
