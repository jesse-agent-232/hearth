// Unit tests for src/lib/server/appAccess.js.
// Run: node --test tests/appAccess.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canSeeApp, inGroups, sectionsFor } from '../src/lib/server/appAccess.js';

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

test('inGroups: no groups lets everyone in; with groups, only members', () => {
	assert.equal(inGroups(undefined, null), true);
	assert.equal(inGroups([], alice), true);
	assert.equal(inGroups(['family'], alice), true);
	assert.equal(inGroups(['admins'], alice), false);
	assert.equal(inGroups(['admins'], null), false);
});

// The guest everyone is with auth off, and nobody (auth on, not signed in).
const guest = { username: 'guest', groups: [] };
const slides = [{ type: 'welcome' }];

test('sections: left out, onboarding and privacy are off and the changelog is on', () => {
	for (const user of [alice, guest, null]) {
		assert.deepEqual(sectionsFor({}, user), { onboarding: { enabled: false }, privacy: { enabled: false }, changelog: { enabled: true } });
	}
});

test('sections: enabled: false hides each from everyone, members included', () => {
	const config = {
		onboarding: { enabled: false, groups: ['family'], slides },
		privacy: { enabled: false, groups: ['family'], file: 'privacy.md' },
		changelog: { enabled: false, groups: ['family'] }
	};
	assert.deepEqual(sectionsFor(config, alice), { onboarding: { enabled: false }, privacy: { enabled: false }, changelog: { enabled: false } });
});

test('sections: enabled without groups shows each to everyone, as before', () => {
	const config = { onboarding: { enabled: true, slides }, privacy: { enabled: true, file: 'privacy.md' }, changelog: { enabled: true } };
	for (const user of [alice, bob, guest, null]) {
		const s = sectionsFor(config, user);
		assert.equal(s.onboarding.slides, slides);
		assert.equal(s.privacy.file, 'privacy.md');
		assert.equal(s.changelog.enabled, true);
	}
});

test('sections: with groups, only members get them; anyone else gets no slides or privacy text', () => {
	const config = {
		onboarding: { enabled: true, groups: ['family'], slides },
		privacy: { enabled: true, groups: ['family'], file: 'privacy.md', sections: [{ title: 'Data', items: ['ours'] }] },
		changelog: { enabled: true, groups: ['admins'] }
	};
	const a = sectionsFor(config, alice);
	assert.equal(a.onboarding.slides, slides);
	assert.equal(a.privacy.file, 'privacy.md');
	assert.equal(a.changelog.enabled, false);
	const b = sectionsFor(config, bob);
	assert.deepEqual(b.onboarding, { enabled: false });
	assert.deepEqual(b.privacy, { enabled: false });
	assert.equal(b.changelog.enabled, true);
	// Not signed in yet: the login screen gets no privacy notice, so no agree box.
	assert.deepEqual(sectionsFor(config, null).privacy, { enabled: false });
});

test('sections: with auth off the guest has no groups, so a section with groups is hidden', () => {
	const config = { onboarding: { enabled: true, groups: ['family'], slides }, privacy: { enabled: true, groups: ['family'] }, changelog: { groups: ['admins'] } };
	assert.deepEqual(sectionsFor(config, guest), { onboarding: { enabled: false }, privacy: { enabled: false }, changelog: { enabled: false } });
});
