// Unit tests for src/lib/server/sessionToken.js and src/lib/server/envVars.js.
// Run: npm test

import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';

import { signSessionToken, verifySessionToken, SESSION_TTL_SECONDS } from '../src/lib/server/sessionToken.js';
import { substituteEnvVars } from '../src/lib/server/envVars.js';

const key = Buffer.alloc(32, 7);
const other = Buffer.alloc(32, 8);
const now = Date.UTC(2026, 9, 7);

test('a signed session verifies and carries exp', () => {
	const cookie = signSessionToken({ username: 'alice', groups: ['family'] }, key, now);
	const s = verifySessionToken(cookie, key, now);
	assert.equal(s.username, 'alice');
	assert.equal(s.exp, Math.floor(now / 1000) + SESSION_TTL_SECONDS);
});

test('a session expires after the TTL', () => {
	const cookie = signSessionToken({ username: 'alice' }, key, now);
	assert.ok(verifySessionToken(cookie, key, now + (SESSION_TTL_SECONDS - 1) * 1000));
	assert.equal(verifySessionToken(cookie, key, now + SESSION_TTL_SECONDS * 1000), null);
});

test('another key, a tampered payload or a bad signature is rejected', () => {
	const cookie = signSessionToken({ username: 'alice' }, key, now);
	assert.equal(verifySessionToken(cookie, other, now), null);
	const [payload, sig] = cookie.split('.');
	const forged = Buffer.from(JSON.stringify({ username: 'admin', exp: 9e9 })).toString('base64');
	assert.equal(verifySessionToken(`${forged}.${sig}`, key, now), null);
	assert.equal(verifySessionToken(`${payload}.${sig.slice(0, -1)}`, key, now), null);
	assert.equal(verifySessionToken(`${payload}.`, key, now), null);
});

test('unsigned, empty and missing-exp cookies are rejected', () => {
	assert.equal(verifySessionToken(Buffer.from('{"username":"a"}').toString('base64'), key, now), null);
	assert.equal(verifySessionToken('', key, now), null);
	assert.equal(verifySessionToken(undefined, key, now), null);
	// Signed correctly but with no exp, as a pre-expiry cookie would be.
	const payload = Buffer.from('{"username":"a"}').toString('base64');
	const sig = createHmac('sha256', key).update(payload).digest('hex');
	assert.equal(verifySessionToken(`${payload}.${sig}`, key, now), null);
});

test('env vars are substituted', () => {
	const out = substituteEnvVars({ a: 'x-${A}', b: ['${B}'], c: 3 }, { A: '1', B: '2' });
	assert.deepEqual(out, { a: 'x-1', b: ['2'], c: 3 });
});

test('unset or empty env vars throw, naming each', () => {
	assert.throws(
		() => substituteEnvVars({ a: '${A}', b: { c: '${C}' }, d: '${D}' }, { D: '' }),
		/unset environment variable\(s\): A, C, D/
	);
});
