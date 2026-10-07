// Unit tests for src/lib/server/appAccess.js.
// Run: node --test tests/appAccess.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canSeeApp } from '../src/lib/server/appAccess.js';

const alice = { username: 'alice', groups: ['family'] };
const bob = { username: 'bob', groups: ['arr', 'admins'] };

test('an app without groups is visible to everyone, signed in or not', () => {
	assert.equal(canSeeApp({ id: 'photos' }, alice), true);
	assert.equal(canSeeApp({ id: 'photos', groups: [] }, alice), true);
	assert.equal(canSeeApp({ id: 'photos' }, null), true);
});

test('an app with groups is visible only to members of one of them', () => {
	const sonarr = { id: 'sonarr', groups: ['arr'] };
	assert.equal(canSeeApp(sonarr, bob), true);
	assert.equal(canSeeApp(sonarr, alice), false);
	assert.equal(canSeeApp(sonarr, null), false);
	assert.equal(canSeeApp({ id: 'x', groups: ['nope', 'family'] }, alice), true);
});

test('legacy admin_only without groups is hidden from everyone', () => {
	assert.equal(canSeeApp({ id: 'old', admin_only: true }, bob), false);
	assert.equal(canSeeApp({ id: 'old', admin_only: true, groups: ['admins'] }, bob), true);
});
