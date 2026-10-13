// Unit tests for src/lib/server/integrations/accounts.js and the redaction
// of a Calendar's other accounts.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeAccounts, otherAccounts, MAX_ACCOUNTS } from '../../src/lib/server/integrations/accounts.js';
import { redactConfig, isRedacted } from '../../src/lib/server/integrations/serialize.js';

const adapter = {
	multiAccount: true,
	configSchema: [
		{ key: 'url', type: 'url', label: 'CalDAV URL', required: true, fromOperatorDefault: 'default_url' },
		{ key: 'username', type: 'text', label: 'Username', required: true },
		{ key: 'password', type: 'secret', label: 'App password', required: true, trim: false },
		{ key: 'webUrl', type: 'url', link: true, label: 'Web address' }
	]
};
const work = { id: 'w1', url: 'https://mail.example.com/dav/cal/me/', username: 'me', password: 'work pw' };
const stored = { url: 'https://cloud.example.com/', username: 'alice', password: 'home pw', accounts: [work] };
const REDACTED = redactConfig(adapter, { password: 'x' }).password;

test('no submitted list keeps the stored accounts', () => {
	assert.deepEqual(mergeAccounts(adapter, null, stored, undefined), { ok: true, accounts: [work] });
});

test('a new account gets an id; a redacted secret on an existing one keeps it', () => {
	const r = mergeAccounts(adapter, null, stored, [
		{ id: 'w1', url: work.url, username: 'me', password: REDACTED },
		{ id: 'made-up', url: 'https://caldav.fastmail.com/dav/', username: 'bob', password: 'new pw' }
	]);
	assert.equal(r.ok, true);
	assert.deepEqual(r.accounts[0], work);
	assert.notEqual(r.accounts[1].id, 'made-up');
	assert.equal(r.accounts[1].password, 'new pw');
});

test('an account left out is removed', () => {
	assert.deepEqual(mergeAccounts(adapter, null, stored, []), { ok: true, accounts: [] });
});

test('moving an account to another server drops its password', () => {
	const r = mergeAccounts(adapter, null, stored, [{ id: 'w1', url: 'https://evil.example/', username: 'me', password: REDACTED }]);
	assert.equal(r.ok, false);
	assert.match(r.message, /^Account 2: Missing required field: App password/);
	// A link field isn't where the password goes.
	const moved = mergeAccounts(adapter, null, stored, [{ id: 'w1', webUrl: 'https://cal.example.org/', password: REDACTED }]);
	assert.equal(moved.accounts[0].password, 'work pw');
});

test('a redacted secret never borrows from another account', () => {
	const r = mergeAccounts(adapter, null, stored, [{ url: 'https://other.example/', username: 'x', password: REDACTED }]);
	assert.equal(r.ok, false);
});

test('URL rules, the operator URL and the limit apply to every account', () => {
	assert.match(mergeAccounts(adapter, null, stored, [{ url: 'javascript:alert(1)', username: 'x', password: 'y' }]).message, /full http\(s\) URL/);
	const pinned = mergeAccounts(adapter, { default_url: 'https://cal.corp.example/' }, stored, [{ url: 'https://elsewhere.example/', username: 'x', password: 'y' }]);
	assert.equal(pinned.accounts[0].url, 'https://cal.corp.example/');
	const many = Array.from({ length: MAX_ACCOUNTS + 1 }, () => ({ url: 'https://a.example/', username: 'x', password: 'y' }));
	assert.equal(mergeAccounts(adapter, null, stored, many).ok, false);
	assert.equal(mergeAccounts(adapter, null, stored, 'nope').ok, false);
	// Nothing but the schema's fields is kept.
	const extra = mergeAccounts(adapter, null, stored, [{ url: 'https://a.example/', username: 'x', password: 'y', accounts: [work], evil: 1 }]);
	assert.deepEqual(Object.keys(extra.accounts[0]).sort(), ['id', 'password', 'url', 'username']);
});

test('only a multi-account integration has other accounts', () => {
	const single = { configSchema: adapter.configSchema };
	assert.deepEqual(otherAccounts(single, stored), []);
	assert.deepEqual(mergeAccounts(single, null, stored, [{ url: 'https://a.example/', username: 'x', password: 'y' }]), { ok: true, accounts: [] });
	assert.equal(redactConfig(single, stored).accounts, undefined);
});

test('the browser never gets an account password', () => {
	const out = redactConfig(adapter, stored);
	assert.ok(isRedacted(out.password));
	assert.deepEqual(out.accounts, [{ id: 'w1', url: work.url, username: 'me', password: REDACTED }]);
	assert.ok(!JSON.stringify(out).includes('work pw'));
});
