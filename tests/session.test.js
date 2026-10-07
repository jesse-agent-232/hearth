// Unit tests for src/lib/server/sessionUser.js.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { userFromSession } from '../src/lib/server/sessionUser.js';

const session = { name: 'Alice A', username: 'alice', groups: ['family'] };

test('a valid session is the signed-in user', () => {
	assert.deepEqual(userFromSession(session, { authEnabled: true }), {
		name: 'Alice A',
		username: 'alice',
		groups: ['family']
	});
});

test('auth_name alone is not a session', () => {
	assert.equal(userFromSession(null, { authName: 'Mallory', authEnabled: true }), null);
	assert.equal(userFromSession({ name: 'Mallory' }, { authName: 'Mallory', authEnabled: true }), null);
});

test('auth_name only renames a valid session', () => {
	const user = userFromSession(session, { authName: 'Ali', authEnabled: true });
	assert.equal(user.name, 'Ali');
	assert.equal(user.username, 'alice');
	assert.deepEqual(user.groups, ['family']);
});

test('with auth off, a request without a session is the guest', () => {
	assert.deepEqual(userFromSession(null, { authName: 'Mallory', authEnabled: false }), {
		name: 'Guest',
		username: 'guest',
		groups: []
	});
});

test('groups that are not a list become none', () => {
	assert.deepEqual(userFromSession({ username: 'bob', groups: 'admins' }, { authEnabled: true }).groups, []);
});
