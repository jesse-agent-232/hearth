// Unit tests for src/lib/server/updateCheck.js.
// Run: node --test tests/updateCheck.test.js

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { latestRelease, checkSettled, updateFor, resetUpdateCheck } from '../src/lib/server/updateCheck.js';
import { canSeeSection } from '../src/lib/server/appAccess.js';

const SIX_HOURS = 6 * 60 * 60 * 1000;
const release = { tag_name: 'v0.7.0', html_url: 'https://github.com/o/holm/releases/tag/v0.7.0' };

// A fetch that answers `reply` (an object, a status number, or an Error) and counts calls.
function fakeFetch(reply) {
	const f = async (url) => {
		f.calls.push(url);
		if (reply instanceof Error) throw reply;
		if (typeof reply === 'number') return new Response('{}', { status: reply });
		return Response.json(reply);
	};
	f.calls = [];
	return f;
}

async function check(fetch, now = 0) {
	latestRelease({ fetch, now });
	await checkSettled();
	return latestRelease({ fetch, now });
}

beforeEach(() => {
	resetUpdateCheck();
	console.warn = () => {};
});

test('updateFor: a notice only when the release is newer, compared as numbers', () => {
	const latest = { version: '0.7.0', url: release.html_url };
	assert.deepEqual(updateFor('0.6.0', latest), { latest: '0.7.0', url: release.html_url });
	assert.equal(updateFor('0.7.0', latest), null);
	assert.equal(updateFor('0.8.0', latest), null);
	assert.deepEqual(updateFor('0.9.0', { version: '0.10.0', url: 'u' }), { latest: '0.10.0', url: 'u' });
	assert.equal(updateFor('0.6.0', null), null);
});

test('reads tag_name without its v, and html_url', async () => {
	const fetch = fakeFetch(release);
	assert.deepEqual(await check(fetch), { version: '0.7.0', url: release.html_url });
	assert.match(fetch.calls[0], /^https:\/\/api\.github\.com\/repos\/[^/]+\/holm\/releases\/latest$/);
});

test('a page load never waits: the first one gets nothing, later ones the result', async () => {
	const fetch = fakeFetch(release);
	assert.equal(latestRelease({ fetch, now: 0 }), null);
	await checkSettled();
	assert.equal(latestRelease({ fetch, now: 1 }).version, '0.7.0');
});

test('asks GitHub at most every 6 hours, however many pages load', async () => {
	const fetch = fakeFetch(release);
	for (let i = 0; i < 5; i++) latestRelease({ fetch, now: 0 });
	await check(fetch, SIX_HOURS - 1);
	assert.equal(fetch.calls.length, 1);
	await check(fetch, SIX_HOURS);
	assert.equal(fetch.calls.length, 2);
});

test('any failure means no notice, and it waits 6 hours before asking again', async () => {
	for (const reply of [404, 403, 500, new Error('offline'), { tag_name: 'nightly', html_url: release.html_url }, { tag_name: 'v0.7.0', html_url: 'https://evil.example/' }]) {
		resetUpdateCheck();
		const fetch = fakeFetch(reply);
		assert.equal(await check(fetch), null);
		assert.equal(updateFor('0.6.0', latestRelease({ fetch, now: SIX_HOURS - 1 })), null);
		assert.equal(fetch.calls.length, 1);
		await check(fetch, SIX_HOURS);
		assert.equal(fetch.calls.length, 2);
	}
});

test('a failure after a success drops the old notice', async () => {
	await check(fakeFetch(release), 0);
	assert.equal(await check(fakeFetch(503), SIX_HOURS), null);
});

test('update_check: on by default, enabled: false is off, groups limit it', () => {
	const operator = { groups: ['admins'] };
	const member = { groups: ['family'] };
	const guest = { groups: [] };
	assert.equal(canSeeSection(undefined, member, true), true);
	assert.equal(canSeeSection({ enabled: false }, operator, true), false);
	assert.equal(canSeeSection({ groups: ['admins'] }, operator, true), true);
	assert.equal(canSeeSection({ enabled: true, groups: ['admins'] }, member, true), false);
	assert.equal(canSeeSection({ groups: ['admins'] }, guest, true), false);
});
