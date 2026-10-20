// Unit tests for the search bar's Transparency and Hints, chosen under
// Configure → Widgets → Search with config.yml's search.transparency and
// search.hints as the defaults.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchTransparency, searchGlassLevel, searchHints, searchLookError } from '../src/lib/searchLook.js';

test("a person's transparency wins over the config default", () => {
	assert.equal(searchTransparency('theme', 'solid'), 'theme');
	assert.equal(searchTransparency('solid', 'theme'), 'solid');
});

test('with no transparency pick, the config default applies, else theme', () => {
	assert.equal(searchTransparency(undefined, 'solid'), 'solid');
	assert.equal(searchTransparency(undefined, undefined), 'theme');
	assert.equal(searchTransparency('clear', undefined), 'theme');
	assert.equal(searchTransparency('misty', 'solid'), 'solid');
});

test("theme follows the page's glass; solid ignores it", () => {
	assert.equal(searchGlassLevel('theme', 'clear'), 'clear');
	assert.equal(searchGlassLevel('theme', undefined), 'frosted');
	assert.equal(searchGlassLevel('solid', 'clear'), 'solid');
});

test("a person's hints pick wins over the config default", () => {
	assert.equal(searchHints('still', 'rotating'), 'still');
	assert.equal(searchHints('rotating', 'still'), 'rotating');
});

test('with no hints pick, the config default applies, else rotating', () => {
	assert.equal(searchHints(undefined, 'still'), 'still');
	assert.equal(searchHints(undefined, undefined), 'rotating');
	assert.equal(searchHints('maybe', 'still'), 'still');
});

test('valid or missing search.transparency and search.hints are accepted', () => {
	assert.equal(searchLookError(undefined), null);
	assert.equal(searchLookError({}), null);
	for (const transparency of ['theme', 'solid']) {
		assert.equal(searchLookError({ transparency }), null);
	}
	assert.equal(searchLookError({ hints: 'rotating' }), null);
	assert.equal(searchLookError({ hints: 'still' }), null);
});

test('any other value is rejected with the reason', () => {
	assert.equal(
		searchLookError({ transparency: 'glass' }),
		'search.transparency must be theme or solid, not "glass"'
	);
	for (const transparency of ['page', 'clear', 'frosted', 'Solid', '', null, 1, true]) {
		assert.match(searchLookError({ transparency }), /^search\.transparency must be /);
	}
	assert.equal(searchLookError({ hints: 'off' }), 'search.hints must be rotating or still, not "off"');
	for (const hints of [true, false, null, 'Still']) {
		assert.match(searchLookError({ hints }), /^search\.hints must be rotating or still/);
	}
});
